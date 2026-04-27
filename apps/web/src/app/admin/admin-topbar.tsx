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
    <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-white/10 bg-[#0A0A0F]/85 px-4 backdrop-blur-md sm:px-8">
      <Link
        href="/admin"
        className="flex items-center gap-2 text-white"
      >
        <img
          src="/AcuityLogoDark.png"
          alt=""
          className="shrink-0"
          style={{ width: 24, height: 24 }}
        />
        <span className="font-semibold tracking-tight" style={{ fontSize: 17 }}>
          Acuity Admin
        </span>
      </Link>
      <SessionUserMenu />
    </header>
  );
}
