import { useRouter } from "expo-router";
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
import { api } from "@/lib/api";
import { applyReminderSchedule } from "@/lib/notifications";

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
  const [canContinue, setCanContinue] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  const contextValue = useMemo<OnboardingContextValue>(
    () => ({ step, setCanContinue, setCapturedData, getCapturedData }),
    [step, setCapturedData, getCapturedData]
  );

  const persist = useCallback(async () => {
    const data = capturedByStepRef.current[step];
    if (!data) return;
    try {
      await api.post("/api/onboarding/update", { step, data });
    } catch {
      // Non-fatal — the user can re-answer on a retry. Alerting here
      // would break the perceived "tap → move on" rhythm; if it
      // matters, the next step's own write will surface the error.
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
      applyReminderSchedule({
        enabled: data.notificationsEnabled,
        time: data.notificationTime,
        days: data.notificationDays as number[],
      }).catch(() => {
        // Permission-denied + network errors are visible enough
        // via the step UI itself; failure here shouldn't block nav.
      });
    }
  }, [step]);

  const goNext = useCallback(async () => {
    setSubmitting(true);
    await persist();
    setSubmitting(false);
    if (step < totalSteps) {
      router.replace(`/onboarding?step=${step + 1}`);
    }
  }, [persist, router, step, totalSteps]);

  const goBack = useCallback(() => {
    if (step <= 1) return;
    router.replace(`/onboarding?step=${step - 1}`);
  }, [router, step]);

  const complete = useCallback(
    async () => {
      setSubmitting(true);
      try {
        // Persist last step's captured data — best-effort, never blocks nav.
        try {
          await persist();
        } catch (err) {
          console.warn("[onboarding-complete] persist failed:", err);
        }
        // Tell the server we're done — best-effort, never blocks nav.
        // If this throws (auth race, network, server hiccup) the user
        // stays trapped in onboarding under the old behavior. Now we
        // log + continue, and the local AuthGate-routing fallback
        // below ensures the user reaches /(tabs).
        // skipped: false always — the skip-all and per-step skip UI
        // were removed 2026-05-14; preserving the server contract by
        // continuing to send the field.
        try {
          await api.post("/api/onboarding/complete", {
            skipped: false,
          });
        } catch (err) {
          console.warn("[onboarding-complete] API failed:", err);
        }
        // Patch the in-memory user state so the AuthGate
        // (apps/mobile/app/_layout.tsx) sees onboardingCompleted=true
        // immediately, routing to /(tabs) on the next render. Belt-
        // and-suspenders: also explicit router.replace below.
        // Critical-path bugfix 2026-05-05 — without this, Jim was
        // locked in onboarding because /api/onboarding/complete was
        // failing (likely the same bearer-attach race the OAuth fix
        // bypassed) and the function bailed before refresh+navigate.
        if (user) {
          setAuthenticatedUser({ ...user, onboardingCompleted: true });
        }
        // Best-effort refresh to align with server state. Failure here
        // is fine — local state already says "done."
        try {
          await refresh();
        } catch (err) {
          console.warn("[onboarding-complete] refresh failed:", err);
        }
        router.replace("/(tabs)");
      } finally {
        setSubmitting(false);
      }
    },
    [persist, refresh, router, setAuthenticatedUser, user]
  );

  const isLastStep = step >= totalSteps;

  return (
    <OnboardingContext.Provider value={contextValue}>
      <SafeAreaView
        edges={["top", "bottom"]}
        className="flex-1 bg-[#0B0B12]"
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
          <View className="flex-row items-center justify-between px-5 pt-3 pb-2">
            <View className="flex-1 flex-row items-center gap-1.5">
              {Array.from({ length: totalSteps }).map((_, i) => {
                const filled = i < step;
                return (
                  <View
                    key={i}
                    className={`h-1 flex-1 rounded-full ${
                      filled
                        ? "bg-violet-600"
                        : "bg-zinc-200 dark:bg-white/10"
                    }`}
                  />
                );
              })}
            </View>
          </View>
          <Text className="px-5 text-[11px] text-zinc-400 dark:text-zinc-500">
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
              removed 2026-05-14 (see header comment for rationale). */}
          {!keyboardOpen && (
          <View className="flex-row items-center justify-between gap-3 border-t border-zinc-100 dark:border-white/10 px-5 py-3">
            <Pressable
              onPress={goBack}
              disabled={step <= 1}
              hitSlop={6}
              className="px-2 py-2"
              style={{
                opacity: step <= 1 ? 0 : 1,
              }}
            >
              <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                ← Back
              </Text>
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => (isLastStep ? complete() : goNext())}
                disabled={!canContinue || submitting}
                style={{
                  opacity: !canContinue || submitting ? 0.4 : 1,
                }}
                className="flex-row items-center gap-1.5 rounded-full bg-violet-600 px-5 py-2.5"
              >
                {submitting && (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                )}
                <Text className="text-sm font-semibold text-white">
                  {isLastStep ? "Finish" : "Continue"}
                </Text>
              </Pressable>
            </View>
          </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </OnboardingContext.Provider>
  );
}
