"use client";

/**
 * Marketing top nav — sticky glass bar, wordmark, anchor links, theme
 * toggle, CTA. Ported from the handoff (`marketing.jsx → Nav`).
 *
 * The theme toggle is wired to the app's real appearance system
 * (useAppearance → setThemePreference, which persists the
 * acuity_appearance cookie) — NOT local state. So toggling here flips
 * <html data-theme> exactly like the in-app settings toggle, and the
 * whole page (Tailwind acuity-* tokens) re-tints.
 */
import Image from "next/image";

import { useAppearance } from "@/contexts/appearance-context";

const LINKS: [string, string][] = [
  ["Features", "/#features"],
  ["How it works", "/#how"],
  ["Pricing", "/#pricing"],
  ["Blog", "/blog"],
];

export function MarketingNav() {
  const { theme, setThemePreference } = useAppearance();
  const isDark = theme === "dark";

  return (
    <nav
      className="sticky top-0 z-[100] border-b border-acuity-line backdrop-blur-[20px] backdrop-saturate-[180%]"
      style={{ background: "color-mix(in oklch, var(--acuity-bg), transparent 28%)" }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-7 py-[15px]">
        <a href="/" className="flex items-center gap-2.5">
          <Image src="/ripple-mark-coral.png?v=2" alt="Ripple" width={36} height={36} priority className="shrink-0" />
          <span className="font-display text-[20px] font-extrabold tracking-[-0.4px] text-acuity-text">
            Ripple
          </span>
        </a>

        <div className="flex items-center gap-4 min-[900px]:gap-7">
          <div className="hidden items-center gap-[26px] min-[900px]:flex">
            {LINKS.map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="font-sans text-[14.5px] font-medium text-acuity-text-sec transition-colors hover:text-acuity-text"
              >
                {label}
              </a>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setThemePreference(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-acuity-line-strong text-acuity-text transition-colors"
            style={{ background: "color-mix(in oklch, var(--acuity-bg), transparent 40%)" }}
          >
            {isDark ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
              </svg>
            )}
          </button>

          {/* Secondary login — text link, full-contrast so it's clearly
              visible top-right next to the primary CTA. Routes to the real
              login page (/auth/signin; there is no /login route). Inline on
              mobile too (whitespace-nowrap + tightened mobile gap). */}
          <a
            href="/auth/signin"
            className="font-sans text-[14.5px] font-semibold text-acuity-text transition-colors hover:text-acuity-primary whitespace-nowrap"
          >
            Log in
          </a>

          <a
            href="/start"
            className="rounded-acuity-pill bg-acuity-grad-primary px-[18px] py-2.5 font-sans text-[14.5px] font-bold text-white shadow-acuity-glow-soft whitespace-nowrap"
          >
            Start free trial
          </a>
        </div>
      </div>
    </nav>
  );
}
