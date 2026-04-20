"use client";

/**
 * /auth/mobile-complete?token=…
 *
 * Landing page for mobile magic-link emails. The email's link lands
 * here in the user's mobile browser, we POST the token to
 * /api/auth/mobile-complete to exchange it for a session JWT, then
 * redirect into the native app via the custom URL scheme:
 *
 *   acuity://auth-callback?sessionToken=…&email=…
 *
 * The native app's app/auth-callback.tsx catches the deep link,
 * stores the token in SecureStore, and refreshes AuthContext.
 *
 * Fallbacks:
 *   - If the token is invalid/expired, show an error + link back to
 *     mobile sign-in (user has to request a fresh link).
 *   - If the user opened the email on desktop, the acuity:// redirect
 *     will no-op; show a "Open this on your phone" message instead.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Phase = "working" | "redirecting" | "invalid" | "expired" | "error";

function MobileCompleteInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>("working");
  const [deepLink, setDeepLink] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/mobile-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (body.error === "ExpiredToken") setPhase("expired");
          else if (body.error === "InvalidToken") setPhase("invalid");
          else setPhase("error");
          return;
        }
        const body = (await res.json()) as {
          sessionToken: string;
          user: { email: string };
        };
        // Put the session JWT into the fragment, not the query string —
        // fragments are never logged server-side (browsers don't send
        // them upstream) which is the right place for secrets.
        const fragment = new URLSearchParams({
          sessionToken: body.sessionToken,
          email: body.user.email,
        });
        const url = `acuity://auth-callback#${fragment.toString()}`;
        setDeepLink(url);
        setPhase("redirecting");
        // Trigger the OS to route the custom scheme. On iOS this
        // opens Acuity (or shows "Open in Acuity?" prompt).
        window.location.href = url;
      } catch {
        if (!cancelled) setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-8 shadow-lg animate-fade-in text-center">
        {phase === "working" && (
          <>
            <div className="mb-4 text-4xl">✦</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              Signing you in…
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              One moment while we verify your link.
            </p>
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
            <p className="mt-5 text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
              On a desktop? Magic-link sign-in finishes on the device where Acuity is installed. Open this link on your phone.
            </p>
          </>
        )}
        {(phase === "invalid" || phase === "expired" || phase === "error") && (
          <>
            <div className="mb-4 text-4xl">⚠️</div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
              {phase === "expired" ? "Link expired" : "Link invalid"}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {phase === "expired"
                ? "Magic links expire after 24 hours. Request a new one from the app."
                : "This link can't be used. Try requesting a new one from the app."}
            </p>
            <Link
              href="/auth/signin"
              className="mt-6 inline-block text-sm text-violet-600 dark:text-violet-400 hover:text-violet-500"
            >
              Back to sign in →
            </Link>
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
