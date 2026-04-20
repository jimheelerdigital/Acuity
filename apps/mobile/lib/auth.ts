import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

// Required for expo-auth-session on web + some Expo Go edge cases.
// No-op on native iOS but safe to call anywhere.
WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "acuity_session_token";
const USER_KEY = "acuity_user";

export type User = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  subscriptionStatus?: string;
  // ISO-8601 string — matches what /api/user/me returns. Null for
  // freshly-created users before the createUser event writes it,
  // or for users who existed before the 2026-04-20 backfill.
  trialEndsAt?: string | null;
};

// ─── Secure storage ────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getStoredUser(): Promise<User | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function setStoredUser(user: User): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function clearStoredUser(): Promise<void> {
  await SecureStore.deleteItemAsync(USER_KEY);
}

export async function signOut(): Promise<void> {
  // Mobile sign-out is local-only: the NextAuth JWT issued by
  // /api/auth/mobile-callback is a bearer token with no server-side
  // revocation list (revoking would require a blocklist table or
  // short-lived tokens with refresh, neither of which we have yet).
  // Dropping the token from secure-store is enough — the token is
  // the only thing authenticating mobile API calls.
  await clearToken();
  await clearStoredUser();
}

// ─── Google OAuth ───────────────────────────────────────────────────

/**
 * Reads the iOS OAuth client id from app.json's `extra` block.
 * Populated by Jim after creating the iOS OAuth client in Google
 * Cloud Console. See docs/iOS_LAUNCH_CHECKLIST.md Part A.
 *
 * Fallback to EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID so dev builds can
 * swap ids without editing app.json.
 */
function googleIosClientId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    | { googleIosClientId?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
    extra?.googleIosClientId ??
    undefined
  );
}

function apiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as
    | { apiUrl?: string }
    | undefined;
  return (
    process.env.EXPO_PUBLIC_API_URL ??
    extra?.apiUrl ??
    "https://www.getacuity.io"
  );
}

export type SignInResult =
  | { ok: true; user: User }
  | { ok: false; reason: "cancelled" | "no_token" | "server_error"; detail?: string };

/**
 * React hook exposing the Google sign-in flow. Call the returned
 * `signIn()` function to start the OS-level auth dialog; it resolves
 * with the authenticated User on success or a reason code on failure.
 *
 * Usage (from sign-in.tsx):
 *   const { signIn, ready } = useGoogleSignIn();
 *   <Pressable onPress={signIn} disabled={!ready}>…</Pressable>
 *
 * Uses Google's native-app OAuth flow via expo-auth-session, which
 * opens the system browser (ASWebAuthenticationSession on iOS) and
 * returns an ID token. The ID token goes to /api/auth/mobile-callback
 * which verifies it with Google, creates/finds the user, and returns
 * a long-lived NextAuth-compatible session JWT we store in
 * SecureStore.
 *
 * Why a hook and not a plain function: Google.useIdTokenAuthRequest
 * owns the promptAsync closure and the redirect handling. Easier to
 * stay inside the hook than reconstruct the discovery document
 * manually.
 */
export function useGoogleSignIn() {
  const iosClientId = googleIosClientId();

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId,
    // The web client id is also accepted by /api/auth/mobile-callback's
    // audience check as a fallback for Expo Go dev flows (no iOS
    // entitlements available in Expo Go). For TestFlight/App Store
    // builds the iosClientId above is authoritative.
    clientId: iosClientId,
  });

  // Log response transitions so Jim can read the Metro logs during
  // first-build QA without having to re-instrument the screen. We log
  // every transition (not just failures) because the no_token branch
  // is opaque without seeing the prior steps.
  useEffect(() => {
    if (!response) return;
    // eslint-disable-next-line no-console
    console.log("[auth] Google response.type:", response.type);
    if (response.type === "success") {
      // eslint-disable-next-line no-console
      console.log(
        "[auth] params keys:",
        Object.keys(response.params ?? {}),
        "authentication:",
        response.authentication
          ? {
              hasIdToken: Boolean(response.authentication.idToken),
              hasAccessToken: Boolean(response.authentication.accessToken),
              tokenType: response.authentication.tokenType,
            }
          : null
      );
    } else if ("error" in response) {
      // eslint-disable-next-line no-console
      console.log("[auth] Google response error:", response.error);
    }
  }, [response]);

  const signIn = async (): Promise<SignInResult> => {
    if (!iosClientId) {
      return {
        ok: false,
        reason: "server_error",
        detail:
          "Google iOS client id not configured. See docs/iOS_LAUNCH_CHECKLIST.md.",
      };
    }

    let promptResult: AuthSession.AuthSessionResult;
    try {
      promptResult = await promptAsync();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.log("[auth] promptAsync threw:", err);
      return {
        ok: false,
        reason: "server_error",
        detail: err instanceof Error ? err.message : "prompt failed",
      };
    }

    // eslint-disable-next-line no-console
    console.log("[auth] promptAsync result type:", promptResult.type);

    if (promptResult.type === "cancel" || promptResult.type === "dismiss") {
      return { ok: false, reason: "cancelled" };
    }
    if (promptResult.type !== "success") {
      return {
        ok: false,
        reason: "server_error",
        detail: `prompt type ${promptResult.type}`,
      };
    }

    // The id token shows up in one of two places depending on whether
    // the iOS flow used the implicit-id_token variant or the
    // code-exchange variant:
    //   - params.id_token: implicit flow (web-style, rarely hit on iOS)
    //   - authentication.idToken: code-exchange flow (the normal iOS path;
    //     expo-auth-session's Google provider auto-exchanges the code
    //     for an id_token after the redirect fires)
    // Prefer authentication.idToken because it's the canonical post-
    // exchange value; fall back to params.id_token in case a future
    // expo-auth-session release flips the spread order in Google.js.
    const idToken =
      promptResult.authentication?.idToken ??
      promptResult.params?.id_token ??
      null;

    // eslint-disable-next-line no-console
    console.log(
      "[auth] idToken source:",
      promptResult.authentication?.idToken
        ? "authentication.idToken"
        : promptResult.params?.id_token
          ? "params.id_token"
          : "NEITHER"
    );

    if (!idToken) {
      return { ok: false, reason: "no_token" };
    }

    try {
      const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleIdToken: idToken }),
      });
      // eslint-disable-next-line no-console
      console.log("[auth] mobile-callback HTTP:", res.status);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        // eslint-disable-next-line no-console
        console.log("[auth] mobile-callback error body:", body);
        return {
          ok: false,
          reason: "server_error",
          detail: body.error ?? `HTTP ${res.status}`,
        };
      }
      const body = (await res.json()) as {
        sessionToken: string;
        user: User;
      };
      await setToken(body.sessionToken);
      await setStoredUser(body.user);
      return { ok: true, user: body.user };
    } catch (err) {
      return {
        ok: false,
        reason: "server_error",
        detail: err instanceof Error ? err.message : "network failure",
      };
    }
  };

  return {
    signIn,
    ready: Boolean(request) && Boolean(iosClientId),
    hasClientId: Boolean(iosClientId),
  };
}
