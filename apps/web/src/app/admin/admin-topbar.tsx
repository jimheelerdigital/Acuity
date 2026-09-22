"use client";

import Link from "next/link";

import { SessionUserMenu } from "@/components/user-menu";

/**
 * Sticky top bar shown on all /admin routes. Replaces the consumer
 * AppShell topbar (which is bypassed for /admin per app-shell.tsx).
 * Dark-themed to match the rest of the admin UI; height + bg picked to
 * match the consumer DesktopTopbar so layout shift between /home and
 * /admin stays minimal at the same viewport.
 */
export function AdminTopbar() {
  return (
    <header
      className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-acuity-line px-4 backdrop-blur-xl sm:px-8"
      style={{
        background:
          "color-mix(in oklch, var(--acuity-bg), transparent 35%)",
      }}
    >
      <Link
        href="/admin"
        className="flex items-center gap-2.5 text-acuity-text"
      >
        <img
          src="/ripple-mark-white.png?v=2"
          alt=""
          className="shrink-0"
          style={{ width: 32, height: 32 }}
        />
        <span className="flex items-baseline gap-2">
          <span
            className="neo-title font-semibold"
            style={{ fontSize: 18, letterSpacing: "-0.2px" }}
          >
            Ripple Command
          </span>
          <span
            className="hidden font-mono uppercase text-acuity-text-quiet sm:inline"
            style={{ fontSize: 10, letterSpacing: "2px" }}
          >
            Admin
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="hidden items-center gap-2 sm:flex">
          <span className="neo-live-dot" />
          <span
            className="font-mono uppercase text-acuity-text-ter"
            style={{ fontSize: 10, letterSpacing: "2px" }}
          >
            Live
          </span>
        </span>
        <SessionUserMenu />
      </div>
    </header>
  );
}
