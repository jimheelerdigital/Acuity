// AUTH-CRITICAL FILE
// This screen mounts Apple + Google via the shared
// components/auth/social-auth-buttons.tsx. Any change here or in that
// component REQUIRES manual verification of:
//   - Mobile Google OAuth (TestFlight), from sign-UP
//   - Mobile Apple sign-in, from sign-UP ("Sign up with Apple" label)
//   - Email code sign-up (components/auth/email-code-form.tsx)
// before any OTA or production deploy.
//
// ⚠️ No ScrollView / KeyboardAwareScreen around the OAuth buttons — a parent
// ScrollView re-layout dismissed Google's auth session on 2026-04-28.
// See docs/AUTH_HARDENING.md for the full checklist.

import * as AppleAuthentication from "expo-apple-authentication";
import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmailCodeForm } from "@/components/auth/email-code-form";
import {
  SocialAuthButtons,
  type AuthLoading,
} from "@/components/auth/social-auth-buttons";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { WARN_AMBER } from "@/lib/tone-colors";

/**
 * Create account (1.9.1 — passwordless). Apple, Google, or email → 6-digit
 * code. No passwords: the email code both creates the account and signs in,
 * and lands the user signed in (the old screen made them verify an email
 * and then sign in again).
 */
export default function SignUpScreen() {
  const { tokens } = useTheme();
  const { setAuthenticatedUser } = useAuth();
  const [loading, setLoading] = useState<AuthLoading>(null);

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: tokens.bg }}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="flex-1 justify-center">
          <Text className="text-2xl font-bold mb-1 text-center" style={{ color: tokens.text }}>
            Create your account
          </Text>
          <Text className="text-sm mb-8 text-center" style={{ color: tokens.textTer }}>
            Your debriefs are saved to it, on every device.
          </Text>

          <SocialAuthButtons
            loading={loading}
            setLoading={setLoading}
            onAuthenticated={setAuthenticatedUser}
            tokens={tokens}
            appleButtonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
            appleBusyLabel="Creating account…"
            appleFootnote="Paid on the website? Use the same email below."
          />

          <View className="flex-row items-center gap-3 my-3">
            <View className="h-px flex-1" style={{ backgroundColor: tokens.line }} />
            <Text className="text-xs" style={{ color: tokens.textTer }}>
              or
            </Text>
            <View className="h-px flex-1" style={{ backgroundColor: tokens.line }} />
          </View>

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
            submitLabel="Sign up with email"
            onAuthenticated={(user, sessionToken) => setAuthenticatedUser(user, sessionToken)}
          />

          <Link href="/(auth)/sign-in" asChild>
            <Pressable className="mt-6 self-center">
              <Text className="text-xs font-semibold" style={{ color: tokens.primary }}>
                Already have an account? Log in →
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
