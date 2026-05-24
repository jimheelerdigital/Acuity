"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import {
  BarChart3,
  CheckSquare,
  Home,
  type LucideIcon,
  Mic,
  Settings,
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
  /** Optional list of additional path prefixes that also mark this
   *  nav item active. Used so Insights stays highlighted when the
   *  user drills into /life-matrix (which is a featured destination
   *  from the /insights hub but lives at a top-level URL). */
  extraMatchPrefixes?: string[];
};

type NavSection = {
  heading: string;
  items: NavItem[];
};

/**
 * Bug 5 (2026-05-24): sidebar IA simplification. Life Matrix +
 * Theme Map are featured cards on /insights — duplicating them in
 * the sidebar gave two paths to the same destination and made the
 * Reflect section feel cluttered. Now /insights is the single
 * entry point; users navigate to Life Matrix / Theme Map / Ask /
 * State of Me from the cards on that hub. URLs themselves unchanged
 * — only the sidebar entry pruned. Insights gets `matchPrefix:
 * "/insights"` so /life-matrix and /insights/theme-map both
 * highlight Insights as the active section in the sidebar.
 *
 * Mobile uses tabs differently (bottom tab bar with limited slots),
 * so this prune is web-only.
 */
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
        href: "/insights",
        label: "Insights",
        icon: BarChart3,
        accent: true,
        // Match every reflection route so the sidebar stays active
        // when the user drills into Life Matrix / Theme Map / Ask /
        // State of Me from the hub. /life-matrix lives at a top-
        // level URL but conceptually belongs to the Insights bucket.
        matchPrefix: "/insights",
        extraMatchPrefixes: ["/life-matrix"],
      },
    ],
  },
  {
    heading: "Account",
    items: [{ href: "/account", label: "Settings", icon: Settings }],
  },
];

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  const allPrefixes: string[] = [];
  if (item.matchPrefix) allPrefixes.push(item.matchPrefix);
  if (item.extraMatchPrefixes) allPrefixes.push(...item.extraMatchPrefixes);
  for (const prefix of allPrefixes) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
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
          ? "bg-acuity-bg-sub text-acuity-text"
          : "text-acuity-text-sec hover:bg-acuity-bg-sub/70 hover:text-acuity-text"
      }`}
      style={{ paddingTop: 14, paddingBottom: 14, fontSize: 17, fontWeight: 500 }}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-acuity-primary"
        />
      )}
      <Icon
        className={`h-[22px] w-[22px] shrink-0 ${
          active
            ? "text-acuity-primary"
            : "text-acuity-text-ter group-hover:text-acuity-text-sec"
        }`}
        aria-hidden
      />
      <span className={item.accent ? "font-semibold" : ""}>{item.label}</span>
      {item.accent && (
        <span
          aria-hidden
          className="ml-auto h-1.5 w-1.5 rounded-full bg-acuity-primary shadow-acuity-glow-soft"
        />
      )}
    </Link>
  );
}

function Sidebar({ onOpenRecord }: { onOpenRecord: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] 2xl:w-[288px] flex-col border-r border-acuity-line bg-acuity-bg lg:flex">
      {/* Logo — h-[68px] matches the top bar (DesktopTopbar) so the
          sidebar header and the top bar appear as one continuous
          horizontal edge across the viewport. If you change one of
          these, change the other. */}
      <div className="flex h-[68px] items-center border-b border-acuity-line px-5">
        <Link href="/home" className="flex items-center gap-2 group">
          <img
            src="/AcuityLogoDark.png"
            alt=""
            className="shrink-0"
            style={{ width: 28, height: 28 }}
          />
          <span
            className="font-display font-semibold tracking-tight text-acuity-text"
            style={{ fontSize: 20 }}
          >
            Acuity
          </span>
        </Link>
      </div>

      {/* Record CTA — opens RecordSheet modal in place. Sidebar mounts
          the modal directly so recording works from any authenticated
          route, not just /home. */}
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onOpenRecord}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-acuity-grad-primary px-3 text-white shadow-acuity-glow-primary transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary focus-visible:ring-offset-2 focus-visible:ring-offset-acuity-bg"
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
                className="px-3 uppercase text-acuity-text-ter"
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
    <header className="sticky top-0 z-30 hidden h-[68px] items-center justify-end border-b border-acuity-line bg-acuity-bg/85 px-8 backdrop-blur-md lg:flex">
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
