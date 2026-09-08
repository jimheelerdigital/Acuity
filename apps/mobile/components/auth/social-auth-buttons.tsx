// AUTH-CRITICAL FILE
// Rendered by BOTH app/(auth)/sign-in.tsx and app/(auth)/sign-up.tsx.
// A change here changes both screens, so the manual verification checklist
// in sign-in.tsx (and docs/AUTH_HARDENING.md) applies to any edit:
//   - Mobile Google OAuth (TestFlight), sign-in AND sign-up
//   - Mobile Apple sign-in, sign-in AND sign-up
// before any OTA or production deploy.

import * as AppleAuthentication from "expo-apple-authentication";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Text, View } from "react-native";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { isAppleSignInAvailable, signInWithApple } from "@/lib/apple-auth";
import { googlePlatformClientId, type User } from "@/lib/auth";
import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Shared Apple + Google auth block.
 *
 * ── Why this is one component ────────────────────────────────────────
 * These buttons and their handlers previously existed only on sign-in,
 * and sign-up shipped without them. The two screens drifting is the bug;
 * a shared component is the fix, so a future provider (or a change to the
 * post-auth handoff) lands on both screens by construction.
 *
 * ── OAuth sign-up IS OAuth sign-in ───────────────────────────────────
 * Both screens call exactly the same code. Apple/Google return an
 * identity, the callback creates the account if it does not exist and
 * signs in if it does — there is no separate sign-up endpoint. Only the
 * Apple button's LABEL differs, which is what `appleButtonType` selects.
 *
 * ── The loading contract ─────────────────────────────────────────────
 * `loading` is shared with the host screen's own email/password state so
 * every button on the screen disables together. That is why the type is a
 * union rather than a boolean: a boolean cannot say WHICH provider is
 * mid-flight, and the Apple button needs that to swap itself for a
 * spinner.
 *
 * ── ⚠️ Layout constraint on the host screen ──────────────────────────
 * Do NOT render this inside `KeyboardAwareScreen`. Its
 * `automaticallyAdjustKeyboardInsets` re-layouts the ScrollView while
 * `promptAsync()` has the SFAuthenticationSession sheet open, which tears
 * the sheet down and returns `cancelled` (regression f4297d1, 2026-04-28,
 * reverted in 0149c6f). See the header of
 * `components/keyboard-aware-screen.tsx`. A plain ScrollView is fine —
 * it does not re-layout on keyboard events — and is what the other
 * OAuth+form screens use.
 */

/**
 * Which buttons are mid-flight. Shared across the social block and the
 * host screen's own email/password paths so they disable as one set.
 * Exported here rather than redeclared per screen.
 */
export type AuthLoading =
  | "google"
  | "apple"
  | "password"
  | "magic"
  | null;

export interface SocialAuthButtonsProps {
  loading: AuthLoading;
  setLoading: (v: AuthLoading) => void;
  /**
   * Called with the user and session token on success. Pass
   * `setAuthenticatedUser` from `useAuth()`.
   *
   * Deliberately NOT a `refresh()` — iOS Keychain has a window where
   * `setItemAsync` resolves before `getItemAsync` sees the value, so a
   * refresh reads null, `/api/user/me` 401s, and the user is stranded on
   * the auth screen (diagnosed 2026-05-04 across multiple users). Handing
   * the session token straight to the setter also writes it into
   * tokenBridge synchronously — see lib/token-bridge.ts.
   */
  onAuthenticated: (user: User, sessionToken: string) => void;
  tokens: AcuityTokens;
  /**
   * SIGN_IN → "Sign in with Apple"; SIGN_UP → "Sign up with Apple".
   * Apple's HIG expects the label to match the screen's intent even
   * though the underlying call is identical.
   */
  appleButtonType: AppleAuthentication.AppleAuthenticationButtonType;
  /** Copy shown beside the spinner while Apple is mid-flight. */
  appleBusyLabel?: string;
}

export function SocialAuthButtons({
  loading,
  setLoading,
  onAuthenticated,
  tokens,
  appleButtonType,
  appleBusyLabel = "Signing in…",
}: SocialAuthButtonsProps) {
  // Whether Google is configured for THIS platform. A plain check, not a
  // hook, so we can gate MOUNTING the Google hook: mounting
  // `useGoogleSignIn` on Android with androidClientId unset throws on
  // render and crashes the app on launch (fixed 2026-07-07).
  const hasGoogleClientId = Boolean(googlePlatformClientId());

  const [appleAvailable, setAppleAvailable] = useState(false);

  // Apple sign-in is iOS 13+ on physical devices. Hide the button when
  // unavailable rather than render-then-fail.
  useEffect(() => {
    if (Platform.OS !== "ios") {
      setAppleAvailable(false);
      return;
    }
    let cancelled = false;
    isAppleSignInAvailable().then((ok) => {
      if (!cancelled) setAppleAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleApple() {
    setLoading("apple");
    const result = await signInWithApple();
    setLoading(null);

    if (!result.ok) {
      if (result.reason === "Cancelled") return;
      Alert.alert(
        "Sign-in failed",
        result.reason === "Unavailable"
          ? "Apple sign-in isn't available on this device."
          : result.reason === "NoIdentityToken"
            ? "Apple didn't return a sign-in token. Try again."
            : result.reason === "NetworkError"
              ? "Can't reach Ripple. Check your connection and try again."
              : "Please try again or use email."
      );
      return;
    }
    onAuthenticated(result.user, result.sessionToken);
  }

  return (
    <>
      {/* Apple — iOS only. Required by App Store Guideline 4.8 whenever a
          third-party sign-in is offered. Renders the native button via
          AppleAuthenticationButton; our own state still drives the
          loading swap and the post-auth handoff. */}
      {appleAvailable && (
        <View style={{ marginBottom: 12 }}>
          {loading === "apple" ? (
            <View
              className="w-full flex-row items-center justify-center gap-3 rounded-xl px-4 py-3.5"
              style={{ backgroundColor: "#000000", height: 48 }}
            >
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text
                style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}
              >
                {appleBusyLabel}
              </Text>
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={appleButtonType}
              // Both auth screens sit on the dark canvas. Apple's HIG
              // requires the button to contrast clearly with it; BLACK on
              // dark made the button essentially invisible and build-40
              // review rejected under Guideline 4. WHITE is Apple's
              // recommended choice for dark backgrounds.
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              }
              cornerRadius={12}
              style={{ width: "100%", height: 48 }}
              onPress={() => {
                if (loading === null) handleApple();
              }}
            />
          )}
        </View>
      )}

      {/* Google — only MOUNTED when the platform's Google client id is
          configured. On Android with androidClientId unset we skip it (and
          the expo-auth-session hook it uses, which throws on render) so the
          screen can't crash; users continue with email or Apple. */}
      {hasGoogleClientId && (
        <GoogleSignInButton
          loading={loading}
          setLoading={setLoading}
          onAuthenticated={onAuthenticated}
          tokens={tokens}
        />
      )}
    </>
  );
}
