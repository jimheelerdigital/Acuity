"use client";

import { useState } from "react";

/**
 * Share link for a State of Me report. Mirrors the WeeklyReport
 * ShareReportButton — create + copy + revoke. 30-day expiry.
 */
export function StateOfMeShareButton({
  reportId,
  initialShareId,
  initialExpiresAt,
}: {
  reportId: string;
  initialShareId: string | null;
  initialExpiresAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(
    initialShareId
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/state-of-me/${initialShareId}`
      : null
  );
  const [expiresAt, setExpiresAt] = useState<string | null>(initialExpiresAt);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/state-of-me/${reportId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.ok) {
        const body = await res.json();
        setShareUrl(body.url);
        setExpiresAt(body.expiresAt);
      }
    } finally {
      setLoading(false);
    }
  };

  const revoke = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/state-of-me/${reportId}/share`, {
        method: "DELETE",
      });
      if (res.ok) {
        setShareUrl(null);
        setExpiresAt(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          if (!shareUrl) generate();
        }}
        className="rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
      >
        Share this report
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Share this State of Me
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Anyone with the link can read — no sign-in required. 30-day
              default expiry. Revokable anytime.
            </p>
            {loading && !shareUrl ? (
              <div className="py-6 flex justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
              </div>
            ) : shareUrl ? (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] px-3 py-2 text-xs font-mono text-zinc-700 dark:text-zinc-200"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={copy}
                    className="rounded-lg bg-zinc-900 dark:bg-zinc-50 px-3 py-2 text-xs font-semibold text-white dark:text-zinc-900"
                  >
                    {copied ? "Copied ✓" : "Copy"}
                  </button>
                </div>
                {expiresAt && (
                  <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                    Expires{" "}
                    {new Date(expiresAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
                <div className="mt-5 flex justify-between">
                  <button
                    onClick={revoke}
                    disabled={loading}
                    className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-500"
                  >
                    Revoke link
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                Couldn&apos;t generate — try again.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
