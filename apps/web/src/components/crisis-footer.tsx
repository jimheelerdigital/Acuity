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
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-500/20 bg-amber-50/95 px-4 py-2 text-xs text-amber-900 shadow-lg backdrop-blur dark:border-amber-500/30 dark:bg-amber-950/80 dark:text-amber-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <p>
          <span className="font-semibold">In crisis?</span> Text or call{" "}
          <a
            href="tel:988"
            className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
          >
            988
          </a>{" "}
          — free, confidential, 24/7.{" "}
          <Link
            href="/support/crisis"
            className="underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
          >
            More resources
          </Link>
        </p>
        <button
          onClick={dismiss}
          aria-label="Dismiss crisis banner"
          className="shrink-0 rounded-md px-2 py-1 text-amber-700/70 hover:bg-amber-500/10 hover:text-amber-900 dark:text-amber-300/70 dark:hover:text-amber-100"
        >
          ×
        </button>
      </div>
    </div>
  );
}
