"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

/**
 * Persistent crisis-resources footer. Visible only on authenticated
 * pages (gated on useSession → status === "authenticated") — we don't
 * want an "in crisis?" nudge on public marketing pages where it reads
 * as alarming rather than supportive.
 *
 * Dismissible per-browser via localStorage — the user always has the
 * content one tap away via /support/crisis or /account, so the banner
 * doesn't need to re-assert itself after they've acknowledged it once.
 * Clearing cookies / different browser re-surfaces it; that's fine.
 *
 * Product decision (2026-04-21): passive resources only. No AI crisis
 * detection — false positives interrupt users, false negatives create
 * liability, and hallucinating LLMs shouldn't be first-line response
 * on a mental-health-adjacent surface. See /support/crisis for the
 * curated hotline list.
 */
// localStorage key used to remember the dismissal. Versioned so we can
// re-surface the banner to all users in the future by bumping the suffix.
const DISMISS_KEY = "crisis-footer-dismissed:v1";

export function CrisisFooter() {
  const { status } = useSession();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (status !== "authenticated" || dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-violet-500/15 bg-[#FAFAF7]/95 px-4 py-1.5 text-[11px] text-zinc-600 backdrop-blur dark:border-violet-400/15 dark:bg-[#0B0B12]/95 dark:text-zinc-400">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p className="flex items-center gap-1.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-violet-500 dark:text-violet-400"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
          <span>
            Need to talk to someone? Call or text{" "}
            <a
              href="tel:988"
              className="font-medium text-violet-600 underline underline-offset-2 hover:text-violet-500 dark:text-violet-400 dark:hover:text-violet-300"
            >
              988
            </a>{" "}
            anytime —{" "}
            <Link
              href="/support/crisis"
              className="underline underline-offset-2 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              more resources
            </Link>
            .
          </span>
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss support footer"
          className="shrink-0 rounded-md px-1.5 text-zinc-400 hover:bg-zinc-500/10 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
        >
          ×
        </button>
      </div>
    </div>
  );
}
