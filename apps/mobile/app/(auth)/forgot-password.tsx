import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardAwareScreen } from "@/components/keyboard-aware-screen";
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
      <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center px-6">
        <Text className="text-4xl mb-4">📬</Text>
        <Text className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
          Check your inbox
        </Text>
        <Text className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed mb-6">
          If an account exists for {email}, we sent a password-reset link. The link expires in 1 hour.
        </Text>
        <Text className="text-xs text-zinc-400 dark:text-zinc-500 text-center leading-relaxed mb-6 px-4">
          Reset your password in the browser, then return here and sign in with the new password.
        </Text>
        <Pressable
          onPress={() => router.replace("/(auth)/sign-in")}
          className="px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-50"
        >
          <Text className="text-sm font-semibold text-white dark:text-zinc-900">
            Back to sign in →
          </Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12]">
      <KeyboardAwareScreen
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingVertical: 24,
          justifyContent: "center",
        }}
      >
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-center">
          Reset your password
        </Text>
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 mb-8 text-center">
          Enter your email and we&apos;ll send you a link to set a new one.
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#71717A"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-zinc-900 dark:text-zinc-50 mb-3"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email.trim()}
          className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-50 px-4 py-3.5 items-center"
          style={{
            opacity: loading || !email.trim() ? 0.5 : 1,
          }}
        >
          <Text className="text-sm font-semibold text-white dark:text-zinc-900">
            {loading ? "Sending link…" : "Send reset link"}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            Remembered it?{" "}
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text className="text-xs font-semibold text-violet-500">
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      </KeyboardAwareScreen>
    </SafeAreaView>
  );
}
