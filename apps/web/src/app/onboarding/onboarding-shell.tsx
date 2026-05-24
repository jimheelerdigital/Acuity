"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/acuity";
import { trackClient } from "@/lib/analytics-client";

import {
  OnboardingContext,
  type OnboardingContextValue,
} from "./onboarding-context";

interface Props {
  step: number;
  totalSteps: number;
  /**
   * Step numbers (1-10) where the user may bypass the step's answer
   * without filling it in. After the 2026-04-20 10-step reorder:
   *   - step 3 (demographics — all optional)
   *   - step 4 (microphone — permission-granted is soft)
   *   - step 6 (mood baseline)
   *   - step 9 (notifications — "Not now" is fine)
   * Others are interaction-forced (step 5 practice recording) or
   * read-only display surfaces (1, 2, 7 weekly-report priming, 8
   * trial explanation, 10 first-entry CTA) where the Continue
   * button is sufficient and a Skip link would be noise.
   */
  skippableSteps?: number[];
  children: React.ReactNode;
}

const DEFAULT_SKIPPABLE = [3, 4, 6, 9];

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

  // Force dark mode for the entire onboarding flow regardless of the
  // user's preference. Brand identity is dark-first; the light-mode
  // styling here is half-baked and not worth fixing for a one-shot
  // surface. Restore their preference on unmount.
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    const previous = theme;
    setTheme("dark");
    return () => {
      if (previous && previous !== "dark") setTheme(previous);
    };
    // Only run on mount/unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      router.push("/home?onboarded=skip");
    });
  }, [router, step]);

  const contextValue: OnboardingContextValue = useMemo(
    () => ({
      step,
      setCanContinue,
      setCapturedData,
    }),
    [setCapturedData, step]
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
      <div className="min-h-screen bg-acuity-bg text-acuity-text">
        {/* Top row — progress + skip-all */}
        <header className="mx-auto flex max-w-lg items-center justify-between px-6 pt-8 sm:pt-10">
          <div className="flex items-center gap-3">
            <ProgressDots current={step} total={totalSteps} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
              {step} of {totalSteps}
            </span>
          </div>
          <button
            onClick={() => setShowSkipModal(true)}
            className="rounded-acuity-sm px-2 py-1 text-xs text-acuity-text-ter transition hover:text-acuity-text-sec"
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
                className="rounded-acuity-sm px-3 py-2 text-sm font-medium text-acuity-text-sec transition hover:text-acuity-text disabled:opacity-40"
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
                  className="rounded-acuity-sm px-3 py-2 text-sm text-acuity-text-ter transition hover:text-acuity-text-sec disabled:opacity-40"
                >
                  Skip this step
                </button>
              )}
              {!isLastStep && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={goNext}
                  disabled={!canContinue || isPending}
                >
                  {isPending ? "…" : "Continue"}
                </Button>
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
    <div
      className="flex items-center gap-1.5"
      aria-label={`Step ${current} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isFilled = stepNum <= current;
        return (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              isFilled
                ? "w-5 bg-acuity-primary"
                : "w-1.5 bg-acuity-line-strong"
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
     
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg p-6 shadow-acuity-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg font-semibold text-acuity-text">
          Skip the rest of onboarding?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-acuity-text-sec">
          You can come back to this from your dashboard. We&rsquo;ll
          use defaults for the questions you didn&rsquo;t answer.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Skipping…" : "Yes, skip"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Keep going
          </Button>
        </div>
      </div>
    </div>
  );
}
