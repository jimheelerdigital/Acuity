import { Ionicons } from "@expo/vector-icons";
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

import { KeyboardAwareScreen } from "@/components/keyboard-aware-screen";
import { useTheme } from "@/contexts/theme-context";
import { signUpWithPassword } from "@/lib/auth";

const PASSWORD_MIN = 12;

export default function SignUpScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          We sent a verification link to {email}. Click it to activate your account, then sign in.
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
          Create your account
        </Text>
        <Text
          className="text-sm mb-8 text-center"
          style={{ color: tokens.textTer }}
        >
          14-day free trial. No credit card.
        </Text>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name (optional)"
          placeholderTextColor={tokens.textTer}
          autoComplete="name"
          className="w-full rounded-xl border px-4 py-3 mb-3"
          style={{
            borderColor: tokens.line,
            backgroundColor: tokens.cardBg,
            color: tokens.text,
          }}
        />
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
            placeholder={`Password (${PASSWORD_MIN}+ characters)`}
            placeholderTextColor={tokens.textTer}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
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
          onPress={handleSubmit}
          disabled={loading || !email.trim() || password.length < PASSWORD_MIN}
          className="w-full rounded-xl px-4 py-3.5 items-center"
          style={{
            backgroundColor: tokens.text,
            opacity:
              loading || !email.trim() || password.length < PASSWORD_MIN
                ? 0.5
                : 1,
          }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: tokens.bg }}
          >
            {loading ? "Creating account…" : "Create account"}
          </Text>
        </Pressable>

        <View className="flex-row justify-center mt-6">
          <Text
            className="text-xs"
            style={{ color: tokens.textSec }}
          >
            Already have an account?{" "}
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
