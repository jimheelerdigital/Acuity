import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { applyReminderSchedule, syncRandomNudges } from "@/lib/notifications";

import { OnboardingContext, type OnboardingContextValue } from "./context";

/**
 * Mobile counterpart to apps/web/src/app/onboarding/onboarding-shell.tsx.
 * Owns: progress dots, Back / Continue row. Each step component
 * reads/writes OnboardingContext to gate the Continue button and to
 * queue data for the next POST.
 *
 * Navigation is URL-driven (?step=N via expo-router) so system-back +
 * deep links resume cleanly and the AuthGate in _layout.tsx can drop
 * users directly into a specific step.
 *
 * Build-41 verification (2026-05-14) found that despite the previous
 * fix making the mic step itself non-skippable in the footer, the
 * top-right "Skip for now" (skip-entire-onboarding) was still
 * letting users escape the mic permission step + the new AI consent
 * step. Apple Guideline 5.1.1(iv) is unambiguous: no skip past the
 * mic permission UI. Product call (2026-05-14): remove ALL skip
 * affordances from onboarding — every user clicks through every
 * step. Per-step optionality is preserved within step components
 * (mood, life-areas, reminders can be submitted with blank inputs),
 * but the user cannot bypass the steps themselves.
 */

interface Props {
  step: number;
  totalSteps: number;
  children: ReactNode;
}

export function OnboardingShell({
  step,
  totalSteps,
  children,
}: Props) {
  const router = useRouter();
  const { user, refresh, setAuthenticatedUser } = useAuth();
  const { tokens } = useTheme();
  const [canContinue, setCanContinue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Phase C (2026-05-21): a step can opt out of the shell's
  // Continue/Back footer when it ships its own internal navigation
  // (e.g. the life-matrix baseline carousel that advances through
  // 10 sub-axes inside a single onboarding step).
  const [hideShellChrome, setHideShellChrome] = useState(false);
  // Per-step captured form state. Survives step remounts inside this
  // single shell instance so back-navigation (re-mounts the prior
  // step) can rehydrate fields from the user's earlier answers.
  // Keyed by step number.
  const capturedByStepRef = useRef<Record<number, Record<string, unknown>>>({});

  // Keyboard visibility — when the keyboard is up, hide the
  // Continue/Back/Skip footer so the user can't mis-tap "Continue"
  // thinking it's a dismiss-keyboard button.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Force dark mode for the entire onboarding flow regardless of the
  // user's preference. Brand identity is dark-first; light-mode polish
  // for onboarding isn't worth the maintenance cost since the user only
  // sees this surface once. Restore their previous preference on
  // unmount so the rest of the app still honors their choice.
  const { colorScheme, setColorScheme } = useColorScheme();
  useEffect(() => {
    const previous = colorScheme;
    setColorScheme("dark");
    return () => {
      if (previous && previous !== "dark") setColorScheme(previous);
    };
    // Only run on mount/unmount — re-running on `colorScheme` changes
    // would fight the very override we just installed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Writes are scoped to the CURRENT step. The shell's `step` prop
  // tells us which slot to update; the step component just hands us
  // its current form snapshot.
  const setCapturedData = useCallback(
    (data: Record<string, unknown> | null) => {
      if (data === null) {
        delete capturedByStepRef.current[step];
      } else {
        capturedByStepRef.current[step] = data;
      }
    },
    [step]
  );

  const getCapturedData = useCallback(
    (s: number): Record<string, unknown> | null =>
      capturedByStepRef.current[s] ?? null,
    []
  );

  // goNext defined below uses `persist` which depends on `step`; forward
  // declare via a ref to keep the contextValue stable across renders.
  const goNextRef = useRef<() => void>(() => {});
  const contextValue = useMemo<OnboardingContextValue>(
    () => ({
      step,
      setCanContinue,
      setCapturedData,
      getCapturedData,
      setHideShellChrome,
      goNext: () => goNextRef.current(),
    }),
    [step, setCapturedData, getCapturedData]
  );

  const persist = useCallback(async () => {
    const data = capturedByStepRef.current[step];
    if (!data) return;
    try {
      await api.post("/api/onboarding/update", { step, data });
    } catch (err) {
      // Non-fatal — the user has already navigated by the time this
      // resolves (goNext fires this as fire-and-forget). 2026-05-29
      // P0: previously silent; now log via console.error so TestFlight
      // captures the failure mode that caused the step-9 hang.
      console.error("[onboarding/persist] failed:", err);
    }

    // Side-effect: if this step captured reminder prefs, apply them to
    // the OS scheduler too. Idempotent (cancel-then-reschedule) so
    // double-fires are harmless. Keeps the scheduling logic out of
    // the step component itself — the step only knows its UI state;
    // the shell bridges UI state → both the server and the OS.
    if (
      typeof data.notificationsEnabled === "boolean" &&
      typeof data.notificationTime === "string" &&
      Array.isArray(data.notificationDays)
    ) {
      const enabled = data.notificationsEnabled;
      const time = data.notificationTime;
      const days = data.notificationDays as number[];
      applyReminderSchedule({ enabled, time, days }).catch(() => {
        // Permission-denied + network errors are visible enough
        // via the step UI itself; failure here shouldn't block nav.
      });
      // Slice P3A — also seed the random nudge window. Same days as
      // the main reminder; main time is buffered so the random fire
      // doesn't land within 2h. Bailing on reminders=disabled
      // cancels any leftover random triggers too.
      syncRandomNudges({
        activeWeekdays: enabled ? days : [],
        mainTimes: enabled ? [time] : [],
      }).catch(() => {});
    }
  }, [step]);

  // Debounce ref — guards against accidental double-taps overshooting
  // to step+2 before the new step's UI has rendered. 300ms is short
  // enough to be invisible to a single-tap user, long enough to dedupe
  // bounce taps.
  const inFlightRef = useRef(false);

  const goNext = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setTimeout(() => {
      inFlightRef.current = false;
    }, 300);
    // 2026-05-29 P0: navigation no longer waits on the API write.
    // The write was already best-effort (catch in persist() doesn't
    // gate nav since 2026-05-14); now it's also decoupled from the
    // spinner so a hung /api/onboarding/update can't trap the user
    // mid-onboarding. The 10s timeout in lib/api.ts is the safety net
    // for the persist itself.
    void persist();
    if (step < totalSteps) {
      router.replace(`/onboarding?step=${step + 1}`);
    }
  }, [persist, router, step, totalSteps]);

  // Keep the ref pointed at the latest goNext so the contextValue's
  // forwarder always invokes the current closure.
  goNextRef.current = goNext;

  const goBack = useCallback(() => {
    if (step <= 1) return;
    router.replace(`/onboarding?step=${step - 1}`);
  }, [router, step]);

  const complete = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setTimeout(() => {
      inFlightRef.current = false;
    }, 300);
    // 2026-05-29 P0: optimistic flip + immediate nav. The local user
    // state is flipped to onboardingCompleted=true synchronously so
    // the AuthGate routes past onboarding on the very next render;
    // router.replace also fires immediately. Server writes (persist,
    // /api/onboarding/complete, refresh) run in the background — any
    // failure is surfaced via console.error but does NOT block the
    // user, who has already arrived at /(tabs). The next refresh tick
    // reconciles server state.
    //
    // Build-42 had this awaiting all three APIs serially; if /complete
    // hung the Finish-step user got trapped exactly the same way the
    // step-9 spinner trapped users on /update. Same defensive pattern
    // as goNext above.
    if (user) {
      setAuthenticatedUser({ ...user, onboardingCompleted: true });
    }
    router.replace("/(tabs)");
    void persist().catch((err) =>
      console.error("[onboarding-complete] persist failed:", err)
    );
    // BUG A fix: chain refresh AFTER /complete resolves, not in parallel.
    // Previously both fired fire-and-forget; if refresh()'s GET /me landed
    // before /complete committed, /me returned the pre-completion state
    // (onboardingCompleted=false, currentStep=4) and overwrote the
    // optimistic flip above → AuthGate briefly routed to /onboarding?step=4
    // (the "glitch back to step 4"). Sequencing guarantees /me reflects
    // completion before it can replace local state.
    void api
      .post("/api/onboarding/complete", { skipped: false })
      .catch((err) =>
        console.error("[onboarding-complete] /complete failed:", err)
      )
      .finally(() => {
        void refresh().catch((err) =>
          console.error("[onboarding-complete] refresh failed:", err)
        );
      });
  }, [persist, refresh, router, setAuthenticatedUser, user]);

  const isLastStep = step >= totalSteps;

  return (
    <OnboardingContext.Provider value={contextValue}>
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: tokens.bg }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          {/* Header — progress dots only. The previous top-right
              "Skip for now" affordance was removed 2026-05-14 per
              build-41 verification finding: even though step 4 (mic)
              was removed from the footer Skip list, this header
              control still let users bypass the OS permission prompt.
              Apple Guideline 5.1.1(iv) requires no skip path past
              the mic permission step. Product call: remove all skip
              UI; every user clicks through every step. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: 8,
            }}
          >
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const filled = i < step;
                if (filled) {
                  return (
                    <LinearGradient
                      key={i}
                      colors={tokens.gradMix.colors}
                      locations={tokens.gradMix.locations}
                      start={tokens.gradMix.start}
                      end={tokens.gradMix.end}
                      style={{ height: 4, flex: 1, borderRadius: 999 }}
                    />
                  );
                }
                return (
                  <View
                    key={i}
                    style={{
                      height: 4,
                      flex: 1,
                      borderRadius: 999,
                      backgroundColor: tokens.line,
                    }}
                  />
                );
              })}
            </View>
          </View>
          <Text
            style={{
              paddingHorizontal: 20,
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: tokens.textTer,
            }}
          >
            Step {step} of {totalSteps}
          </Text>

          {/* Step body */}
          <ScrollView
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 40,
              flexGrow: 1,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {/* Footer — Back / Continue. Hidden while the keyboard is
              open so the user can't mis-tap "Continue" thinking it's
              a dismiss-keyboard button. The ScrollView's
              keyboardShouldPersistTaps="handled" lets users tap
              outside any text input to dismiss. Per-step Skip
              removed 2026-05-14 (see header comment for rationale).
              Phase C (2026-05-21): also hidden when the current step
              opts out via setHideShellChrome(true) — steps with
              internal sub-navigation own their own pill + back arrow. */}
          {!keyboardOpen && !hideShellChrome && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderTopWidth: 0.5,
              borderTopColor: tokens.line,
              paddingHorizontal: 20,
              paddingVertical: 12,
            }}
          >
            <Pressable
              onPress={goBack}
              disabled={step <= 1}
              hitSlop={6}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 8,
                opacity: step <= 1 ? 0 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "600",
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: tokens.textSec,
                }}
              >
                ← Back
              </Text>
            </Pressable>
            <Pressable
              onPress={() => (isLastStep ? complete() : goNext())}
              disabled={!canContinue || submitting}
              accessibilityRole="button"
              style={{
                borderRadius: 999,
                overflow: "hidden",
                opacity: !canContinue || submitting ? 0.4 : 1,
                shadowColor: tokens.glowPrimary.color,
                shadowOffset: { width: 0, height: 4 },
                shadowRadius: tokens.glowPrimary.radius,
                shadowOpacity:
                  Platform.OS === "ios" && canContinue && !submitting
                    ? tokens.glowPrimary.opacity
                    : 0,
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={tokens.gradPrimary.colors}
                locations={tokens.gradPrimary.locations}
                start={tokens.gradPrimary.start}
                end={tokens.gradPrimary.end}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 22,
                  paddingVertical: 11,
                }}
              >
                {submitting && (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                )}
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 12,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    color: "#ffffff",
                  }}
                >
                  {isLastStep ? "Finish" : "Continue"}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </OnboardingContext.Provider>
  );
}
