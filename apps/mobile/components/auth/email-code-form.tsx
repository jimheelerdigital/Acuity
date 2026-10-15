import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { requestEmailCode, verifyEmailCode, type User } from "@/lib/auth";

import type { AuthLoading } from "./social-auth-buttons";

/**
 * Passwordless email sign-in (1.9.1): email → 6-digit code → signed in.
 * The same form signs in existing users and creates new accounts (the
 * server creates the account when the code is verified), so it's used by
 * the Log in screen, the Create account screen and the v10 account step.
 *
 * Colors come in as a small palette so it sits on both the themed auth
 * screens and the coral onboarding surface.
 */
export interface EmailCodeColors {
  text: string;
  textSec: string;
  placeholder: string;
  border: string;
  inputBg: string;
  buttonBg: string;
  buttonText: string;
  link: string;
  error: string;
}

const RESEND_COOLDOWN_S = 30;

export function EmailCodeForm({
  colors,
  loading,
  setLoading,
  onAuthenticated,
  initialEmail = "",
  submitLabel = "Continue with email",
}: {
  colors: EmailCodeColors;
  loading: AuthLoading;
  setLoading: (v: AuthLoading) => void;
  onAuthenticated: (user: User, sessionToken: string, isNewUser: boolean) => void;
  initialEmail?: string;
  submitLabel?: string;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<TextInput>(null);
  const busy = loading !== null;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    const e = email.trim();
    if (!e) {
      setError("Enter your email address.");
      return;
    }
    setError(null);
    setLoading("code");
    const res = await requestEmailCode(e);
    setLoading(null);
    if (!res.ok) {
      setError(
        res.reason === "InvalidEmail"
          ? "That email address doesn't look right."
          : res.reason === "RateLimited"
          ? "Too many codes requested. Wait a bit, then try again."
          : res.reason === "SendFailed"
          ? "We couldn't send the email. Try again in a moment."
          : "Couldn't reach Ripple. Check your connection and try again."
      );
      return;
    }
    setCode("");
    setStep("code");
    setCooldown(RESEND_COOLDOWN_S);
    setTimeout(() => codeRef.current?.focus(), 250);
  }

  async function verify(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 6 || busy) return;
    setError(null);
    setLoading("code");
    const res = await verifyEmailCode(email.trim(), digits);
    setLoading(null);
    if (!res.ok) {
      setCode("");
      setError(
        res.reason === "ExpiredCode"
          ? "That code expired. Tap Resend for a new one."
          : res.reason === "TooManyAttempts"
          ? "Too many wrong tries. Tap Resend for a new code."
          : res.reason === "RateLimited"
          ? "Too many attempts. Wait a few minutes, then try again."
          : res.reason === "NetworkError"
          ? "Couldn't reach Ripple. Check your connection and try again."
          : "That code isn't right. Check the email and try again."
      );
      return;
    }
    onAuthenticated(res.user, res.sessionToken, res.isNewUser);
  }

  const inputStyle = {
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.text,
  };

  if (step === "email") {
    return (
      <View className="w-full">
        <TextInput
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (error) setError(null);
          }}
          placeholder="you@example.com"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          keyboardType="email-address"
          returnKeyType="send"
          onSubmitEditing={sendCode}
          accessibilityLabel="Email address"
          className="w-full rounded-xl border px-4 py-3 mb-3"
          style={inputStyle}
        />
        <Pressable
          onPress={sendCode}
          disabled={busy || !email.trim()}
          accessibilityRole="button"
          className="w-full rounded-xl px-4 py-3.5 items-center"
          style={{ backgroundColor: colors.buttonBg, opacity: busy || !email.trim() ? 0.5 : 1 }}
        >
          {loading === "code" ? (
            <ActivityIndicator size="small" color={colors.buttonText} />
          ) : (
            <Text className="text-sm font-semibold" style={{ color: colors.buttonText }}>
              {submitLabel}
            </Text>
          )}
        </Pressable>
        <Text className="text-xs text-center mt-2" style={{ color: colors.textSec }}>
          We&apos;ll email you a 6-digit code. No password needed.
        </Text>
        {error ? (
          <Text className="text-sm text-center mt-3" style={{ color: colors.error }} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View className="w-full">
      <Text className="text-sm text-center mb-3" style={{ color: colors.textSec }}>
        Enter the 6-digit code we sent to{"\n"}
        <Text style={{ color: colors.text, fontWeight: "600" }}>{email.trim()}</Text>
      </Text>
      <TextInput
        ref={codeRef}
        value={code}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, "").slice(0, 6);
          setCode(digits);
          if (error) setError(null);
          if (digits.length === 6) void verify(digits);
        }}
        placeholder="000000"
        placeholderTextColor={colors.placeholder}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        accessibilityLabel="6-digit code"
        className="w-full rounded-xl border px-4 py-3 mb-3 text-center"
        style={[inputStyle, { fontSize: 24, letterSpacing: 8, fontWeight: "600" }]}
      />
      <Pressable
        onPress={() => void verify(code)}
        disabled={busy || code.length !== 6}
        accessibilityRole="button"
        className="w-full rounded-xl px-4 py-3.5 items-center"
        style={{ backgroundColor: colors.buttonBg, opacity: busy || code.length !== 6 ? 0.5 : 1 }}
      >
        {loading === "code" ? (
          <ActivityIndicator size="small" color={colors.buttonText} />
        ) : (
          <Text className="text-sm font-semibold" style={{ color: colors.buttonText }}>
            Continue
          </Text>
        )}
      </Pressable>
      {error ? (
        <Text className="text-sm text-center mt-3" style={{ color: colors.error }} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View className="flex-row justify-between mt-4">
        <Pressable
          onPress={() => {
            setStep("email");
            setCode("");
            setError(null);
          }}
          disabled={busy}
          hitSlop={8}
        >
          <Text className="text-sm" style={{ color: colors.link }}>
            Use a different email
          </Text>
        </Pressable>
        <Pressable onPress={sendCode} disabled={busy || cooldown > 0} hitSlop={8}>
          <Text className="text-sm" style={{ color: cooldown > 0 ? colors.textSec : colors.link }}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
