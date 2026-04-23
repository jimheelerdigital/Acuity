import Link from "next/link";

import { lockedFeatureCopy, type UnlockKey, type UserProgression } from "@acuity/shared";

/**
 * Empty-state card shown when a feature is not yet unlocked per the
 * user's progression. Not a paywall — unlocks are experiential gates,
 * not billing gates. Paid and trial users on low data both see this.
 *
 * Pairs with `lockedFeatureCopy()` from @acuity/shared so mobile +
 * web render identical copy. Add a primary CTA back to the recorder
 * since every unlock ladder comes down to "record more."
 */
export function LockedFeatureCard({
  unlockKey,
  progression,
  recordHref = "/home",
}: {
  unlockKey: UnlockKey;
  progression: UserProgression;
  recordHref?: string;
}) {
  const copy = lockedFeatureCopy(unlockKey, progression);
  const pct = copy.progress
    ? Math.min(
        100,
        Math.round((copy.progress.current / Math.max(1, copy.progress.target)) * 100)
      )
    : null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50/40 to-white p-6 dark:border-white/10 dark:from-violet-950/10 dark:to-[#1E1E2E]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
          <LockIcon />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {copy.headline}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {copy.body}
          </p>
        </div>
      </div>

      {copy.progress && pct !== null && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              {copy.progress.current} of {copy.progress.target}
            </span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        <Link
          href={recordHref}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Record now
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
