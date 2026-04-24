"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { BookOpen, ChevronDown, LifeBuoy, LogOut, Settings } from "lucide-react";

const NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/tasks", label: "Tasks" },
  { href: "/goals", label: "Goals" },
  { href: "/insights", label: "Insights" },
];

const DROPDOWN_ITEMS = [
  {
    href: "/for/therapy",
    title: "The Overthinker",
    description: "Quiet the mental noise. Get it out of your head and into structure.",
  },
  {
    href: "/for/decoded",
    title: "The Curious One",
    description: "Discover the hidden patterns driving your decisions and emotions.",
  },
  {
    href: "/for/sleep",
    title: "The Night Owl",
    description: "Give your racing thoughts somewhere to go before bed.",
  },
  {
    href: "/for/weekly-report",
    title: "The Overachiever",
    description: "Weekly AI reports, goal tracking, and a Life Matrix to stay sharp.",
  },
  {
    href: "/for/founders",
    title: "The Builder",
    description: "The 60-second nightly debrief for founders and high performers.",
  },
];

function WhoItsForDropdown() {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isForPage = pathname?.startsWith("/for/");

  const closeDropdown = useCallback(() => {
    setOpen(false);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeDropdown();
    }
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }
  }, [open, closeDropdown]);

  // Close on click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open, closeDropdown]);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <>
      {/* Desktop dropdown */}
      <div
        ref={ref}
        className="relative hidden sm:block"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
            isForPage
              ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-white/60"
          }`}
        >
          Who it's for
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        {/* Dropdown panel */}
        <div
          className={`absolute left-0 top-full mt-1 w-72 rounded-lg border border-zinc-200 dark:border-white/10 bg-[#FAFAF7] dark:bg-[#1E1E2E] shadow-lg transition-all duration-200 origin-top ${
            open
              ? "opacity-100 scale-y-100 translate-y-0"
              : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none"
          }`}
        >
          <div className="py-1.5">
            {DROPDOWN_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeDropdown}
                  className={`block px-4 py-3 transition-all duration-150 border-l-2 ${
                    isActive
                      ? "border-violet-500 bg-white dark:bg-[#1E1E2E]/80"
                      : "border-transparent hover:border-violet-500 hover:bg-white/60"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      isActive ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-200"
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 leading-snug">
                    {item.description}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile accordion */}
      <div className="sm:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
            isForPage
              ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
              : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-white/60"
          }`}
        >
          Who it's for
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              mobileOpen ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </button>

        <div
          className={`overflow-hidden transition-all duration-200 ${
            mobileOpen ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="pl-4 pt-1 space-y-0.5">
            {DROPDOWN_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-white/60"
                  }`}
                >
                  {item.title}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

type UserMenuProps = {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
  initials: string;
};

function UserMenu({ name, email, image, initials }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  const close = useCallback(() => setOpen(false), []);

  // Close on Escape + return focus to trigger
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    }
    if (open) {
      document.addEventListener("keydown", onKeyDown);
      return () => document.removeEventListener("keydown", onKeyDown);
    }
  }, [open, close]);

  // Close on click outside
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open, close]);

  // When opening via keyboard, focus the first item
  useEffect(() => {
    if (open) {
      const first = itemRefs.current[0];
      if (first) first.focus();
    }
  }, [open]);

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as Array<HTMLAnchorElement | HTMLButtonElement>;
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function currentItemIndex() {
    const items = itemRefs.current.filter(Boolean) as Array<HTMLAnchorElement | HTMLButtonElement>;
    return items.findIndex((el) => el === document.activeElement);
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(currentItemIndex() + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(currentItemIndex() - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(itemRefs.current.length - 1);
    } else if (e.key === "Tab") {
      close();
    }
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  // Register each menu item ref by stable index
  const setItemRef = (index: number) => (el: HTMLAnchorElement | HTMLButtonElement | null) => {
    itemRefs.current[index] = el;
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name ? `Account menu for ${name}` : "Account menu"}
        className="flex items-center gap-1 rounded-full transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF7] dark:focus-visible:ring-offset-[#0B0B12]"
      >
        {image ? (
          <img
            src={image}
            alt=""
            className="h-7 w-7 rounded-full ring-2 ring-white dark:ring-white/10"
          />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 dark:bg-white/10 text-xs font-medium text-zinc-600 dark:text-zinc-300">
            {initials}
          </div>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown panel — anchored to right edge so it never overflows viewport */}
      <div
        role="menu"
        aria-orientation="vertical"
        onKeyDown={onMenuKeyDown}
        className={`absolute right-0 top-full mt-2 w-56 origin-top-right rounded-lg border border-zinc-200 dark:border-white/10 bg-[#FAFAF7] dark:bg-[#1E1E2E] shadow-lg transition-all duration-150 ${
          open
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
        }`}
      >
        {/* Header: show name + email for context now that they're not in the nav bar */}
        <div className="border-b border-zinc-200 dark:border-white/10 px-4 py-3">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">
            {name ?? "Account"}
          </div>
          {email ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{email}</div>
          ) : null}
        </div>

        <div className="py-1">
          <Link
            ref={setItemRef(0)}
            role="menuitem"
            tabIndex={-1}
            href="/account"
            onClick={close}
            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/5 focus:bg-white/60 dark:focus:bg-white/5 focus:outline-none transition-colors"
          >
            <Settings className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            Settings
          </Link>
          <a
            ref={setItemRef(1)}
            role="menuitem"
            tabIndex={-1}
            href="https://docs.getacuity.io"
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/5 focus:bg-white/60 dark:focus:bg-white/5 focus:outline-none transition-colors"
          >
            <BookOpen className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            Documentation
          </a>
          <a
            ref={setItemRef(2)}
            role="menuitem"
            tabIndex={-1}
            href="mailto:support@getacuity.io"
            onClick={close}
            className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-white/60 dark:hover:bg-white/5 focus:bg-white/60 dark:focus:bg-white/5 focus:outline-none transition-colors"
          >
            <LifeBuoy className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            Support
          </a>
        </div>

        {/* Sign out — top divider + slightly redder text signals destructive */}
        <div className="border-t border-zinc-200 dark:border-white/10 py-1">
          <button
            ref={setItemRef(3)}
            role="menuitem"
            tabIndex={-1}
            type="button"
            onClick={() => {
              close();
              signOut({ callbackUrl: "/" });
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 focus:bg-rose-50 dark:focus:bg-rose-500/10 focus:outline-none transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();
  const { data: session } = useSession();

  // Don't show nav on auth pages or landing
  if (!session || pathname?.startsWith("/auth") || pathname === "/") {
    return null;
  }

  const user = session.user;
  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 dark:border-white/10 bg-[#FAFAF7]/80 dark:bg-[#0B0B12]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        {/* Left: logo + dropdown + links */}
        <div className="flex items-center gap-6">
          <Link
            href="/home"
            className="flex items-center gap-2 group"
          >
            <img src="/AcuityLogoDark.png" alt="Acuity logo" className="shrink-0" style={{ width: 24, height: 24 }} />
            <span className="font-semibold text-zinc-900 dark:text-zinc-50 hidden sm:block tracking-tight">
              Acuity
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <WhoItsForDropdown />
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 hover:bg-white/60"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: account menu */}
        <UserMenu
          name={user.name}
          email={user.email}
          image={user.image}
          initials={initials}
        />
      </div>
    </nav>
  );
}
