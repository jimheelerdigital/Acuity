// AUTH-CRITICAL FILE
// This file owns the mobile Google OAuth flow (useGoogleSignIn) and the
// mobile-callback POST. Any change REQUIRES manual verification of:
//   - Mobile Google OAuth (TestFlight, real device)
//   - Mobile Apple sign-in (TestFlight, real device)
//   - Mobile email + password sign-in (signInWithPassword)
//   - Mobile magic link (requestMagicLink)
// before any OTA push.
//
// expo-auth-session quirks:
//   - useAuthRequest's `request.codeVerifier` reference is fragile across
//     parent re-renders. Wrapping the sign-in screen in a ScrollView
//     destabilized it (2026-04-28 incident, commit f4297d1, reverted in
//     0149c6f). Do NOT add KeyboardAvoidingView/ScrollView around the
//     screen that mounts useGoogleSignIn.
//   - shouldAutoExchangeCode:false is intentional. The library's auto
//     exchange silently fails on iOS in 7.0.10. Manual exchange via
//     AuthSession.exchangeCodeAsync is what works.
//
// See docs/AUTH_HARDENING.md for the full test checklist.

import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { useMemo } from "react";

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
  // Phase 4 dual-source: "stripe" | "apple" | null. Drives the
  // Profile-tab routing for Manage-subscription (Stripe Customer
  // Portal on web vs iOS Settings → Subscriptions for Apple users).
  subscriptionSource?: "stripe" | "apple" | null;
  // ISO-8601 string — matches what /api/user/me returns. Null for
  // freshly-created users before the createUser event writes it,
  // or for users who existed before the 2026-04-20 backfill.
  trialEndsAt?: string | null;
  // Renewal date when subscriptionStatus = "PRO". Used by the delete
  // modal to compute "X days remaining" if the user deletes mid-period.
  // Null on free / trial users.
  stripeCurrentPeriodEnd?: string | null;
  // True when the user has an actual stripeCustomerId on the User row.
  // Flattened by /api/user/me so we don't expose the raw id. PRO users
  // without a Stripe customer (App Store reviewer seed accounts, comped
  // accounts) hide "Manage subscription" — there's nothing to manage
  // and the portal call would 400 NoSubscription.
  hasStripeCustomer?: boolean;
  currentStreak?: number;
  longestStreak?: number;
  lastStreakMilestone?: number | null;
  // Flags flattened from UserOnboarding relation by /api/user/me.
  // `false` when the row doesn't exist OR completedAt is null — both
  // states route the user into the onboarding flow. `true` lets the
  // AuthGate land the user on /(tabs) directly.
  onboardingCompleted?: boolean;
  // 1..10. When the user relaunches mid-flow we resume at this step.
  onboardingStep?: number;
  notificationTime?: string;
  notificationDays?: number[];
  notificationsEnabled?: boolean;
  // Multi-reminder list (Slice C, 2026-05-09). When present + non-
  // empty, the Reminders settings screen renders these as the
  // authoritative list. Legacy single-time fields above are kept in
  // sync via server-side dual-write and used as a fallback for older
  // payloads (lazy backfill on first GET creates a row from them).
  reminders?: Reminder[];
};

export type Reminder = {
  id: string;
  time: string;          // HH:MM local
  daysActive: number[];  // 0=Sunday..6=Saturday
  enabled: boolean;      // per-reminder toggle (master is User.notificationsEnabled)
  sortOrder: number;
};

// ─── Secure storage ────────────────────────────────────────────────
//
// In-memory token cache (2026-05-05 fix): iOS Keychain has a race where
// `SecureStore.setItemAsync` resolves before a subsequent
// `SecureStore.getItemAsync` can read the value. The OAuth fix in
// `8c2734a` worked around this for the sign-in routing decision by
// bypassing `refresh()`, but every downstream `api.*` call (entries,
// life-matrix, goals, tasks, /api/user/me foreground-refresh) still
// hits `getToken()` and reads SecureStore. Production logs after
// Jim's successful sign-in showed 15 × 401 on `/api/entries` over 38
// seconds with empty `logs[]` (no Authorization header attached) —
// the keychain consistently returned null.
//
// Layering an in-memory cache in front of SecureStore makes the
// keychain a hydration source on cold launch, not a hot read on every
// API call. After `setToken` runs, the next `getToken()` returns the
// new value from memory immediately. SecureStore is still written
// (so the token survives app restart) and still read on cold launch
// (when `memoryToken` is null and the keychain has had session-end
// time to settle). Net effect: bearer attaches reliably on every
// post-sign-in API call.
//
// `clearToken` nulls both layers so sign-out and 401-driven cleanup
// work identically to before.

let memoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  // Hot path — sign-in has already populated memory. Return without
  // touching the keychain, sidestepping the setItem→getItem race.
  if (memoryToken) return memoryToken;
  // Cold path — first call after app launch. Hydrate from SecureStore;
  // if a value is present, cache it so subsequent calls skip the
  // keychain entirely.
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (stored) memoryToken = stored;
  return stored;
}

export async function setToken(token: string): Promise<void> {
  // Update memory FIRST so any in-flight getToken() resolves with
  // the new value even if the keychain write is still committing.
  memoryToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  memoryToken = null;
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

// ─── Public API base URL ──────────────────────────────────────────
// Exported so auth-callback and forgot-password screens can call the
// web API without duplicating the config-reading boilerplate.
export function publicApiBaseUrl(): string {
  return apiBaseUrl();
}

// ─── Email / password ─────────────────────────────────────────────

export type PasswordSignInResult =
  | { ok: true; user: User; sessionToken: string }
  | { ok: false; reason: "InvalidCredentials" | "EmailNotVerified" | "RateLimited" | "NetworkError"; detail?: string };

/**
 * Sign in with email + password via /api/auth/mobile-login. On
 * success the session JWT is stored in SecureStore just like the
 * Google path; callers should then invoke AuthContext.refresh() to
 * route to the tabs layout.
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<PasswordSignInResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      sessionToken?: string;
      user?: User;
    };
    if (!res.ok || !body.sessionToken || !body.user) {
      const reason =
        body.error === "EmailNotVerified"
          ? "EmailNotVerified"
          : res.status === 429
          ? "RateLimited"
          : "InvalidCredentials";
      return { ok: false, reason, detail: body.error };
    }
    await setToken(body.sessionToken);
    await setStoredUser(body.user);
    return { ok: true, user: body.user, sessionToken: body.sessionToken };
  } catch (err) {
    return {
      ok: false,
      reason: "NetworkError",
      detail: err instanceof Error ? err.message : "network failure",
    };
  }
}

export type PasswordSignUpResult =
  | { ok: true; requiresVerification: boolean }
  | { ok: false; reason: "AlreadyRegistered" | "WeakPassword" | "InvalidEmail" | "RateLimited" | "NetworkError"; message?: string };

export async function signUpWithPassword(
  email: string,
  password: string,
  name?: string
): Promise<PasswordSignUpResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name ?? null }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      requiresVerification?: boolean;
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      const reason =
        body.error === "AlreadyRegistered"
          ? "AlreadyRegistered"
          : body.error === "WeakPassword"
          ? "WeakPassword"
          : body.error === "InvalidEmail"
          ? "InvalidEmail"
          : res.status === 429
          ? "RateLimited"
          : "NetworkError";
      return { ok: false, reason, message: body.message };
    }
    return {
      ok: true,
      requiresVerification: body.requiresVerification ?? true,
    };
  } catch (err) {
    return {
      ok: false,
      reason: "NetworkError",
      message: err instanceof Error ? err.message : "network failure",
    };
  }
}

export async function requestMagicLink(
  email: string
): Promise<{ ok: true } | { ok: false; reason: "RateLimited" | "InvalidEmail" | "NetworkError" }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, reason: "RateLimited" };
      if (res.status === 400) return { ok: false, reason: "InvalidEmail" };
      return { ok: false, reason: "NetworkError" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "NetworkError" };
  }
}

export async function requestPasswordReset(
  email: string
): Promise<{ ok: true } | { ok: false; reason: "RateLimited" | "InvalidEmail" | "NetworkError" }> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, reason: "RateLimited" };
      if (res.status === 400) return { ok: false, reason: "InvalidEmail" };
      return { ok: false, reason: "NetworkError" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "NetworkError" };
  }
}

/**
 * Exchange a mobile-magic-link token for a session JWT. Called by
 * the deep-link handler at app/auth-callback.tsx when iOS routes an
 * acuity://auth-callback?token=… URL to the app.
 */
export async function completeMobileMagicLink(
  token: string
): Promise<PasswordSignInResult> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      sessionToken?: string;
      user?: User;
    };
    if (!res.ok || !body.sessionToken || !body.user) {
      return {
        ok: false,
        reason: "InvalidCredentials",
        detail: body.error,
      };
    }
    await setToken(body.sessionToken);
    await setStoredUser(body.user);
    return { ok: true, user: body.user, sessionToken: body.sessionToken };
  } catch (err) {
    return {
      ok: false,
      reason: "NetworkError",
      detail: err instanceof Error ? err.message : "network failure",
    };
  }
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
    "https://getacuity.io"
  );
}

/**
 * Debug payload attached to failure results. Populated piecemeal as
 * the signIn flow runs through prompt → token extraction → server
 * callback. Temporary — exists to surface diagnostics on-device
 * while we stabilize the auth flow, since TestFlight builds don't
 * pipe console.log anywhere Jim can read. Remove once sign-in
 * ships cleanly.
 */
export type AuthDebug = {
  redirectUri?: string;
  responseType?: string;
  paramsKeys?: string[];
  hasAuthentication?: boolean;
  hasAuthenticationIdToken?: boolean;
  hasParamsIdToken?: boolean;
  idTokenSource?: "authentication.idToken" | "params.id_token" | "exchange" | "none";
  // Manual PKCE code-exchange diagnostics. Set when the flow reaches
  // the explicit exchange call (see 2026-04-20 sign-in revision —
  // Google's iOS code flow returns an auth code, not an id_token, so
  // we exchange it ourselves at oauth2.googleapis.com/token).
  exchangeAttempted?: boolean;
  exchangeSuccess?: boolean;
  exchangeHasIdToken?: boolean;
  exchangeError?: string;
  callbackStatus?: number;
  callbackError?: string;
};

export type SignInResult =
  | { ok: true; user: User; sessionToken: string }
  | {
      ok: false;
      reason: "cancelled" | "no_token" | "server_error";
      detail?: string;
      debug?: AuthDebug;
    };

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

  // Google's iOS OAuth clients only accept the reversed-client-ID scheme
  // as a redirect URI at the token-exchange endpoint. expo-auth-session's
  // Google provider defaults to `${bundleId}:/oauthredirect` which Google
  // rejects with redirect_uri_mismatch on the code exchange — producing
  // the silent "no id_token" symptom we hit post-first-build. The
  // commented-out line in node_modules/expo-auth-session/build/providers/
  // Google.js shows this exact format as the intended alternative.
  //
  // The matching scheme is registered in app.json's
  // ios.infoPlist.CFBundleURLTypes. Any change to iosClientId requires
  // updating that array too.
  const redirectUri = useMemo(() => {
    if (!iosClientId) return undefined;
    // Client id looks like `12345-abc.apps.googleusercontent.com`; the
    // reversed form is the client id with the domain moved to the front,
    // lowercased, used as a custom URL scheme.
    const clientSuffix = iosClientId.replace(
      ".apps.googleusercontent.com",
      ""
    );
    const reversed = `com.googleusercontent.apps.${clientSuffix}`;
    return AuthSession.makeRedirectUri({
      native: `${reversed}:/oauthredirect`,
    });
  }, [iosClientId]);

  // Google.useAuthRequest (not useIdTokenAuthRequest) — the debug
  // overlay from c1a1803 revealed Google's iOS OAuth flow returns an
  // authorization CODE, not an id_token. The Google provider's
  // `useIdTokenAuthRequest` is supposed to auto-exchange the code via
  // AccessTokenRequest, but in expo-auth-session@7.0.10 that exchange
  // was silently failing — fullResult never carried authentication
  // or id_token, only the raw `code` from the redirect.
  //
  // Solution: switch to useAuthRequest with shouldAutoExchangeCode:false
  // (so the library doesn't burn the single-use code on a failing
  // internal exchange) and perform the exchange explicitly below with
  // AuthSession.exchangeCodeAsync. That gives us visibility into any
  // Google token-endpoint errors.
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId,
    clientId: iosClientId,
    redirectUri,
    shouldAutoExchangeCode: false,
  });

  // Log response transitions so Jim can read the Metro logs during
  // first-build QA without having to re-instrument the screen. We log
  // every transition (not just failures) because the no_token branch
  // is opaque without seeing the prior steps.

  const signIn = async (): Promise<SignInResult> => {
    // Accumulator — every failure return attaches this so the UI can
    // surface a readable diagnostic. Temporary debug aid.
    const debug: AuthDebug = { redirectUri };

    if (!iosClientId) {
      return {
        ok: false,
        reason: "server_error",
        detail:
          "Google iOS client id not configured. See docs/iOS_LAUNCH_CHECKLIST.md.",
        debug,
      };
    }

    let promptResult: AuthSession.AuthSessionResult;
    try {
      promptResult = await promptAsync();
    } catch (err) {
      return {
        ok: false,
        reason: "server_error",
        detail: err instanceof Error ? err.message : "prompt failed",
        debug,
      };
    }

    debug.responseType = promptResult.type;

    if (promptResult.type === "cancel" || promptResult.type === "dismiss") {
      return { ok: false, reason: "cancelled", debug };
    }
    if (promptResult.type !== "success") {
      return {
        ok: false,
        reason: "server_error",
        detail: `prompt type ${promptResult.type}`,
        debug,
      };
    }

    // Populate the debug snapshot from the success-shape response
    // BEFORE reading tokens, so the alert shows the shape Google
    // returned even when extraction later fails.
    debug.paramsKeys = Object.keys(promptResult.params ?? {});
    debug.hasAuthentication = Boolean(promptResult.authentication);
    debug.hasAuthenticationIdToken = Boolean(
      promptResult.authentication?.idToken
    );
    debug.hasParamsIdToken = Boolean(promptResult.params?.id_token);

    // Google's iOS OAuth flow returns an authorization code (PKCE).
    // Exchange it for an id_token at Google's token endpoint. No
    // client secret needed — iOS clients are public clients; PKCE's
    // code_verifier is the proof of possession. `request.codeVerifier`
    // is the value generated when useAuthRequest built the initial
    // auth URL.
    const code = promptResult.params?.code;
    if (!code) {
      // params.id_token fallback in case a future expo-auth-session
      // release reintroduces the implicit-flow-on-iOS path.
      const implicitIdToken = promptResult.params?.id_token;
      if (implicitIdToken) {
        debug.idTokenSource = "params.id_token";
        return await callMobileCallback(implicitIdToken, debug);
      }
      debug.idTokenSource = "none";
      return { ok: false, reason: "no_token", debug };
    }

    if (!request?.codeVerifier) {
      debug.idTokenSource = "none";
      debug.exchangeError = "missing codeVerifier — request not ready";
      return { ok: false, reason: "no_token", debug };
    }

    debug.exchangeAttempted = true;
    let exchangedIdToken: string | null = null;
    try {
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: iosClientId,
          code,
          redirectUri: redirectUri ?? "",
          extraParams: { code_verifier: request.codeVerifier },
        },
        { tokenEndpoint: "https://oauth2.googleapis.com/token" }
      );
      // TokenResponse exposes idToken via the `idToken` field
      // (expo-auth-session camelCases the OIDC field names).
      exchangedIdToken = tokenResult.idToken ?? null;
      debug.exchangeSuccess = true;
      debug.exchangeHasIdToken = Boolean(exchangedIdToken);
    } catch (err) {
      debug.exchangeSuccess = false;
      debug.exchangeError =
        err instanceof Error ? err.message : "exchange failed";
      return {
        ok: false,
        reason: "server_error",
        detail: debug.exchangeError,
        debug,
      };
    }

    if (!exchangedIdToken) {
      debug.idTokenSource = "none";
      return { ok: false, reason: "no_token", debug };
    }

    debug.idTokenSource = "exchange";
    return await callMobileCallback(exchangedIdToken, debug);
  };

  /**
   * POST the verified id_token to our server, store the session JWT
   * on success. Extracted from the main flow so the implicit-flow
   * fallback and the code-exchange path share one implementation.
   */
  const callMobileCallback = async (
    idToken: string,
    debug: AuthDebug
  ): Promise<SignInResult> => {

    try {
      const res = await fetch(`${apiBaseUrl()}/api/auth/mobile-callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleIdToken: idToken }),
      });
      debug.callbackStatus = res.status;
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        debug.callbackError = body.error ?? `HTTP ${res.status}`;
        return {
          ok: false,
          reason: "server_error",
          detail: body.error ?? `HTTP ${res.status}`,
          debug,
        };
      }
      const body = (await res.json()) as {
        sessionToken: string;
        user: User;
      };
      await setToken(body.sessionToken);
      await setStoredUser(body.user);
      return { ok: true, user: body.user, sessionToken: body.sessionToken };
    } catch (err) {
      debug.callbackError =
        err instanceof Error ? err.message : "network failure";
      return {
        ok: false,
        reason: "server_error",
        detail: err instanceof Error ? err.message : "network failure",
        debug,
      };
    }
  };

  return {
    signIn,
    ready: Boolean(request) && Boolean(iosClientId),
    hasClientId: Boolean(iosClientId),
  };
}
