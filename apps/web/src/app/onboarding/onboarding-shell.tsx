"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { trackClient } from "@/lib/analytics-client";

import {
  OnboardingContext,
  type OnboardingContextValue,
} from "./onboarding-context";

interface Props {
  step: number;
  totalSteps: number;
  /**
   * Step numbers (1-8) where the user may bypass the step's answer
   * without filling it in. Per spec: only step 3 (microphone
   * permission — you can continue without granting) and step 5 (mood
   * baseline — it's a soft signal). Others are either forced by
   * interaction (step 4 practice recording, step 6 life-area picks)
   * or natural dead-ends (steps 1, 2, 7, 8).
   */
  skippableSteps?: number[];
  children: React.ReactNode;
}

const DEFAULT_SKIPPABLE = [3, 5];

/**
 * Shared chrome for the onboarding flow. Owns:
 *
 * - Progress dots + "Step N of 8" label (top-left).
 * - "Skip for now" link with confirmation modal (top-right). Confirm
 *   marks UserOnboarding.completedAt = now so we never loop the user
 *   back here, and fires `onboarding_skipped` with the step number.
 * - Back / [Skip step] / Continue button row (bottom).
 *
 * Each step component reads/writes the OnboardingContext to tell the
 * shell whether it's ready to advance (setCanContinue) and what
 * answers to persist (setCapturedData). The shell bundles the latest
 * captured data + step number into one POST /api/onboarding/update
 * call before routing to the next step.
 *
 * Navigation is URL-driven (?step=N) so browser back/forward work and
 * the server page can resume users where they left off after a tab
 * close.
 */
export function OnboardingShell({
  step,
  totalSteps,
  skippableSteps = DEFAULT_SKIPPABLE,
  children,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [canContinue, setCanContinue] = useState(true);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const capturedRef = useRef<Record<string, unknown> | null>(null);

  // Fire onboarding_started exactly once on first mount of step 1.
  // Re-mounts within the same step shouldn't re-fire; crossing into
  // step 1 from step 2 via back button shouldn't either.
  const startedRef = useRef(false);
  useEffect(() => {
    if (step === 1 && !startedRef.current) {
      startedRef.current = true;
      trackClient("onboarding_started", { step });
    }
  }, [step]);

  const setCapturedData = useCallback(
    (data: Record<string, unknown> | null) => {
      capturedRef.current = data;
    },
    []
  );

  const persistAndAdvance = useCallback(
    async (nextStep: number) => {
      const data = capturedRef.current ?? {};
      const sanitizedKeys = Object.keys(data);
      try {
        await fetch("/api/onboarding/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step, data }),
        });
      } catch {
        // Persistence is best-effort — a failed save shouldn't trap
        // the user on step N. The server still has the currentStep
        // from the page-load write.
      }
      trackClient("onboarding_step_completed", {
        step,
        nextStep,
        capturedKeys: sanitizedKeys,
      });
      router.push(`/onboarding?step=${nextStep}`);
    },
    [router, step]
  );

  const goBack = useCallback(() => {
    if (step <= 1) return;
    startTransition(() => {
      router.push(`/onboarding?step=${step - 1}`);
    });
  }, [router, step]);

  const goNext = useCallback(() => {
    if (step >= totalSteps) return;
    startTransition(() => {
      void persistAndAdvance(step + 1);
    });
  }, [persistAndAdvance, step, totalSteps]);

  const skipStep = useCallback(() => {
    if (!skippableSteps.includes(step)) return;
    startTransition(() => {
      // Skip-step doesn't persist the step's data (they didn't answer)
      // but still fires the _completed event with a skipped flag so
      // PostHog can separate skipped vs answered.
      capturedRef.current = null;
      trackClient("onboarding_step_completed", {
        step,
        nextStep: step + 1,
        skipped: true,
      });
      router.push(`/onboarding?step=${Math.min(step + 1, totalSteps)}`);
    });
  }, [router, skippableSteps, step, totalSteps]);

  const confirmSkipAll = useCallback(async () => {
    startTransition(async () => {
      try {
        await fetch("/api/onboarding/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ skipped: true, skippedAtStep: step }),
        });
      } catch {
        // If the complete call fails the user will just land back
        // here next visit. Non-fatal.
      }
      trackClient("onboarding_skipped", { skippedAtStep: step });
      router.push("/dashboard?onboarded=skip");
    });
  }, [router, step]);

  // advanceNow is the escape hatch for steps that own their own primary
  // button (step 4 "I heard myself, continue", step 8 "Record now"). It
  // still runs through persistAndAdvance so answers get saved.
  const advanceNow = useCallback(() => {
    startTransition(() => {
      void persistAndAdvance(Math.min(step + 1, totalSteps));
    });
  }, [persistAndAdvance, step, totalSteps]);

  const contextValue: OnboardingContextValue = useMemo(
    () => ({
      step,
      setCanContinue,
      setCapturedData,
      advanceNow,
    }),
    [advanceNow, setCapturedData, step]
  );

  // Each time the user crosses into a new step, reset the continue
  // state + captured-data ref so the new step starts clean. The step
  // component re-enables canContinue in its own effect when ready.
  useEffect(() => {
    capturedRef.current = null;
    setCanContinue(true);
  }, [step]);

  const isLastStep = step === totalSteps;
  const canGoBack = step > 1;
  const stepIsSkippable = skippableSteps.includes(step);

  return (
    <OnboardingContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#FAFAF7]">
        {/* Top row — progress + skip-all */}
        <header className="mx-auto flex max-w-lg items-center justify-between px-6 pt-8 sm:pt-10">
          <div className="flex items-center gap-3">
            <ProgressDots current={step} total={totalSteps} />
            <span className="text-xs font-medium text-zinc-400">
              {step} of {totalSteps}
            </span>
          </div>
          <button
            onClick={() => setShowSkipModal(true)}
            className="rounded-lg px-2 py-1 text-xs text-zinc-400 transition hover:text-zinc-700"
          >
            Skip for now
          </button>
        </header>

        {/* Step content */}
        <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col px-6 pt-10 pb-8 sm:pt-14">
          <div className="flex-1">{children}</div>

          {/* Bottom nav — back + [skip step] + continue.
              Steps that own their own primary button (4 + 8) hide the
              Continue button by setting canContinue=false + rendering
              their own CTA in the step content. Back stays available. */}
          <div className="mt-12 flex items-center justify-between gap-2">
            {canGoBack ? (
              <button
                onClick={goBack}
                disabled={isPending}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-40"
              >
                ← Back
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              {stepIsSkippable && !isLastStep && (
                <button
                  onClick={skipStep}
                  disabled={isPending}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-zinc-700 disabled:opacity-40"
                >
                  Skip this step
                </button>
              )}
              {!isLastStep && (
                <button
                  onClick={goNext}
                  disabled={!canContinue || isPending}
                  className="rounded-full bg-[#7C5CFC] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#6B4FE0] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {isPending ? "…" : "Continue"}
                </button>
              )}
            </div>
          </div>
        </main>

        {showSkipModal && (
          <SkipModal
            onClose={() => setShowSkipModal(false)}
            onConfirm={confirmSkipAll}
            isPending={isPending}
          />
        )}
      </div>
    </OnboardingContext.Provider>
  );
}

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isFilled = stepNum <= current;
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isFilled
                ? "w-5 bg-[#7C5CFC]"
                : "w-1.5 bg-zinc-200"
            }`}
          />
        );
      })}
    </div>
  );
}

function SkipModal({
  onClose,
  onConfirm,
  isPending,
}: {
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900">
          Skip the rest of onboarding?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          You can always come back from your dashboard. We&rsquo;ll use defaults
          for the questions you didn&rsquo;t answer.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending ? "Skipping…" : "Yes, skip"}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
          >
            Keep going
          </button>
        </div>
      </div>
    </div>
  );
}
