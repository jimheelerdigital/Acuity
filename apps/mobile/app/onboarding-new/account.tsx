import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useAuth } from "@/contexts/auth-context";
import { useOnboardingState } from "@/contexts/onboarding-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import {
  signInWithPassword,
  signUpWithPassword,
  useGoogleSignIn,
} from "@/lib/auth";
import { signInWithApple } from "@/lib/apple-auth";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { makeAcuityTokens } from "@/lib/theme/tokens";
import {
  clearStoredTrySession,
  getStoredTryExtraction,
  getStoredTrySessionToken,
} from "@/lib/try-session";

/**
 * Screen 13 — Account creation. Slice 11 (2026-05-26).
 *
 * Three OAuth options stacked, Apple first per Apple Guideline 4.8.
 * Apple + Google handlers reuse existing lib/apple-auth.ts and
 * lib/auth.useGoogleSignIn — both already wired in v1.1 and
 * shipping in build 42. Email expands inline into a small form so
 * the user doesn't have to leave the screen.
 *
 * Atmospheric "Saving" teaser at the top reads the slice 8/9-
 * persisted extraction (getStoredTryExtraction). Falls back
 * silently if AsyncStorage was wiped between record and account.
 *
 * Post-signup orchestration:
 *   1. Apple/Google: lib helpers handle the OS dialog → token
 *      exchange → /api/auth/mobile-callback{,-apple} → setToken +
 *      setStoredUser, returning { user, sessionToken } directly.
 *   2. Email: signUpWithPassword creates the User, then
 *      signInWithPassword fetches a session token — same two-step
 *      pattern the existing /(auth)/sign-up.tsx uses post-2026-05-24
 *      verification-gate removal.
 *   3. After any path resolves with a session, POST to /api/try-
 *      recording/claim with the stored sessionToken from AsyncStorage
 *      (slice 1) to convert the anon TrySession into a real Entry +
 *      Tasks + Goals attached to the new User.
 *   4. refresh() pulls the post-claim user state, fire
 *      funnel_signup_completed, route to /paywall.
 *
 * Diagnostic answer persistence (q1-q5 from onboarding-context)
 * deliberately deferred to slice 14 — the q1/q2/q3/q4/q5 vector
 * rides along on the funnel_signup_completed event metadata.
 * trackOnboardingEvent is a no-op stub today; slice 14 wires the
 * actual /api/onboarding-events POST. Bundling persistence into
 * this slice would mean touching /api/auth/* signup payload to
 * carry the diagnostic vector, which fits the HIGH-RISK gate.
 *
 * AuthGate fix bundled in this slice (_layout.tsx) so post-auth
 * traversal of /onboarding-new/* doesn't yank the user back to
 * /onboarding?step=1 by the !onboardingCompleted check.
 */

const PURPLE = "#7C5CFC";

type SignupMethod = "apple" | "google" | "email";

export default function AccountScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const tokens = makeAcuityTokens({ dark: false, accent: palette });
  const { refresh } = useAuth();
  const { signIn: googleSignIn, ready: googleReady } = useGoogleSignIn();
  const { q1, q2, q3, q4, q5 } = useOnboardingState();

  const [pendingMethod, setPendingMethod] = useState<SignupMethod | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pullQuote, setPullQuote] = useState<string | null>(null);

  // Pull-quote teaser at top — what the user is about to save.
  useEffect(() => {
    let cancelled = false;
    void getStoredTryExtraction().then((extraction) => {
      if (cancelled || !extraction) return;
      const summary =
        typeof extraction.summary === "string" ? extraction.summary : "";
      if (!summary.trim()) return;
      const trimmed = summary.trim();
      if (trimmed.length <= 120) {
        setPullQuote(trimmed);
        return;
      }
      const firstSentence = trimmed.match(/^[^.!?]+[.!?]/);
      if (firstSentence && firstSentence[0].length <= 180) {
        setPullQuote(firstSentence[0].trim());
        return;
      }
      const head = trimmed.slice(0, 140);
      const lastSpace = head.lastIndexOf(" ");
      setPullQuote(
        `${head.slice(0, lastSpace > 0 ? lastSpace : 140).trim()}…`
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Guard so a user double-tapping during the brief network window
  // can't fire two signup attempts on top of each other.
  const inflightRef = useRef(false);

  const claimAndRoute = async (
    method: SignupMethod,
    isFirst100: boolean,
    subscriptionStatus: string | undefined
  ) => {
    // Claim TrySession → real Entry. Bearer auth is now set by the
    // OAuth lib helpers (setToken). The claim endpoint accepts the
    // token in body and uses getAnySessionUserId for the user
    // resolution.
    const trySessionToken = await getStoredTrySessionToken();
    if (trySessionToken) {
      try {
        await api.post<{ ok: boolean; entryId?: string }>(
          "/api/try-recording/claim",
          { sessionToken: trySessionToken }
        );
        await clearStoredTrySession();
      } catch {
        // Non-fatal — user is signed up regardless. They'll see an
        // empty Entries list on first load; can re-record. Worth
        // surfacing in analytics later but not blocking the flow.
      }
    }

    // Persist diagnostic vector for slice 14 analytics rollup. The
    // event fires now but the network call is a no-op stub until
    // slice 14 wires /api/onboarding-events. The metadata bundle
    // gives slice 14 everything it needs to write UserOnboarding
    // columns or OnboardingEvent rows.
    void trackOnboardingEvent("funnel_signup_completed", {
      metadata: {
        method,
        isFirst100,
        q1,
        q2,
        q3,
        q4,
        q5,
      },
    });

    // Pull updated user state from server so AuthGate sees the
    // authenticated session.
    await refresh();

    // Pro-bypass (2026-06-01 P0 — Polly): a returning user signing
    // in with an existing Stripe-paid web account should NOT see the
    // mobile paywall. Apple 3.1.3(b) Multiplatform Services rule
    // permits this — the user already has an active subscription on
    // our platform; the iOS app is just another client. Skip the
    // funnel-paywall, mark onboarding complete server-side (so
    // AuthGate doesn't bounce them back into /onboarding the next
    // tick), and drop them on /(tabs).
    //
    // We trust the subscriptionStatus from the sign-in API response
    // (callers pass result.user.subscriptionStatus) rather than the
    // post-refresh useAuth() value — the refresh() above updates the
    // context via setState, but `user` from useAuth() in this
    // closure is the pre-refresh value (React state propagation).
    // The signup-response field is the source of truth at this
    // moment and avoids the closure-staleness footgun.
    if (subscriptionStatus === "PRO") {
      try {
        await api.post<{ ok: boolean }>("/api/onboarding/complete", {
          skipped: false,
        });
      } catch {
        // Non-fatal — AuthGate's own Pro-bypass (Fix C) catches the
        // user on the next AuthGate tick even if this POST drops.
      }
      router.replace("/(tabs)" as never);
      return;
    }

    router.replace("/onboarding-new/paywall" as never);
  };

  const isFirst100From = (
    trialEndsAt: string | null | undefined
  ): boolean => {
    if (!trialEndsAt) return false;
    const end = new Date(trialEndsAt).getTime();
    if (!Number.isFinite(end)) return false;
    const daysLeft = (end - Date.now()) / 86400_000;
    return daysLeft > 20; // 30-day trial → first-100; 14-day → standard
  };

  const onApplePress = async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setError(null);
    setPendingMethod("apple");
    void trackOnboardingEvent("funnel_signup_started", { value: "apple" });
    try {
      const result = await signInWithApple();
      if (!result.ok) {
        if (result.reason !== "Cancelled") {
          setError(friendlyErrorFor(result.reason));
          void trackOnboardingEvent("funnel_signup_failed", {
            value: `apple:${result.reason ?? "unknown"}`,
          });
        }
        return;
      }
      const isFirst100 = isFirst100From(result.user.trialEndsAt);
      await claimAndRoute("apple", isFirst100, result.user.subscriptionStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      setError("Couldn't sign in with Apple. Try again.");
      void trackOnboardingEvent("funnel_signup_failed", {
        value: `apple:${msg}`,
      });
    } finally {
      inflightRef.current = false;
      setPendingMethod(null);
    }
  };

  const onGooglePress = async () => {
    if (inflightRef.current) return;
    if (!googleReady) {
      setError("Google sign-in isn't ready yet. Try again in a moment.");
      return;
    }
    inflightRef.current = true;
    setError(null);
    setPendingMethod("google");
    void trackOnboardingEvent("funnel_signup_started", { value: "google" });
    try {
      const result = await googleSignIn();
      if (!result.ok) {
        if (result.reason !== "cancelled") {
          setError(friendlyErrorFor(result.reason));
          void trackOnboardingEvent("funnel_signup_failed", {
            value: `google:${result.reason ?? "unknown"}`,
          });
        }
        return;
      }
      const isFirst100 = isFirst100From(result.user.trialEndsAt);
      await claimAndRoute("google", isFirst100, result.user.subscriptionStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      setError("Couldn't sign in with Google. Try again.");
      void trackOnboardingEvent("funnel_signup_failed", {
        value: `google:${msg}`,
      });
    } finally {
      inflightRef.current = false;
      setPendingMethod(null);
    }
  };

  const onEmailContinue = async () => {
    if (inflightRef.current) return;
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    inflightRef.current = true;
    setError(null);
    setPendingMethod("email");
    void trackOnboardingEvent("funnel_signup_started", { value: "email" });
    try {
      const signupResult = await signUpWithPassword(trimmedEmail, password);
      if (!signupResult.ok) {
        setError(friendlyErrorFor(signupResult.reason));
        void trackOnboardingEvent("funnel_signup_failed", {
          value: `email:${signupResult.reason ?? "unknown"}`,
        });
        return;
      }
      // Two-step pattern: signup creates the User but doesn't return
      // a session token. signInWithPassword fetches the session +
      // user, with verification gating removed post-2026-05-24.
      const loginResult = await signInWithPassword(trimmedEmail, password);
      if (!loginResult.ok) {
        setError(friendlyErrorFor(loginResult.reason));
        void trackOnboardingEvent("funnel_signup_failed", {
          value: `email:${loginResult.reason ?? "unknown"}`,
        });
        return;
      }
      const isFirst100 = isFirst100From(loginResult.user.trialEndsAt);
      await claimAndRoute(
        "email",
        isFirst100,
        loginResult.user.subscriptionStatus
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      setError("Couldn't create your account. Try again.");
      void trackOnboardingEvent("funnel_signup_failed", {
        value: `email:${msg}`,
      });
    } finally {
      inflightRef.current = false;
      setPendingMethod(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 32,
            paddingBottom: 32,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 28,
              lineHeight: 34,
              fontWeight: "700",
              letterSpacing: -0.3,
              color: tokens.text,
            }}
          >
            Save this and keep building.
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 15,
              lineHeight: 22,
              color: tokens.textTer,
              marginTop: 8,
            }}
          >
            Your tasks and goals are waiting.
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 13,
              lineHeight: 19,
              color: tokens.textTer,
              marginTop: 12,
              fontStyle: "italic",
            }}
          >
            Your debrief will be deleted if you don&apos;t save it.
          </Text>

          {pullQuote && (
            <View
              style={{
                marginTop: 20,
                borderLeftWidth: 2,
                borderLeftColor: tokens.cardBorder,
                paddingLeft: 12,
                opacity: 0.7,
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 9,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  color: tokens.textTer,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Saving
              </Text>
              <Text
                style={{
                  fontFamily: tokens.fontSans,
                  fontSize: 13,
                  lineHeight: 19,
                  color: tokens.textSec,
                }}
              >
                &ldquo;{pullQuote}&rdquo;
              </Text>
            </View>
          )}

          {/* Apple FIRST per Guideline 4.8 */}
          <View style={{ marginTop: 32, gap: 10 }}>
            <OAuthButton
              label="Continue with Apple"
              onPress={onApplePress}
              busy={pendingMethod === "apple"}
              disabled={pendingMethod !== null}
              variant="dark"
              tokens={tokens}
            />
            <OAuthButton
              label="Continue with Google"
              onPress={onGooglePress}
              busy={pendingMethod === "google"}
              disabled={pendingMethod !== null || !googleReady}
              variant="outline"
              tokens={tokens}
            />
            {!emailExpanded ? (
              <OAuthButton
                label="Continue with email"
                onPress={() => {
                  setEmailExpanded(true);
                  setError(null);
                }}
                busy={false}
                disabled={pendingMethod !== null}
                variant="outline"
                tokens={tokens}
              />
            ) : (
              <View style={{ gap: 10, marginTop: 4 }}>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor={tokens.textTer}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={pendingMethod === null}
                  style={{
                    borderRadius: tokens.radius.lg,
                    borderWidth: 0.5,
                    borderColor: tokens.cardBorder,
                    backgroundColor: tokens.cardBg,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontFamily: tokens.fontSans,
                    fontSize: 15,
                    color: tokens.text,
                  }}
                />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (8+ characters)"
                  placeholderTextColor={tokens.textTer}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  secureTextEntry
                  editable={pendingMethod === null}
                  style={{
                    borderRadius: tokens.radius.lg,
                    borderWidth: 0.5,
                    borderColor: tokens.cardBorder,
                    backgroundColor: tokens.cardBg,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontFamily: tokens.fontSans,
                    fontSize: 15,
                    color: tokens.text,
                  }}
                />
                <Pressable
                  onPress={() => void onEmailContinue()}
                  disabled={pendingMethod !== null}
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  style={({ pressed }) => ({
                    backgroundColor: PURPLE,
                    borderRadius: tokens.radius.pill,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity:
                      pressed || pendingMethod === "email" ? 0.85 : 1,
                  })}
                >
                  {pendingMethod === "email" ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 15,
                        fontWeight: "600",
                        color: "#ffffff",
                      }}
                    >
                      Continue
                    </Text>
                  )}
                </Pressable>
              </View>
            )}
          </View>

          {error && (
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                lineHeight: 19,
                color: tokens.bad,
                marginTop: 16,
              }}
            >
              {error}
            </Text>
          )}

          <View style={{ flex: 1 }} />

          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 11,
              lineHeight: 16,
              color: tokens.textTer,
              textAlign: "center",
              marginTop: 32,
            }}
          >
            By continuing, you agree to our{" "}
            <Text
              onPress={() =>
                void Linking.openURL("https://getacuity.io/terms")
              }
              style={{ textDecorationLine: "underline" }}
            >
              Terms
            </Text>{" "}
            and{" "}
            <Text
              onPress={() =>
                void Linking.openURL("https://getacuity.io/privacy")
              }
              style={{ textDecorationLine: "underline" }}
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function OAuthButton({
  label,
  onPress,
  busy,
  disabled,
  variant,
  tokens,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  variant: "dark" | "outline";
  tokens: ReturnType<typeof makeAcuityTokens>;
}) {
  const isDark = variant === "dark";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        backgroundColor: isDark ? tokens.text : tokens.cardBg,
        borderRadius: tokens.radius.pill,
        paddingVertical: 14,
        alignItems: "center",
        borderWidth: isDark ? 0 : 0.5,
        borderColor: tokens.cardBorder,
        opacity: pressed || busy ? 0.85 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator color={isDark ? tokens.bg : tokens.text} />
      ) : (
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 15,
            fontWeight: "600",
            color: isDark ? tokens.bg : tokens.text,
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function friendlyErrorFor(reason: string | undefined): string {
  switch (reason) {
    case "AlreadyRegistered":
      return "Looks like you already have an account. Try signing in instead.";
    case "InvalidCredentials":
      return "Couldn't sign you in. Double-check your email and password.";
    case "WeakPassword":
      return "Password needs at least 8 characters.";
    case "InvalidEmail":
      return "That email doesn't look right.";
    case "RateLimited":
      return "Too many attempts. Wait a minute and try again.";
    case "NetworkError":
      return "Network hiccup. Check your connection and try again.";
    case "Unavailable":
      return "Apple sign-in isn't available on this device.";
    case "no_token":
    case "NoIdentityToken":
      return "Something went wrong with sign-in. Try again.";
    case "ServerRejected":
      return "Account creation failed on our end. Try a different method.";
    case "EmailNotVerified":
      return "Verify your email, then come back and sign in.";
    default:
      return "Sign-in didn't go through. Try again.";
  }
}
