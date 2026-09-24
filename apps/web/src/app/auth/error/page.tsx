"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// Mirrors OAUTH_PENDING_KEY in components/onboarding-funnel.tsx. The funnel
// writes it right before handing off to Google.
const FUNNEL_OAUTH_PENDING_KEY = "acuity_oauth_pending";
const FUNNEL_PATHS = new Set(["/start", "/start-bwk"]);

/** The funnel this failed OAuth attempt started from, if any. */
function pendingFunnelPath(): string | null {
  try {
    const raw = localStorage.getItem(FUNNEL_OAUTH_PENDING_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { path?: string; ts?: number };
    // Only a recent attempt counts. A stale marker must not hijack a later,
    // unrelated sign-in error on /auth/signin.
    const fresh = typeof p.ts === "number" && Date.now() - p.ts < 30 * 60 * 1000;
    return fresh && p.path && FUNNEL_PATHS.has(p.path) ? p.path : null;
  } catch {
    return null;
  }
}

/**
 * NextAuth redirects here with ?error=<ErrorCode> when auth fails.
 * Logs the error code + URL to console (visible in Vercel logs via
 * client-side error reporting) and to the server via a beacon so
 * we can diagnose auth failures from the admin dashboard.
 */
function AuthErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get("error") ?? "Unknown";

  useEffect(() => {
    // Log to browser console (visible in Vercel Real-Time Logs if user has DevTools open)
    console.error(`[auth-error] User landed on /auth/error with code: ${errorCode}`);

    // Fire a server-side log via beacon so it shows up in Vercel function logs
    const payload = JSON.stringify({
      error: errorCode,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || null,
      userAgent: navigator.userAgent,
    });
    fetch("/api/auth/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});

    // Funnel visitors (the /start and /start-bwk sign-up step) go straight
    // back to that step instead of stopping on this page. The funnel reads
    // oauth=failed + error, logs funnel_oauth_returned_error with the code,
    // and points them at the email form. Before this, a failed Google attempt
    // from an ad ended here.
    const funnelPath = pendingFunnelPath();
    if (funnelPath) {
      const qs = new URLSearchParams({ step: "create-account", oauth: "failed", error: errorCode });
      window.location.replace(`${funnelPath}?${qs.toString()}`);
    }
  }, [errorCode]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg p-8 text-center shadow-lg animate-fade-in">
        <div className="mb-4 text-4xl">&#x26A0;&#xFE0F;</div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          Authentication error
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
          Something went wrong during sign-in. The link may have expired or
          already been used.
        </p>
        <Link
          href="/auth/signin"
          className="inline-block rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 transition-all duration-200 active:scale-95"
        >
          Back to sign in
        </Link>
        <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
          Error code: {errorCode}
        </p>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <AuthErrorContent />
    </Suspense>
  );
}
