import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { signUpWithPassword } from "@/lib/auth";

const PASSWORD_MIN = 12;

export default function SignUpScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || password.length < PASSWORD_MIN) return;
    setLoading(true);
    const result = await signUpWithPassword(
      email.trim(),
      password,
      name.trim() || undefined
    );
    setLoading(false);

    if (!result.ok) {
      const msg =
        result.reason === "AlreadyRegistered"
          ? "An account with that email already exists. Try signing in instead."
          : result.reason === "WeakPassword"
          ? result.message ?? `Password must be at least ${PASSWORD_MIN} characters.`
          : result.reason === "InvalidEmail"
          ? "That doesn't look like a valid email address."
          : result.reason === "RateLimited"
          ? "Too many attempts. Wait an hour before trying again."
          : "Something went wrong. Please try again.";
      Alert.alert("Couldn't create account", msg);
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
          We sent a verification link to {email}. Click it to activate your account, then sign in.
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
    <SafeAreaView className="flex-1 bg-white dark:bg-[#0B0B12] px-6">
      <View className="flex-1 justify-center">
        <View className="h-16 w-16 rounded-2xl bg-violet-600 items-center justify-center mb-8 self-center">
          <Text className="text-3xl" style={{ color: "white" }}>
            A
          </Text>
        </View>

        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1 text-center">
          Create your account
        </Text>
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 mb-8 text-center">
          30-day free trial. No credit card.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name (optional)"
          placeholderTextColor="#71717A"
          autoComplete="name"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-zinc-900 dark:text-zinc-50 mb-3"
        />
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
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={`Password (${PASSWORD_MIN}+ characters)`}
          placeholderTextColor="#71717A"
          secureTextEntry
          autoComplete="new-password"
          className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-zinc-900 dark:text-zinc-50 mb-3"
        />
        <Pressable
          onPress={handleSubmit}
          disabled={loading || !email.trim() || password.length < PASSWORD_MIN}
          className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-50 px-4 py-3.5 items-center"
          style={({ pressed }) => ({
            opacity:
              pressed || loading || !email.trim() || password.length < PASSWORD_MIN
                ? 0.5
                : 1,
          })}
        >
          <Text className="text-sm font-semibold text-white dark:text-zinc-900">
            {loading ? "Creating account…" : "Create account"}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            Already have an account?{" "}
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Pressable>
              <Text className="text-xs font-semibold text-violet-500">
                Sign in
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </SafeAreaView>
  );
}
