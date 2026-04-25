"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { trackClient } from "@/lib/analytics-client";

import { useOnboarding } from "../onboarding-context";

/**
 * Step 8 — First real entry CTA.
 *
 * Owns its own primary button (the shell hides the Continue button on
 * the last step). Tapping "Record your first entry" closes out
 * onboarding (POST /api/onboarding/complete with skipped:false),
 * fires `onboarding_completed`, then routes to /dashboard where the
 * real record button lives. The `?onboarded=1` query param lets the
 * dashboard show a subtle welcome nudge on first arrival.
 *
 * A secondary button — "I'll start later" — also completes onboarding
 * so we don't trap the user here, but lands them on the dashboard
 * without an auto-record nudge. Still fires onboarding_completed (not
 * skipped — they reached the last step).
 *
 * All of onboarding complete without them clicking the main CTA still
 * counts as natural completion; the skip event only fires from the
 * top-right Skip-for-now modal.
 */
export function Step8FirstEntryCta() {
  const router = useRouter();
  const { setCanContinue } = useOnboarding();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shell Continue is auto-hidden on isLastStep, but set canContinue
  // false defensively in case the hiding logic ever changes — the step
  // owns the nav, not the shell.
  useEffect(() => {
    setCanContinue(false);
  }, [setCanContinue]);

  async function complete(withRecord: boolean) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skipped: false }),
      });
      if (!res.ok && res.status !== 200) {
        // If the completion call fails, the user will land in onboarding
        // again next visit — annoying but not destructive. Surface a
        // retry rather than silently redirecting.
        throw new Error(`Completion failed (HTTP ${res.status})`);
      }
      trackClient("onboarding_completed", { finalStep: 8 });
      router.push(`/home${withRecord ? "?onboarded=1" : "?onboarded=done"}`);
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-4xl">
        You&rsquo;re set. The mic is waiting.
      </h1>

      <p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        One more thing and you&rsquo;re in the dashboard. Thirty seconds
        tonight is enough — whatever you record becomes the first
        data point of your first week.
      </p>

      <div className="mt-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4 text-sm text-zinc-500 dark:text-zinc-400">
        <p>
          <strong className="text-zinc-900 dark:text-zinc-50">One tip.</strong> Don&rsquo;t
          plan what you&rsquo;re going to say. The whole loop works better
          when you talk like you&rsquo;re on a long drive and nobody&rsquo;s
          listening. We&rsquo;re not scoring the recording. The AI is
          looking for signal, not polish.
        </p>
      </div>

      <div className="mt-10 flex flex-col items-stretch gap-3">
        <button
          onClick={() => complete(true)}
          disabled={isSubmitting}
          className="flex items-center justify-center gap-3 rounded-full bg-[#7C5CFC] px-7 py-4 text-base font-semibold text-white shadow-md transition hover:bg-[#6B4FE0] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
        >
          <MicIcon />
          {isSubmitting ? "Listening…" : "Record your first entry"}
        </button>
        <button
          onClick={() => complete(false)}
          disabled={isSubmitting}
          className="rounded-full px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 transition hover:text-zinc-900 disabled:opacity-40"
        >
          I&rsquo;ll start later
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-600">
          {error} — try again, or reload the page.
        </p>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}
