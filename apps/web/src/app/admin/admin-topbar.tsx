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
      className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-acuity-line px-4 backdrop-blur-md sm:px-8"
      style={{
        background:
          "color-mix(in oklch, var(--acuity-bg), transparent 15%)",
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
        <span
          className="font-semibold"
          style={{ fontSize: 18, letterSpacing: "-0.2px" }}
        >
          Ripple Admin
        </span>
      </Link>
      <SessionUserMenu />
    </header>
  );
}
