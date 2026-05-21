import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardAwareScreen } from "@/components/keyboard-aware-screen";
import { useTheme } from "@/contexts/theme-context";
import { requestPasswordReset } from "@/lib/auth";

/**
 * Kicks off the password-reset flow. The actual reset happens on the
 * web (the email links to getacuity.io/auth/reset-password?token=…) —
 * after the user sets a new password there, they come back to this
 * app and sign in. No mobile-native reset form for now; a dual-surface
 * reset page is 2x the QA surface for a flow most users hit once.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) return;
    setLoading(true);
    const result = await requestPasswordReset(email.trim());
    setLoading(false);

    if (!result.ok) {
      Alert.alert(
        "Couldn't send reset link",
        result.reason === "RateLimited"
          ? "Too many attempts. Wait an hour before trying again."
          : "Please check your email address and try again."
      );
      return;
    }
    setSent(true);
  }

  if (sent) {
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
          If an account exists for {email}, we sent a password-reset link. The link expires in 1 hour.
        </Text>
        <Text
          className="text-xs text-center leading-relaxed mb-6 px-4"
          style={{ color: tokens.textTer }}
        >
          Reset your password in the browser, then return here and sign in with the new password.
        </Text>
        <Pressable
          onPress={() => router.replace("/(auth)/sign-in")}
          className="px-4 py-3 rounded-xl"
          style={{ backgroundColor: tokens.text }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: tokens.bg }}
          >
            Back to sign in →
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: tokens.bg }}
    >
      <KeyboardAwareScreen
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingVertical: 24,
          justifyContent: "center",
        }}
      >
        <Text
          className="text-2xl font-bold mb-1 text-center"
          style={{ color: tokens.text }}
        >
          Reset your password
        </Text>
        <Text
          className="text-sm mb-8 text-center"
          style={{ color: tokens.textTer }}
        >
          Enter your email and we&apos;ll send you a link to set a new one.
        </Text>

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
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email.trim()}
          className="w-full rounded-xl px-4 py-3.5 items-center"
          style={{
            backgroundColor: tokens.text,
            opacity: loading || !email.trim() ? 0.5 : 1,
          }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: tokens.bg }}
          >
            {loading ? "Sending link…" : "Send reset link"}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text
            className="text-xs"
            style={{ color: tokens.textSec }}
          >
            Remembered it?{" "}
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text
                className="text-xs font-semibold"
                style={{ color: tokens.primary }}
              >
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}
