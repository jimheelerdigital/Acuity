import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";

import { CoralScreen, FunnelCta, RippleWordmark } from "./_ui";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import { signInWithApple, isAppleSignInAvailable } from "@/lib/apple-auth";
import { signUpWithPassword, useGoogleSignIn } from "@/lib/auth";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { claimAnonymousDebrief } from "@/lib/onboarding-v10/claim";
import {
  getV10PlanDecision,
  setV10Guest,
} from "@/lib/onboarding-v10/state";

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

      // No longer a guest — they have an account. Cleared BEFORE routing
      // so a cold launch during the transition can't read stale guest
      // state and skip the signed-in branch.
      await setV10Guest(false);

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

  const onLater = useCallback(async () => {
    // Guest mode. The debrief stays on-device under its anonymous token —
    // NOT discarded — so a later signup can still claim it.
    //
    // The flag must be written BEFORE navigating: AuthGate reads it to
    // decide whether a signed-out user at /(tabs) is a guest or someone to
    // bounce to sign-in. Navigating first is a race the user loses by
    // landing back on sign-in, which reads as "Later does nothing".
    trackV10("v10_save_later", { paid_state: paidState });
    await setV10Guest(true);
    router.replace("/(tabs)");
  }, [paidState]);

  const copy = COPY[paidState];

  return (
    <CoralScreen tokens={tokens}>
      <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginTop: 24, marginBottom: 20 }}>
          <RippleWordmark tokens={tokens} size={32} textSize={26} gap={10} />
        </View>

        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            lineHeight: 32,
            color: "#ffffff",
            textAlign: "center",
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
            color: "#ffffff",
            opacity: 0.9,
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          {copy.sub}
        </Text>

        {error ? (
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 14,
              color: "#ffffff",
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {error}
          </Text>
        ) : null}

        <View style={{ gap: 10 }}>
          {appleAvailable ? (
            <OAuthButton
              provider="apple"
              label="Continue with Apple"
              onPress={onApple}
              disabled={busy}
              tokens={tokens}
            />
          ) : null}
          <OAuthButton
            provider="google"
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

        <View style={{ flex: 1, minHeight: 24 }} />

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
              color: "#ffffff",
              opacity: 0.85,
              textDecorationLine: "underline",
            }}
          >
            Later
          </Text>
        </Pressable>
      </ScrollView>
      </SafeAreaView>
    </CoralScreen>
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
  // The primary variant IS the funnel CTA — delegate rather than keep a
  // second coral-button implementation that can drift from it.
  if (primary) {
    return (
      <FunnelCta
        label={label}
        onPress={onPress}
        tokens={tokens}
        disabled={disabled}
        onCoral
      />
    );
  }

  // Secondary on coral: translucent white outline with a white label.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={{
        // Object style, not a function — RN 0.81.5 here drops Pressable
        // function-styles (see FunnelCta note).
        backgroundColor: "rgba(255,255,255,0.12)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.4)",
        borderRadius: tokens.radius.pill,
        paddingVertical: 16,
        alignItems: "center",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 16,
          color: "#ffffff",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Branded OAuth button on the coral surface: a white pill with the real
 * provider logo and a dark label — Apple's black mark, Google's four-colour
 * "G". These are the actual brand buttons App Review expects, not a coral
 * CTA with a word on it, and they read as tappable white cards on the coral.
 */
function OAuthButton({
  provider,
  label,
  onPress,
  disabled,
  tokens,
}: {
  provider: "apple" | "google";
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tokens: Tokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={{
        // Object style, not a function — RN 0.81.5 here drops Pressable
        // function-styles (see FunnelCta note).
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        backgroundColor: "#ffffff",
        borderRadius: tokens.radius.pill,
        paddingVertical: 15,
        opacity: disabled ? 0.6 : 1,
        shadowColor: "#7a3d24",
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 18,
        shadowOpacity: 0.16,
        elevation: 4,
      }}
    >
      {provider === "apple" ? <AppleLogo /> : <GoogleLogo />}
      <Text
        style={{
          fontFamily: tokens.fontDisplay,
          fontSize: 15,
          color: "#1f1f1f",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AppleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#000000"
        d="M16.4 12.9c0-2 1.6-2.9 1.7-3-1-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7s-1.6-.7-2.6-.7c-1.3 0-2.6.8-3.2 2-1.4 2.4-.4 6 1 8 .7.9 1.4 2 2.5 1.9 1-.04 1.4-.6 2.6-.6s1.5.6 2.6.6 1.7-.9 2.4-1.8c.7-1 1-2 1-2.1-.1 0-1.9-.7-1.9-2.8zM14.5 6.3c.5-.7.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9 0 1.7-.4 2.3-1.1z"
      />
    </Svg>
  );
}

function GoogleLogo() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-2 3.2-4.8 3.2-7.9z"
      />
      <Path
        fill="#34A853"
        d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1-3.6 1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23z"
      />
      <Path
        fill="#FBBC05"
        d="M6 14.3a6.6 6.6 0 0 1 0-4.2V7.3H2.3a11 11 0 0 0 0 9.8L6 14.3z"
      />
      <Path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.3L6 10.1c.9-2.6 3.2-4.7 6-4.7z"
      />
    </Svg>
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
        backgroundColor: "#ffffff",
        borderWidth: 0,
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
