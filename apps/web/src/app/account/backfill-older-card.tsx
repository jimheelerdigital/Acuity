"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * /account "Process older entries" surface — v1.1 slice 5
 * permanent re-trigger for the 60d+ bucket. Per
 * docs/v1-1/free-tier-phase2-plan.md §A.6: shows only when
 * olderCount > 0; cost-warned in the modal because older runs
 * can take 10-20 min for users with deep histories.
 *
 * The "Process recent entries" surface (re-runs the 60d window
 * for users who dismissed the home banner) is implicit — re-
 * dispatching window=recent on a user with no recent eligible
 * entries is a no-op via the WHERE filter. We surface only the
 * older variant here to avoid two-cards UX where both might
 * appear; recent backfill is the home-banner conversion path.
 */
export function BackfillOlderEntriesCard({
  olderCount,
  inFlight,
}: {
  olderCount: number;
  inFlight: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/backfill/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ window: "older" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't start — try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <section
        className="mt-8 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6"
        data-section="backfill-older"
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Older entries
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          You have {olderCount} {olderCount === 1 ? "entry" : "entries"} from
          more than 60 days ago that haven&apos;t been processed yet. They live
          on as transcripts; processing pulls themes, tasks, and goal flags
          from each one.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={inFlight}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {inFlight
              ? "Processing…"
              : `Process older entries (${olderCount} remaining)`}
          </button>
        </div>
      </section>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Process {olderCount} older {olderCount === 1 ? "entry" : "entries"}?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              This can take 10-20 minutes for users with deep histories.
              You&apos;ll get an email when it&apos;s done.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start"}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-xs text-red-500 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
