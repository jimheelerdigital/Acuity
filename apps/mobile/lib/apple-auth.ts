import * as AppleAuthentication from "expo-apple-authentication";
import * as SecureStore from "expo-secure-store";

import {
  publicApiBaseUrl,
  setStoredUser,
  setToken,
  type User,
} from "@/lib/auth";

/**
 * Sign in with Apple — native iOS flow.
 *
 * Apple's quirk: on the FIRST sign-in only, the OS hands back the
 * user's `email` + `fullName`. On subsequent sign-ins those fields
 * are null. To keep the user's display name across sign-outs we
 * stash both in expo-secure-store keyed on Apple's stable user id
 * (`credential.user`, same as the `sub` claim on the identity token).
 *
 * The server (POST /api/auth/mobile-callback-apple) is the source of
 * truth — it verifies the identityToken's signature against Apple's
 * JWKS, finds-or-creates the User row by `appleSubject`, and issues
 * a NextAuth-compatible session JWT we save in SecureStore.
 */

const NAME_CACHE_PREFIX = "acuity_apple_name_";
const EMAIL_CACHE_PREFIX = "acuity_apple_email_";

export type AppleSignInResult =
  | { ok: true; user: User }
  | {
      ok: false;
      reason:
        | "Cancelled"
        | "Unavailable"
        | "NoIdentityToken"
        | "ServerRejected"
        | "NetworkError";
      detail?: string;
    };

export async function isAppleSignInAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<AppleSignInResult> {
  if (!(await isAppleSignInAvailable())) {
    return { ok: false, reason: "Unavailable" };
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    // Apple's SDK throws ERR_REQUEST_CANCELED when the user dismisses
    // the sheet. Treat that as a soft cancel rather than an error.
    const code = (err as { code?: string }).code;
    if (code === "ERR_REQUEST_CANCELED") {
      return { ok: false, reason: "Cancelled" };
    }
    return {
      ok: false,
      reason: "Unavailable",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!credential.identityToken) {
    return { ok: false, reason: "NoIdentityToken" };
  }

  // Cache name + email on first auth, retrieve on subsequent.
  const appleUserId = credential.user;
  const nameKey = NAME_CACHE_PREFIX + appleUserId;
  const emailKey = EMAIL_CACHE_PREFIX + appleUserId;

  let cachedName: { givenName?: string; familyName?: string } | null = null;
  if (credential.fullName) {
    const given = credential.fullName.givenName ?? "";
    const family = credential.fullName.familyName ?? "";
    if (given || family) {
      cachedName = { givenName: given, familyName: family };
      try {
        await SecureStore.setItemAsync(nameKey, JSON.stringify(cachedName));
      } catch {
        // Non-fatal — server will still create the user; just no
        // display name on subsequent re-installs.
      }
    }
  }
  if (!cachedName) {
    try {
      const raw = await SecureStore.getItemAsync(nameKey);
      if (raw) cachedName = JSON.parse(raw) as typeof cachedName;
    } catch {
      // Ignore corrupted cache; user just won't have a name.
    }
  }

  let cachedEmail: string | null = null;
  if (credential.email) {
    cachedEmail = credential.email;
    try {
      await SecureStore.setItemAsync(emailKey, credential.email);
    } catch {
      // Non-fatal.
    }
  } else {
    try {
      cachedEmail = await SecureStore.getItemAsync(emailKey);
    } catch {
      cachedEmail = null;
    }
  }

  // Hand off to the server.
  let res: Response;
  try {
    res = await fetch(`${publicApiBaseUrl()}/api/auth/mobile-callback-apple`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityToken: credential.identityToken,
        appleUserId,
        fullName: cachedName,
        email: cachedEmail,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      reason: "NetworkError",
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "ServerRejected", detail };
  }

  const body = (await res.json().catch(() => null)) as {
    sessionToken?: string;
    user?: User;
  } | null;
  if (!body?.sessionToken || !body?.user) {
    return {
      ok: false,
      reason: "ServerRejected",
      detail: "Server response missing sessionToken or user",
    };
  }

  await setToken(body.sessionToken);
  await setStoredUser(body.user);

  return { ok: true, user: body.user };
}
