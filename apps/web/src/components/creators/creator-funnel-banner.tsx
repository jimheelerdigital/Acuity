"use client";

/**
 * "Sent by Tess · code TESS50 saved" — a light toast at the top of the
 * sign-up funnel for visitors who arrived through a creator link
 * (goripple.io/c/<CODE> sets the readable rp_creator cookie, "CODE|Name").
 *
 * Fixed just under the funnel's own progress bar, matches the funnel's light
 * coral look, shows once per browser session and fades after ~5s so it never
 * covers a question. Renders nothing for everyone else: ad traffic sees no
 * change (Keenan 2026-10-23: creator links only).
 */
import { useEffect, useState } from "react";

import { CODE_COOKIE } from "@/lib/creators/config";

const SEEN_KEY = "rp_creator_toast_seen";

export function CreatorFunnelBanner() {
  const [info, setInfo] = useState<{ code: string; name: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = document.cookie
        .split(/;\s*/)
        .find((c) => c.startsWith(`${CODE_COOKIE}=`))
        ?.slice(CODE_COOKIE.length + 1);
      if (!raw) return;
      const [code, name] = decodeURIComponent(raw).split("|");
      if (!code || !/^[A-Z0-9]{4,12}$/.test(code)) return;
      try {
        if (sessionStorage.getItem(SEEN_KEY) === code) return;
      } catch {
        /* private mode: show it anyway */
      }
      setInfo({ code, name: name || "a friend" });
      const show = setTimeout(() => setVisible(true), 300);
      const hide = setTimeout(() => {
        setVisible(false);
        // Marked seen only once it has actually been shown (StrictMode-safe).
        try {
          sessionStorage.setItem(SEEN_KEY, code);
        } catch {
          /* ignore */
        }
      }, 5600);
      return () => {
        clearTimeout(show);
        clearTimeout(hide);
      };
    } catch {
      /* no toast */
    }
  }, []);

  if (!info) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 top-[60px] z-[60] flex justify-center px-4 transition-all duration-500 ease-out ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-center gap-2 rounded-full bg-white/90 py-1.5 pl-1.5 pr-4 text-[13px] text-[#5B5B66] shadow-[0_6px_20px_rgba(18,18,22,0.10)] ring-1 ring-[rgba(18,18,22,0.06)] backdrop-blur">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #FFAA84, #F59570, #DC7553)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span>
          Referred by <b className="font-semibold text-[#121216]">{info.name}</b>
          <span aria-hidden> · </span>
          code <b className="font-semibold tracking-[1px] text-[#D9704E]">{info.code}</b> saved
        </span>
      </div>
    </div>
  );
}
