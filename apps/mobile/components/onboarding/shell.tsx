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
  Alert,
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
 * Owns: progress dots, "Skip for now" with confirmation, Back / Skip
 * step / Continue row. Each step component reads/writes
 * OnboardingContext to gate the Continue button and to queue data
 * for the next POST.
 *
 * Navigation is URL-driven (?step=N via expo-router) so system-back +
 * deep links resume cleanly and the AuthGate in _layout.tsx can drop
 * users directly into a specific step.
 */

interface Props {
  step: number;
  totalSteps: number;
  /** Step numbers where Skip step is allowed. Others are forced by
   *  their own interaction or land on natural dead-ends. */
  skippableSteps?: number[];
  children: ReactNode;
}

const DEFAULT_SKIPPABLE = [3, 4, 6, 9];

export function OnboardingShell({
  step,
  totalSteps,
  skippableSteps = DEFAULT_SKIPPABLE,
  children,
}: Props) {
  const router = useRouter();
  const { refresh } = useAuth();
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

  const skipStep = useCallback(async () => {
    // Step-level skip: clear THIS step's captured data so we don't
    // persist a partially-filled state the user explicitly walked
    // away from. Other steps' data is untouched so the user can
    // navigate back later and still find their earlier answers.
    delete capturedByStepRef.current[step];
    if (step < totalSteps) {
      router.replace(`/onboarding?step=${step + 1}`);
    }
  }, [router, step, totalSteps]);

  const complete = useCallback(
    async (asSkipped: boolean) => {
      setSubmitting(true);
      try {
        // Persist last step's captured data if any, then mark complete.
        await persist();
        await api.post("/api/onboarding/complete", {
          skipped: asSkipped,
          skippedAtStep: asSkipped ? step : undefined,
        });
        // Pull fresh `onboardingCompleted` from the server so the
        // AuthGate sees the flip without waiting for the next refresh.
        await refresh();
        router.replace("/(tabs)");
      } finally {
        setSubmitting(false);
      }
    },
    [persist, refresh, router, step]
  );

  const skipAll = useCallback(() => {
    Alert.alert(
      "Skip setup?",
      "You can come back to this from Profile later.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Skip",
          style: "destructive",
          onPress: () => complete(true),
        },
      ]
    );
  }, [complete]);

  const isLastStep = step >= totalSteps;
  const canSkipStep = skippableSteps.includes(step);

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
          {/* Header — progress dots + Skip-all */}
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
            <Pressable onPress={skipAll} hitSlop={8} className="ml-3">
              <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                Skip for now
              </Text>
            </Pressable>
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

          {/* Footer — Back / Skip / Continue. Hidden while the
              keyboard is open so the user can't mis-tap "Continue"
              thinking it's a dismiss-keyboard button. The
              ScrollView's keyboardShouldPersistTaps="handled" lets
              users tap outside any text input to dismiss. */}
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
              {canSkipStep && !isLastStep && (
                <Pressable
                  onPress={skipStep}
                  hitSlop={6}
                  className="px-2 py-2"
                >
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    Skip
                  </Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => (isLastStep ? complete(false) : goNext())}
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
