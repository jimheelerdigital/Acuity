"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { completeOnboarding } from "./actions";

interface Props {
  step: number;
  totalSteps: number;
  children: React.ReactNode;
}

/**
 * Shared chrome for every onboarding step: progress bar at the top,
 * Back / Skip / Continue row at the bottom, consistent padding +
 * max-width. Step-specific content is rendered as `children`.
 *
 * Navigation is URL-driven (?step=N) so browser back/forward works
 * and the page.tsx server component can resume users where they left
 * off even after a tab close.
 */
export function OnboardingShell({ step, totalSteps, children }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canGoBack = step > 1;
  const isLastStep = step === totalSteps;
  const progress = Math.round((step / totalSteps) * 100);

  function goToStep(n: number) {
    if (n < 1) n = 1;
    if (n > totalSteps) n = totalSteps;
    startTransition(() => {
      router.push(`/onboarding?step=${n}`);
    });
  }

  async function finish() {
    startTransition(async () => {
      await completeOnboarding();
      router.push("/dashboard?onboarded=1");
    });
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] px-6 py-8 sm:py-16">
      <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col">
        {/* Progress bar */}
        <div className="mb-10">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
            <span>
              Step {step} of {totalSteps}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1">{children}</div>

        {/* Nav row */}
        <div className="mt-10 flex items-center justify-between">
          {canGoBack ? (
            <button
              onClick={() => goToStep(step - 1)}
              disabled={isPending}
              className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition hover:text-zinc-900 disabled:opacity-40"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-zinc-600"
            >
              Skip for now
            </Link>
            {isLastStep ? (
              <button
                onClick={finish}
                disabled={isPending}
                className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isPending ? "Finishing…" : "Finish"}
              </button>
            ) : (
              <button
                onClick={() => goToStep(step + 1)}
                disabled={isPending}
                className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {isPending ? "…" : "Continue →"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
