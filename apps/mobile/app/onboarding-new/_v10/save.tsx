import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { signInWithApple, isAppleSignInAvailable } from "@/lib/apple-auth";
import { signUpWithPassword, useGoogleSignIn } from "@/lib/auth";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { claimAnonymousDebrief } from "@/lib/onboarding-v10/claim";
import { getV10PlanDecision } from "@/lib/onboarding-v10/state";

/**
 * Screen 7 — Save / account (light).
 *
 * ── Why the account ask is HERE and not earlier ──────────────────────
 * The user has recorded, seen their result, and made a paywall decision.
 * They are being asked to save something that already exists and that they
 * can see. Spec §1 forbids any account step before the reveal, and this is
 * why: an account wall in front of the value is a wall in front of nothing.
 *
 * ── The copy changes with what they just decided ─────────────────────
 * Someone who just started a trial is told their Ripple has started.
 * Someone who chose Free is told their insight will be kept. Showing the
 * paid line to a free user reads as a system that wasn't listening — which
 * is the exact opposite of the product's premise.
 *
 * ── "Later" is real ──────────────────────────────────────────────────
 * Guest mode keeps the debrief on-device and lets them into the app. It is
 * not a decoy that loops back. The save wall arrives later, on the second
 * recording attempt (spec §4 Screen 9).
 */

type PaidState = "paid" | "free";

const COPY: Record<PaidState, { headline: string; sub: string }> = {
  paid: {
    headline: "Your Ripple has started.",
    sub: "Save your first debrief so patterns can begin connecting.",
  },
  free: {
    headline: "Keep your first insight.",
    sub: "Save this debrief and come back whenever your head is full.",
  },
};

export default function V10Save() {
  const { palette } = useTheme();
  const tokens = useMemo(
    () => makeAcuityTokens({ dark: false, accent: palette }),
    [palette]
  );
  const { refresh } = useAuth();
  const { signIn: googleSignIn, ready: googleReady } = useGoogleSignIn();

  const [paidState, setPaidState] = useState<PaidState>("free");
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Guard against a double-tap firing two signups on top of each other.
  const inflightRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const [available, decision] = await Promise.all([
        isAppleSignInAvailable(),
        getV10PlanDecision(),
      ]);
      setAppleAvailable(available);
      // Default stays "free" when the decision is missing. Under-claiming
      // is the safe direction: telling a free user their Ripple has started
      // is a promise the product then has to break.
      if (decision === "annual" || decision === "monthly") setPaidState("paid");
    })();
  }, []);

  useEffect(() => {
    trackV10("v10_save_viewed", { paid_state: paidState });
  }, [paidState]);

  /**
   * Shared tail for every successful auth path.
   *
   * Claim first, THEN route. If claiming is left until after navigation the
   * screen unmounts mid-request and the debrief is silently orphaned — the
   * account exists, the audio exists, and nothing connects them.
   */
  const finishSignup = useCallback(
    async (method: "apple" | "google" | "email") => {
      const outcome = await claimAnonymousDebrief();
      if (outcome.status === "failed") {
        // The account was still created — this is not a signup failure, and
        // treating it as one would strand a real user on an error screen.
        // The token is deliberately still on the device, so a later attempt
        // can recover the debrief.
        console.warn("[v10.save] Claim failed, continuing:", outcome.error);
      }

      await refresh();
      trackV10("v10_account_completed", { method, paid_state: paidState });
      router.replace("/onboarding-new/reminders" as never);
    },
    [paidState, refresh]
  );

  const onApple = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithApple();
      if (!result.ok) {
        // A cancel is a decision, not an error. Showing a red message for
        // it makes the user feel they broke something.
        if (result.reason !== "Cancelled") {
          setError("That didn't go through. Try another way?");
        }
        return;
      }
      await finishSignup("apple");
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }, [finishSignup]);

  const onGoogle = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await googleSignIn();
      if (!result?.ok) {
        // Google's reason codes are snake_case; Apple's are PascalCase.
        // They are different libraries, not a typo.
        if (result?.reason !== "cancelled") {
          setError("That didn't go through. Try another way?");
        }
        return;
      }
      await finishSignup("google");
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }, [finishSignup, googleSignIn]);

  const onEmail = useCallback(async () => {
    if (inflightRef.current) return;
    const trimmed = email.trim();
    if (!trimmed || password.length < 12) {
      setError("Use an email and a password of at least 12 characters.");
      return;
    }
    inflightRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await signUpWithPassword(trimmed, password);
      if (!result.ok) {
        setError(result.message ?? "That didn’t go through.");
        return;
      }
      await finishSignup("email");
    } finally {
      inflightRef.current = false;
      setBusy(false);
    }
  }, [email, password, finishSignup]);

  const onLater = useCallback(() => {
    // Guest mode. The debrief stays on-device under its anonymous token —
    // NOT discarded — so a later signup can still claim it.
    trackV10("v10_save_later", { paid_state: paidState });
    router.replace("/(tabs)");
  }, [paidState]);

  const copy = COPY[paidState];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 32,
            color: tokens.text,
            marginBottom: 8,
          }}
        >
          {copy.headline}
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 16,
            lineHeight: 24,
            color: tokens.textSec,
            marginBottom: 28,
          }}
        >
          {copy.sub}
        </Text>

        {error ? (
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.bad,
              marginBottom: 12,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ gap: 10 }}>
          {appleAvailable ? (
            <AuthButton
              label="Continue with Apple"
              onPress={onApple}
              disabled={busy}
              tokens={tokens}
              primary
            />
          ) : null}
          <AuthButton
            label="Continue with Google"
            onPress={onGoogle}
            disabled={busy || !googleReady}
            tokens={tokens}
          />
          {showEmail ? (
            <View style={{ gap: 10 }}>
              <Field
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                tokens={tokens}
                autoComplete="email"
                keyboardType="email-address"
              />
              <Field
                value={password}
                onChangeText={setPassword}
                placeholder="Password (12+ characters)"
                tokens={tokens}
                autoComplete="new-password"
                secureTextEntry
              />
              <AuthButton
                label="Create account"
                onPress={onEmail}
                disabled={busy}
                tokens={tokens}
                primary
              />
            </View>
          ) : (
            <AuthButton
              label="Sign up with email"
              onPress={() => setShowEmail(true)}
              disabled={busy}
              tokens={tokens}
            />
          )}
        </View>

        <Pressable
          onPress={onLater}
          accessibilityRole="button"
          disabled={busy}
          style={{ paddingVertical: 20, alignItems: "center" }}
        >
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              color: tokens.textTer,
              textDecorationLine: "underline",
            }}
          >
            Later
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

type Tokens = ReturnType<typeof makeAcuityTokens>;

function AuthButton({
  label,
  onPress,
  disabled,
  tokens,
  primary,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tokens: Tokens;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => ({
        backgroundColor: primary ? tokens.primary : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: tokens.line,
        borderRadius: 999,
        paddingVertical: 16,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 16,
          color: primary ? "#ffffff" : tokens.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  tokens,
  ...props
}: React.ComponentProps<typeof TextInput> & { tokens: Tokens }) {
  return (
    <TextInput
      {...props}
      autoCapitalize="none"
      placeholderTextColor={tokens.textTer}
      style={{
        borderWidth: 1,
        borderColor: tokens.line,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontFamily: tokens.fontSans,
        fontSize: 16,
        color: tokens.text,
      }}
    />
  );
}
