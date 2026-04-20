"use client";

/**
 * Unified 402 Payment Required handling for the web. Keeps the
 * soft-transition copy (IMPLEMENTATION_PLAN_PAYWALL.md §4.2) in one
 * place across every gated action (record, weekly, lifemap refresh,
 * life-audit).
 *
 * Call shape:
 *   const res = await fetch("/api/weekly", { method: "POST" });
 *   if (res.status === 402) {
 *     const body = await res.json().catch(() => ({}));
 *     setPaywall({ message: body.message, redirect: body.redirect });
 *     return;
 *   }
 *   // ... other handling
 *
 *   ...
 *
 *   {paywall && <PaywallBanner {...paywall} onClose={() => setPaywall(null)} />}
 *
 * The server returns (see apps/web/src/lib/paywall.ts):
 *   {
 *     error: "SUBSCRIPTION_REQUIRED",
 *     message: "Your trial has ended. Continue the journey at /upgrade",
 *     redirect: "/upgrade?src=paywall_redirect"
 *   }
 */

import Link from "next/link";

export interface PaywallPromptProps {
  /** Server-supplied message. Falls back to generic copy. */
  message?: string;
  /** Server-supplied redirect URL. Falls back to /upgrade. */
  redirect?: string;
  /** Dismiss handler — passes control back to the caller. */
  onClose?: () => void;
  /** Source label embedded in the redirect URL (overrides server's if set). */
  src?: string;
}

export function PaywallBanner({
  message,
  redirect,
  onClose,
  src,
}: PaywallPromptProps) {
  const href =
    (src ? `/upgrade?src=${encodeURIComponent(src)}` : redirect) ??
    "/upgrade?src=paywall_redirect";

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-violet-200 bg-white dark:bg-[#1E1E2E] p-5 shadow-xl sm:inset-x-auto sm:right-4">
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Month 2 lives here.
      </p>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        {message ??
          "Your trial has ended. Continue the journey — everything you wrote during the trial stays yours."}
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 transition hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            Not now
          </button>
        )}
        <Link
          href={href}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700"
        >
          Continue the journey &rarr;
        </Link>
      </div>
    </div>
  );
}

/**
 * Helper for call sites that want a single hook to inspect a Response
 * for a 402 shape. Returns parsed `{ message, redirect }` if the
 * response was 402; null otherwise. Does NOT consume the body unless
 * the response is 402.
 */
export async function parsePaywallResponse(
  res: Response
): Promise<{ message: string; redirect: string } | null> {
  if (res.status !== 402) return null;
  const body = (await res.json().catch(() => ({}))) as {
    message?: string;
    redirect?: string;
  };
  return {
    message:
      body.message ?? "Your trial has ended. Continue the journey at /upgrade",
    redirect: body.redirect ?? "/upgrade?src=paywall_redirect",
  };
}
