// AUTH-CRITICAL FILE
// Any change to this file or its render tree REQUIRES manual verification of:
//   - Web Google OAuth (getacuity.io/auth/signin → Continue with Google)
//   - Web Apple sign-in (if applicable)
//   - Web email + password sign-in
//   - Mobile Google OAuth (TestFlight)
//   - Mobile Apple sign-in
// before any OTA or production deploy.
//
// Past regressions:
//   - 2026-04-28: KeyboardAwareScreen wrapper (commit f4297d1) silently broke
//     Google OAuth on mobile — parent ScrollView re-layout dismissed the
//     SFAuthenticationSession modal and promptAsync() returned `cancelled`.
//     Reverted in 0149c6f.
//   - 2026-04-28: Schema-vs-DB column drift on User.signupUtm* (commit
//     48e9245 declared columns; prisma db push hadn't reached prod) broke
//     web Google sign-in via P2022 in PrismaAdapter.createUser → bootstrap.
//     Schema pushed; bootstrap-user hardened in 04b729f.
//
// See docs/AUTH_HARDENING.md for the full test checklist.

import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import {
  googlePlatformClientId,
  requestMagicLink,
  signInWithPassword,
} from "@/lib/auth";
import { isAppleSignInAvailable, signInWithApple } from "@/lib/apple-auth";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { WARN_AMBER } from "@/lib/tone-colors";

type Loading = "google" | "apple" | "password" | "magic" | null;

/**
 * Mobile sign-in. Three paths, all of which end with a session JWT
 * in SecureStore and AuthContext.refresh() routing to the (tabs) layout:
 *
 *   1. Continue with Google — PKCE flow via expo-auth-session.
 *   2. Email + password — POST /api/auth/mobile-login.
 *   3. Email me a link — POST /api/auth/mobile-magic-link, user taps
 *      email link on this device → acuity://auth-callback?token=X →
 *      app/auth-callback.tsx exchanges for a JWT.
 */
export default function SignInScreen() {
  const { setAuthenticatedUser } = useAuth();
  const { tokens } = useTheme();
  // Whether Google sign-in is configured for THIS platform. Plain check (no
  // hook) so we can gate MOUNTING the Google hook: mounting `useGoogleSignIn`
  // on Android with androidClientId unset throws on render and crashes the app
  // on launch (fixed 2026-07-07 — render <GoogleSignInButton> only when true).
  const hasGoogleClientId = Boolean(googlePlatformClientId());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<Loading>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Apple sign-in is iOS 13+ on physical devices. Hide the button if
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
              ? "Can't reach Acuity. Check your connection and try again."
              : "Please try again or use email."
      );
      return;
    }
    // Use the user we just received from the callback rather than
    // refresh()'ing through SecureStore. iOS Keychain has a brief
    // window where setItemAsync resolves before getItemAsync sees
    // the value — refresh() reads null, /api/user/me returns 401
    // (no Authorization header), and the user is stranded on the
    // sign-in screen. Diagnosed 2026-05-04 across multiple users.
    //
    // Build 29 (2026-05-06): also hand the sessionToken to the
    // setter so it writes into tokenBridge synchronously. Builds
    // 27-28 relied on lib/auth's memoryToken closure populating
    // correctly, but production diagnostics showed the closure
    // wasn't holding — see lib/token-bridge.ts for the saga.
    setAuthenticatedUser(result.user, result.sessionToken);
  }

  async function handlePassword() {
    if (!email.trim() || !password) return;
    setLoading("password");
    const result = await signInWithPassword(email.trim(), password);
    setLoading(null);

    if (!result.ok) {
      Alert.alert(
        "Sign-in failed",
        result.reason === "EmailNotVerified"
          ? "Please verify your email first. Check your inbox for the link."
          : result.reason === "RateLimited"
          ? "Too many attempts. Wait an hour before trying again."
          : "Incorrect email or password."
      );
      return;
    }
    // See handleApple comment — same SecureStore race avoidance.
    // Applies uniformly to all sign-in paths even though the bug
    // was first reported on Google + Apple; the password path uses
    // the same setToken→refresh sequence and is exposed to the
    // same race. Build-29 tokenBridge hand-off applies here too.
    setAuthenticatedUser(result.user, result.sessionToken);
  }

  async function handleMagic() {
    if (!email.trim()) {
      Alert.alert("Enter your email", "We need somewhere to send the link.");
      return;
    }
    setLoading("magic");
    const result = await requestMagicLink(email.trim());
    setLoading(null);

    if (!result.ok) {
      Alert.alert(
        "Couldn't send link",
        result.reason === "RateLimited"
          ? "Too many attempts. Wait an hour before trying again."
          : "Please check your email address and try again."
      );
      return;
    }
    setMagicSent(true);
  }

  if (magicSent) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: tokens.bg }}
      >
        <Text className="text-4xl mb-4">📬</Text>
        <Text
          className="text-xl font-bold mb-2"
          style={{ color: tokens.text }}
        >
          Check your inbox
        </Text>
        <Text
          className="text-sm text-center leading-relaxed mb-6"
          style={{ color: tokens.textSec }}
        >
          We sent a sign-in link to {email}. Open it on this device — it&apos;ll hand off to Acuity automatically.
        </Text>
        <Pressable
          onPress={() => {
            setMagicSent(false);
            setLoading(null);
          }}
          className="px-4 py-2"
        >
          <Text className="text-sm" style={{ color: tokens.primary }}>
            Use a different email
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    // Sign-in screen intentionally does NOT use KeyboardAwareScreen.
    // The expo-auth-session Google flow opens a SFAuthenticationSession
    // browser modal via promptAsync(); on TestFlight Build 21 with the
    // KeyboardAwareScreen wrapper (commit f4297d1, OTA shipped 2026-04-28)
    // the parent ScrollView destabilized the auth-session promise so
    // the user was bounced back to sign-in with no token. Reverting to
    // the pre-wrapper layout. The sign-in screen has 2 short inputs and
    // a tall stack of OAuth buttons — it doesn't actually need keyboard
    // avoidance for the password field to stay visible (the page is
    // already centered on viewport). Onboarding / sign-up / forgot-
    // password / delete-modal keep the wrapper since they have more
    // inputs and benefit from it.
    <SafeAreaView
      className="flex-1 px-6"
      style={{ backgroundColor: tokens.bg }}
    >
      <View className="flex-1 justify-center">
        <View
          className="h-16 w-16 rounded-2xl items-center justify-center mb-8 self-center"
          style={{ backgroundColor: tokens.primary }}
        >
          <Text className="text-3xl" style={{ color: "#FFFFFF" }}>
            A
          </Text>
        </View>

        <Text
          className="text-2xl font-bold mb-1 text-center"
          style={{ color: tokens.text }}
        >
          Sign in to Acuity
        </Text>
        <Text
          className="text-sm mb-8 text-center"
          style={{ color: tokens.textTer }}
        >
          Your nightly recording, pattern recognition across your own words.
        </Text>

        {/* Apple — iOS only. Required by App Store Guideline 4.8
            whenever a third-party sign-in is offered. Renders the
            native button via AppleAuthenticationButton; we still
            allow our own state to drive the loading + post-auth nav. */}
        {appleAvailable && (
          <View style={{ marginBottom: 12 }}>
            {loading === "apple" ? (
              <View
                className="w-full flex-row items-center justify-center gap-3 rounded-xl px-4 py-3.5"
                style={{ backgroundColor: "#000000", height: 48 }}
              >
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}>
                  Signing in…
                </Text>
              </View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                }
                // Sign-in screen forces dark background (`dark:bg-[#0B0B12]`)
                // — Apple HIG requires the button to contrast clearly with
                // the surrounding canvas. BLACK style on dark made the
                // button essentially invisible; build-40 review rejected
                // under Guideline 4 for this reason. WHITE style is
                // Apple's recommended choice for dark backgrounds.
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
            screen can't crash; users sign in with email or Apple instead. */}
        {hasGoogleClientId && (
          <GoogleSignInButton
            loading={loading}
            setLoading={setLoading}
            onAuthenticated={setAuthenticatedUser}
            tokens={tokens}
          />
        )}

        {/* Divider */}
        <View className="flex-row items-center gap-3 my-3">
          <View
            className="h-px flex-1"
            style={{ backgroundColor: tokens.line }}
          />
          <Text
            className="text-xs"
            style={{ color: tokens.textTer }}
          >
            or
          </Text>
          <View
            className="h-px flex-1"
            style={{ backgroundColor: tokens.line }}
          />
        </View>

        {/* Email + password */}
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={tokens.textTer}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          className="w-full rounded-xl border px-4 py-3 mb-3"
          style={{
            borderColor: tokens.line,
            backgroundColor: tokens.cardBg,
            color: tokens.text,
          }}
        />
        <View className="relative w-full mb-3">
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={tokens.textTer}
            secureTextEntry={!showPassword}
            autoComplete="password"
            className="w-full rounded-xl border pl-4 pr-12 py-3"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.cardBg,
              color: tokens.text,
            }}
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              showPassword ? "Hide password" : "Show password"
            }
            className="absolute right-3 top-0 bottom-0 justify-center"
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={tokens.textTer}
            />
          </Pressable>
        </View>
        <Pressable
          onPress={handlePassword}
          disabled={loading !== null || !email.trim() || !password}
          className="w-full rounded-xl px-4 py-3.5 items-center"
          style={{
            backgroundColor: tokens.text,
            opacity:
              loading !== null || !email.trim() || !password
                ? 0.5
                : 1,
          }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: tokens.bg }}
          >
            {loading === "password" ? "Signing in…" : "Sign in"}
          </Text>
        </Pressable>

        {/* Magic link */}
        <Pressable
          onPress={handleMagic}
          disabled={loading !== null}
          className="w-full rounded-xl border px-4 py-3 mt-3 items-center"
          style={{
            borderColor: tokens.line,
            opacity: loading !== null ? 0.5 : 1,
          }}
        >
          <Text
            className="text-sm font-medium"
            style={{ color: tokens.textSec }}
          >
            {loading === "magic" ? "Sending link…" : "Email me a sign-in link"}
          </Text>
        </Pressable>

        <View className="flex-row justify-between items-center mt-5">
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable>
              <Text
                className="text-xs"
                style={{ color: tokens.textSec }}
              >
                Forgot password?
              </Text>
            </Pressable>
          </Link>
          <Link href="/(auth)/sign-up" asChild>
            <Pressable>
              <Text
                className="text-xs font-semibold"
                style={{ color: tokens.primary }}
              >
                Create account →
              </Text>
            </Pressable>
          </Link>
        </View>

        {__DEV__ && !hasGoogleClientId && (
          // WARN_AMBER from lib/tone-colors — single source of truth
          // for the warning-amber accent (palette has no warning token).
          // Dev-only: in production a missing platform client id (e.g. Android)
          // just hides the Google button; no user-facing note.
          <Text
            className="text-xs mt-6 text-center leading-relaxed"
            style={{ color: WARN_AMBER }}
          >
            Google client ID not set. Development build only.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
