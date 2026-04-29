"use client";

/**
 * Standard page-level error UI. Wired into per-route error.tsx files
 * so a thrown server-side render error surfaces a recoverable shell
 * with a Retry button + back link, instead of Next.js's default
 * blank "Application error" screen.
 *
 * The Retry button calls `reset()` (Next.js error-boundary API) which
 * re-runs the route's render path. If the underlying issue was
 * transient (DB blip, network), retry usually fixes it.
 *
 * `digest` is Next.js's server-side error correlation id; we surface
 * it in tiny grey text so a user reporting an issue can paste it back
 * for log-grep without exposing the underlying error message.
 */

import Link from "next/link";

export function PageError({
  reset,
  digest,
  title = "Something went wrong",
  message = "We couldn't load this page. The data layer might be having a moment — try again, or come back in a minute.",
  backHref = "/home",
  backLabel = "Back to home",
}: {
  reset: () => void;
  digest?: string;
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-white/10 dark:bg-[#1E1E2E]">
        <div className="mb-4 text-3xl">⚠️</div>
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          {message}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 active:scale-95 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white"
          >
            Try again
          </button>
          <Link
            href={backHref}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {backLabel}
          </Link>
        </div>
        {digest && (
          <p className="mt-5 text-[10px] uppercase tracking-widest text-zinc-300 dark:text-zinc-600">
            ref: {digest}
          </p>
        )}
      </div>
    </div>
  );
}
