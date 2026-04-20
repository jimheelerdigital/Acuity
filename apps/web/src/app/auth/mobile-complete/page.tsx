"use client";

/**
 * /auth/mobile-complete?token=…
 *
 * Landing page for mobile magic-link emails. We don't exchange the
 * token for a session JWT here — instead we forward the single-use
 * magic-link token to the native app via the custom URL scheme, and
 * the app itself calls /api/auth/mobile-complete to do the exchange.
 *
 *   acuity://auth-callback?token=<magic-link-token>
 *
 * Why not exchange server-side and pass the JWT: putting the 30-day
 * session JWT in a URL would persist it in Safari history, tab
 * titles, and iOS AirDrop shares. The magic-link token is single-use
 * and 24-hour-scoped, so the same exposure is much less dangerous —
 * by the time anyone could read it from history, the app has already
 * consumed it.
 *
 * Desktop users who click the email link see instructions instead
 * of an auto-redirect — there's no Acuity app to receive acuity:// on
 * desktop.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Phase = "init" | "redirecting" | "invalid" | "desktop";

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function MobileCompleteInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>("init");
  const [deepLink, setDeepLink] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    const url = `acuity://auth-callback?token=${encodeURIComponent(token)}`;
    setDeepLink(url);

    if (!isMobile()) {
      setPhase("desktop");
      return;
    }

    setPhase("redirecting");
    // Trigger the OS to route the custom scheme. On iOS this opens
    // Acuity (or prompts "Open in Acuity?" on first use).
    window.location.href = url;
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 shadow-lg animate-fade-in text-center">
        {phase === "init" && (
          <>
            <div className="mb-4 text-4xl">✦</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              One moment…
            </h1>
          </>
        )}
        {phase === "redirecting" && (
          <>
            <div className="mb-4 text-4xl">📱</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Opening Acuity…
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              If the app doesn&apos;t open automatically, tap the button below.
            </p>
            {deepLink && (
              <a
                href={deepLink}
                className="mt-5 inline-block rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                Open Acuity →
              </a>
            )}
          </>
        )}
        {phase === "desktop" && (
          <>
            <div className="mb-4 text-4xl">📱</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Open this on your phone
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Magic-link sign-in finishes on the device where Acuity is installed. Open this email on the phone that has the app.
            </p>
            <Link
              href="/auth/signin"
              className="mt-6 inline-block text-sm text-violet-600 dark:text-violet-400 hover:text-violet-500"
            >
              Sign in on the web instead →
            </Link>
          </>
        )}
        {phase === "invalid" && (
          <>
            <div className="mb-4 text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Link invalid
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Request a new magic link from the app.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function MobileCompletePage() {
  return (
    <Suspense>
      <MobileCompleteInner />
    </Suspense>
  );
}
