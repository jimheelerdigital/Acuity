"use client";

import { useEffect, useState } from "react";

/**
 * Confirmation banner shown when the landing page is loaded with
 * `?deleted=1` (the post-deletion redirect target). Auto-hides after
 * 10s; user can also dismiss with the close button.
 */
export function AccountDeletedBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("deleted") !== "1") return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 transform">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 shadow-lg backdrop-blur">
        <span className="text-sm font-medium text-emerald-100">
          Your Acuity account and all your data have been permanently
          deleted.
        </span>
        <button
          onClick={() => setVisible(false)}
          aria-label="Dismiss"
          className="text-emerald-200 transition hover:text-white"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
