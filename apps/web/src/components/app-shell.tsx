"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-zinc-100 text-zinc-900 dark:bg-white/10 dark:text-zinc-50"
          : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-100"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-violet-500"
        />
      )}
      <Icon
        className={`h-4 w-4 shrink-0 ${
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

function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-zinc-200 bg-[#FAFAF7] dark:border-white/10 dark:bg-[#0B0B12] lg:flex">
      {/* Logo */}
      <div className="flex h-14 items-center border-b border-zinc-200 px-5 dark:border-white/10">
        <Link href="/home" className="flex items-center gap-2 group">
          <img
            src="/AcuityLogoDark.png"
            alt=""
            className="shrink-0"
            style={{ width: 22, height: 22 }}
          />
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Acuity
          </span>
        </Link>
      </div>

      {/* Record CTA */}
      <div className="px-3 pt-4">
        <Link
          href="/home#record"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF7] dark:focus-visible:ring-offset-[#0B0B12]"
        >
          <Mic className="h-4 w-4" aria-hidden />
          Record
        </Link>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.heading}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
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
    <header className="sticky top-0 z-30 hidden h-14 items-center justify-end border-b border-zinc-200 bg-[#FAFAF7]/85 px-8 backdrop-blur-md dark:border-white/10 dark:bg-[#0B0B12]/85 lg:flex">
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
  const { data: session, status } = useSession();

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
    status !== "authenticated" ||
    !session?.user;

  if (bypass) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar />
      <div className="lg:pl-60">
        <DesktopTopbar />
        <div className="lg:mx-auto lg:w-full lg:max-w-[1600px] lg:px-8 lg:py-6 xl:px-10">
          {children}
        </div>
      </div>
    </>
  );
}
