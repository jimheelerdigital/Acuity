"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import {
  BarChart3,
  CheckSquare,
  Compass,
  Home,
  type LucideIcon,
  Mic,
  Settings,
  Sparkles,
  Target,
} from "lucide-react";

import { RecordSheet } from "./record-sheet";
import { SessionUserMenu } from "./user-menu";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  accent?: boolean;
  matchPrefix?: string;
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    heading: "Core",
    items: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/tasks", label: "Tasks", icon: CheckSquare },
      { href: "/goals", label: "Goals", icon: Target, matchPrefix: "/goals" },
    ],
  },
  {
    heading: "Reflect",
    items: [
      {
        href: "/life-matrix",
        label: "Life Matrix",
        icon: Compass,
        accent: true,
        matchPrefix: "/life-matrix",
      },
      {
        href: "/insights/theme-map",
        label: "Theme Map",
        icon: Sparkles,
        matchPrefix: "/insights/theme",
      },
      { href: "/insights", label: "Insights", icon: BarChart3 },
    ],
  },
  {
    heading: "Account",
    items: [{ href: "/account", label: "Settings", icon: Settings }],
  },
];

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  if (item.matchPrefix) {
    return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + "/");
  }
  return pathname === item.href;
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-lg px-3 transition-colors ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-50"
          : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
      }`}
      style={{ paddingTop: 14, paddingBottom: 14, fontSize: 17, fontWeight: 500 }}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-violet-500"
        />
      )}
      <Icon
        className={`h-[22px] w-[22px] shrink-0 ${
          active
            ? "text-violet-600 dark:text-violet-400"
            : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300"
        }`}
        aria-hidden
      />
      <span className={item.accent ? "font-semibold" : ""}>{item.label}</span>
      {item.accent && (
        <span
          aria-hidden
          className="ml-auto h-1.5 w-1.5 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)]"
        />
      )}
    </Link>
  );
}

function Sidebar({ onOpenRecord }: { onOpenRecord: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] 2xl:w-[288px] flex-col border-r border-zinc-200 bg-[#FAFAF7] dark:border-white/10 dark:bg-[#0B0B12] lg:flex">
      {/* Logo — h-[68px] matches the top bar (DesktopTopbar) so the
          sidebar header and the top bar appear as one continuous
          horizontal edge across the viewport. If you change one of
          these, change the other. */}
      <div className="flex h-[68px] items-center border-b border-zinc-200 px-5 dark:border-white/10">
        <Link href="/home" className="flex items-center gap-2 group">
          <img
            src="/AcuityLogoDark.png"
            alt=""
            className="shrink-0"
            style={{ width: 28, height: 28 }}
          />
          <span
            className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            style={{ fontSize: 20 }}
          >
            Acuity
          </span>
        </Link>
      </div>

      {/* Record CTA — opens RecordSheet modal in place. Previously this
          was a <Link href="/home#record"> hash anchor, but the on-/home
          RecordButton card is `lg:hidden`, so on desktop the click did
          nothing visible (page scrolled to a hidden element). Now the
          sidebar mounts the modal directly so recording works from any
          authenticated route, not just /home. */}
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onOpenRecord}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF7] dark:focus-visible:ring-offset-[#0B0B12]"
          style={{ paddingTop: 16, paddingBottom: 16, fontSize: 17, fontWeight: 500 }}
        >
          <Mic className="h-[22px] w-[22px]" aria-hidden />
          Record
        </button>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-8">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <p
                className="px-3 uppercase text-zinc-400 dark:text-zinc-500"
                style={{
                  fontSize: 13,
                  letterSpacing: "1.6px",
                  fontWeight: 600,
                  opacity: 0.7,
                  marginBottom: 12,
                }}
              >
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarLink
                    key={item.href}
                    item={item}
                    active={isActive(pathname, item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}

function DesktopTopbar() {
  return (
    // h-[68px] (was h-14 / 56px) — gives the avatar trigger more room
    // to breathe and matches the sidebar logo header for a continuous
    // top edge across the viewport. The semi-transparent bg + border
    // distinguish the chrome from main content without an outright
    // background shift. Avatar trigger lives top-right inside the
    // 1600px content cap below.
    <header className="sticky top-0 z-30 hidden h-[68px] items-center justify-end border-b border-zinc-200 bg-[#FAFAF7]/85 px-8 backdrop-blur-md dark:border-white/10 dark:bg-[#0B0B12]/85 lg:flex">
      <SessionUserMenu />
    </header>
  );
}

/**
 * AppShell — at `lg` (1024px) and up, wraps authenticated content in a
 * persistent 240px sidebar + minimal top bar. Below `lg`, passes
 * children through untouched so the existing NavBar + narrow single-
 * column layout still controls the mobile/tablet view. Marketing, auth,
 * and onboarding routes bypass the shell entirely.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  // Sidebar Record button opens this. Lives on AppShell so the modal is
  // available from any authenticated lg+ route, not just /home — and so
  // the open/closed state survives nav between routes.
  const [recordOpen, setRecordOpen] = useState(false);

  const bypass =
    !pathname ||
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/for/") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/voice-journaling") ||
    pathname.startsWith("/waitlist") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/upgrade") ||
    // /admin owns its own layout (dark theme, full-width, no consumer
    // sidebar). The admin/layout.tsx server component still gates on
    // isAdmin and renders its own topbar with SessionUserMenu.
    pathname.startsWith("/admin") ||
    status !== "authenticated" ||
    !session?.user;

  if (bypass) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar onOpenRecord={() => setRecordOpen(true)} />
      <div className="lg:pl-[272px] 2xl:pl-[288px]">
        <DesktopTopbar />
        {/* 2xl: shell cap bumped 1600 → 2240 (2026-04-29 wide-desktop
            polish). Past 2240 the page sits centered with neutral
            black gutters — past that width, content gets too wide for
            comfortable reading. Sidebar grows 272 → 288 at the same
            breakpoint; the pl-* below matches. */}
        <div className="lg:mx-auto lg:w-full lg:max-w-[1600px] 2xl:max-w-[2240px] lg:px-8 lg:py-6 xl:px-10 2xl:px-12 2xl:py-8">
          {children}
        </div>
      </div>
      {/* Universal Record modal. Rendered at the shell level so the
          sidebar button works from any route. Reuses the same
          RecordSheet component as /insights and /goals/[id] — no fork.
          Generic context (no goalId / dimensionKey) so the entry isn't
          anchored to a specific goal or life area; it's a daily debrief.
          On record completion, route to the entry detail page so the
          user lands on their freshly-processed entry, parallel to the
          mobile flow at apps/mobile/app/record.tsx. */}
      <RecordSheet
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        context={{ type: "generic", label: "Daily debrief" }}
        onRecordComplete={(entryId) => {
          setRecordOpen(false);
          router.push(`/entries/${entryId}`);
        }}
      />
    </>
  );
}
