import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import Svg, { Path } from "react-native-svg";

import { useAuth } from "@/contexts/auth-context";
import { EmailCodeForm } from "@/components/auth/email-code-form";
import type { AuthLoading } from "@/components/auth/social-auth-buttons";

import { FunnelHeader, Heading, LightScreen, PROGRESS, RippleAppIcon, V11 } from "../_v11/ui";
import { signInWithApple, isAppleSignInAvailable } from "@/lib/apple-auth";
import { useGoogleSignIn, type User } from "@/lib/auth";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { setV10Guest } from "@/lib/onboarding-v10/state";

/**
 * Account step (1.9.1 — account first). Shown right after "I'm new", BEFORE
 * recording and the paywall.
 *
 * Why it moved (2026-10-14, Jimmy): in 1.9 the account came last and could
 * be skipped ("Later"), so first recordings lived on an anonymous token and
 * were deleted after 24h if never claimed — one user lost hers twice and
 * uninstalled — and people could pay on an anonymous RevenueCat ID with no
 * account. Now every recording and purchase belongs to a real account from
 * the start. There is no "Later".
 *
 * Apple / Google / email 6-digit code; all of them sign in an existing
 * account too, so a returning user who taps "I'm new" isn't stuck.
 */

const COPY = {
  headline: "Create your account",
  sub: "Every debrief is saved to it, on any device. No password needed.",
};

export default function V10Save() {
  const { refresh, setAuthenticatedUser } = useAuth();
  const { signIn: googleSignIn, ready: googleReady } = useGoogleSignIn();

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailLoading, setEmailLoading] = useState<AuthLoading>(null);

  // Guard against a double-tap firing two signups on top of each other.
  const inflightRef = useRef(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
    trackV10("v10_save_viewed", { position: "account_first" });
  }, []);

  /**
   * Shared tail for every successful auth path: they're now signed in, mid-
   * funnel. AuthGate leaves a signed-in user on /onboarding-new alone, so we
   * continue to the questions and the first recording. The debrief claim and
   * "onboarding complete" happen at the end of the funnel (reminders).
   */
  const finishSignup = useCallback(
    async (method: "apple" | "google" | "email", isNewUser?: boolean) => {
      // Not a guest — clears any guest state left by a 1.9.0 install.
      await setV10Guest(false);
      await refresh();
      trackV10("v10_account_completed", { method, position: "account_first", is_new: isNewUser ?? null });
      // v11 (2026-10-15): on to Keenan's questions. The name screen skips
      // itself when the sign-in already gave us a name.
      router.replace("/onboarding-new/name");
    },
    [refresh]
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

  const onEmailAuthenticated = useCallback(
    async (user: User, sessionToken: string, isNewUser: boolean) => {
      // Hand the session to the auth context directly (keychain race —
      // see components/auth/social-auth-buttons.tsx), then continue.
      setAuthenticatedUser(user, sessionToken);
      await finishSignup("email", isNewUser);
    },
    [finishSignup, setAuthenticatedUser]
  );

  const copy = COPY;


  return (
    <LightScreen>
      <FunnelHeader progress={PROGRESS.account} onBack={() => router.canGoBack() && router.back()} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={{ alignItems: "center", marginBottom: 18 }}>
          <RippleAppIcon size={60} />
        </View>
        <Heading title={copy.headline} sub={copy.sub} />

        {error ? (
          <Text style={{ fontFamily: V11.display, fontSize: 14, color: "#C2412D", textAlign: "center", marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        <View style={{ gap: 12 }}>
          {appleAvailable ? (
            <OAuthButton provider="apple" label="Continue with Apple" onPress={onApple} disabled={busy} />
          ) : null}
          <OAuthButton provider="google" label="Continue with Google" onPress={onGoogle} disabled={busy || !googleReady} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 6 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: V11.lineStrong }} />
            <Text style={{ fontSize: 13, color: V11.ter }}>or</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: V11.lineStrong }} />
          </View>
          <EmailCodeForm
            colors={{
              text: V11.ink,
              textSec: V11.sec,
              placeholder: V11.quiet,
              border: V11.lineStrong,
              inputBg: "#ffffff",
              inputText: V11.ink,
              buttonBg: V11.coral,
              buttonText: "#ffffff",
              link: V11.coral,
              error: "#C2412D",
            }}
            loading={emailLoading}
            setLoading={(v) => {
              setEmailLoading(v);
              setBusy(v !== null);
            }}
            submitLabel="Continue with email"
            onAuthenticated={(u, t, isNew) => void onEmailAuthenticated(u, t, isNew)}
          />
          <Text style={{ fontSize: 13, color: V11.ter, textAlign: "center", marginTop: 4 }}>
            Paid on the website? Use the same email.
          </Text>
        </View>
      </ScrollView>
    </LightScreen>
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
}: {
  provider: "apple" | "google";
  label: string;
  onPress: () => void;
  disabled?: boolean;
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
        borderRadius: 999,
        borderWidth: 1,
        borderColor: V11.lineStrong,
        paddingVertical: 17,
        opacity: disabled ? 0.6 : 1,
        shadowColor: "#141028",
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        shadowOpacity: 0.06,
        elevation: 2,
      }}
    >
      {provider === "apple" ? <AppleLogo /> : <GoogleLogo />}
      <Text
        style={{
          fontFamily: V11.display,
          fontSize: 16,
          color: V11.ink,
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

