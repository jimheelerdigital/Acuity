// AUTH-CRITICAL FILE
// Any change to this file or its render tree REQUIRES manual verification of:
//   - Web Google OAuth (goripple.io/auth/signin → Continue with Google)
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
// The Apple + Google block lives in components/auth/social-auth-buttons.tsx
// and is shared with (auth)/sign-up.tsx — a change there changes both
// screens, so verify both.
//
// See docs/AUTH_HARDENING.md for the full test checklist.

import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import { Link } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { googlePlatformClientId, signInWithPassword } from "@/lib/auth";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import {
  SocialAuthButtons,
  type AuthLoading as Loading,
} from "@/components/auth/social-auth-buttons";
import { WARN_AMBER } from "@/lib/tone-colors";

/**
 * Mobile Log in (1.9.1 — passwordless). Every path ends with a session JWT
 * in SecureStore handed to AuthContext.setAuthenticatedUser:
 *
 *   1. Sign in with Apple / Google.
 *   2. Email → 6-digit code (POST /api/auth/mobile-email-code/*). Creates
 *      the account if it doesn't exist yet, so nobody gets stuck.
 *   3. "Use password instead" — TEMPORARY fallback for existing password
 *      users. Remove after 2026-12-15 (~60 days after 1.9.1).
 *
 * Magic links from emails still work (app/auth-callback.tsx); there's just
 * no button to request one here any more — the code replaces it.
 */
export default function SignInScreen() {
  const { setAuthenticatedUser } = useAuth();
  const { tokens } = useTheme();
  const [loading, setLoading] = useState<Loading>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
          : "Incorrect email or password. You can also sign in with a code instead."
      );
      return;
    }
    // Same SecureStore race avoidance as the social paths — see the
    // onAuthenticated docs in components/auth/social-auth-buttons.tsx.
    setAuthenticatedUser(result.user, result.sessionToken);
  }

  return (
    // Deliberately NO ScrollView (see the 2026-04-28 regression at the top:
    // a parent ScrollView re-layout dismissed Google's auth session). Plain
    // KeyboardAvoidingView, as on 2026-09-19. The code step is no taller
    // than the old password form, so it fits the same way.
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: tokens.bg }}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center">
          <Text className="text-2xl font-bold mb-1 text-center" style={{ color: tokens.text }}>
            Log in to Ripple
          </Text>
          <Text className="text-sm mb-8 text-center" style={{ color: tokens.textTer }}>
            Talk it out. Ripple turns it into your to-dos, habits and patterns.
          </Text>

          <SocialAuthButtons
            loading={loading}
            setLoading={setLoading}
            onAuthenticated={setAuthenticatedUser}
            tokens={tokens}
            appleButtonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            appleFootnote="Paid on the website? Use the same email below."
          />

          <View className="flex-row items-center gap-3 my-3">
            <View className="h-px flex-1" style={{ backgroundColor: tokens.line }} />
            <Text className="text-xs" style={{ color: tokens.textTer }}>
              or
            </Text>
            <View className="h-px flex-1" style={{ backgroundColor: tokens.line }} />
          </View>

          {!showPasswordForm ? (
            <EmailCodeForm
              colors={{
                text: tokens.text,
                textSec: tokens.textSec,
                placeholder: tokens.textTer,
                border: tokens.line,
                inputBg: tokens.cardBg,
                buttonBg: tokens.text,
                buttonText: tokens.bg,
                link: tokens.primary,
                error: WARN_AMBER,
              }}
              loading={loading}
              setLoading={setLoading}
              onAuthenticated={(user, sessionToken) => setAuthenticatedUser(user, sessionToken)}
            />
          ) : (
            <View className="w-full">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={tokens.textTer}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                className="w-full rounded-xl border px-4 py-3 mb-3"
                style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg, color: tokens.text }}
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
                  style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg, color: tokens.text }}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-0 bottom-0 justify-center"
                >
                  <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={tokens.textTer} />
                </Pressable>
              </View>
              <Pressable
                onPress={handlePassword}
                disabled={loading !== null || !email.trim() || !password}
                className="w-full rounded-xl px-4 py-3.5 items-center"
                style={{
                  backgroundColor: tokens.text,
                  opacity: loading !== null || !email.trim() || !password ? 0.5 : 1,
                }}
              >
                <Text className="text-sm font-semibold" style={{ color: tokens.bg }}>
                  {loading === "password" ? "Signing in…" : "Log in"}
                </Text>
              </Pressable>
              <Link href="/(auth)/forgot-password" asChild>
                <Pressable className="mt-3 self-center">
                  <Text className="text-xs" style={{ color: tokens.textSec }}>
                    Forgot password?
                  </Text>
                </Pressable>
              </Link>
            </View>
          )}

          <Pressable
            onPress={() => setShowPasswordForm((v) => !v)}
            disabled={loading !== null}
            className="mt-5 self-center"
            hitSlop={8}
          >
            <Text className="text-xs" style={{ color: tokens.textSec }}>
              {showPasswordForm ? "Use an email code instead" : "Use password instead"}
            </Text>
          </Pressable>

          <Link href="/(auth)/sign-up" asChild>
            <Pressable className="mt-4 self-center">
              <Text className="text-xs font-semibold" style={{ color: tokens.primary }}>
                New to Ripple? Create an account →
              </Text>
            </Pressable>
          </Link>

          {__DEV__ && !googlePlatformClientId() && (
            <Text className="text-xs mt-6 text-center leading-relaxed" style={{ color: WARN_AMBER }}>
              Google client ID not set. Development build only.
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
