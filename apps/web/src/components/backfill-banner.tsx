"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Process my history" banner — v1.1 slice 5. Shown above the
 * dashboard grid when:
 *   - user is PRO/TRIAL/PAST_DUE (canExtractEntries === true)
 *   - User.backfillPromptDismissedAt is null
 *   - At least one Entry exists with extracted=false AND
 *     rawAnalysis IS NULL within the 60d window
 *
 * The decision lives at the server-component layer — this client
 * component just renders the surface and threads the two side
 * effects (dispatch / dismiss).
 *
 * Spec: docs/v1-1/free-tier-phase2-plan.md §A.5.
 */
export function BackfillBanner({
  recentCount,
  olderCount,
}: {
  recentCount: number;
  olderCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = async () => {
    setBusy("no");
    setError(null);
    try {
      const res = await fetch("/api/backfill/dismiss", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (e) {
      setError("Couldn't dismiss — try again.");
      setBusy(null);
    }
  };

  const confirmYes = async () => {
    setBusy("yes");
    setError(null);
    try {
      const res = await fetch("/api/backfill/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ window: "recent" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Banner disappears via the next router.refresh() —
      // backfillPromptDismissedAt is set server-side by the route.
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      setError("Couldn't start — try again.");
      setBusy(null);
    }
  };

  const bodyText =
    olderCount > 0
      ? `We'll process the last 60 days of your entries (${recentCount} total). Older entries (${olderCount}) stay as transcripts — you can process those later from your account settings.`
      : `We'll process your ${recentCount} ${recentCount === 1 ? "entry" : "entries"}. Takes a few minutes.`;

  return (
    <>
      <section
        data-surface-id="backfill_prompt_home"
        className="mb-6 rounded-2xl border border-violet-200 dark:border-violet-900/40 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-[#1E1E2E] p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          Welcome to Pro
        </p>
        <h3 className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Process the entries you recorded on free?
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {bodyText}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={busy !== null}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            Yes, process them
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={busy !== null}
            className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-700 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50"
          >
            {busy === "no" ? "Dismissing…" : "No thanks"}
          </button>
          {error && (
            <span className="text-xs text-red-500 dark:text-red-400">{error}</span>
          )}
        </div>
      </section>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => busy === null && setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Process {recentCount} {recentCount === 1 ? "entry" : "entries"}?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              We&apos;ll process the {recentCount} {recentCount === 1 ? "entry" : "entries"} you recorded in the last 60 days.
              {olderCount > 0
                ? ` Older entries (${olderCount}) can be processed later from your account settings.`
                : ""}
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Done within 5 minutes for most users.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={busy !== null}
                className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmYes}
                disabled={busy !== null}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                {busy === "yes" ? "Starting…" : "Yes, process them"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
