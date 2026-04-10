"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState, useRef, useEffect, useCallback } from "react";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tasks", label: "Tasks" },
  { href: "/goals", label: "Goals" },
  { href: "/insights", label: "Insights" },
];

const DROPDOWN_ITEMS = [
  {
    href: "/for/therapy",
    title: "Therapy",
    description: "What if you had a therapist who listened every night?",
  },
  {
    href: "/for/decoded",
    title: "Life decoded",
    description: "Reveal the subconscious patterns running your life",
  },
  {
    href: "/for/sleep",
    title: "Sleep",
    description: "Give your racing thoughts somewhere to go",
  },
  {
    href: "/for/weekly-report",
    title: "Weekly report & Life Matrix",
    description: "Your week, written by AI. Your life, mapped.",
  },
  {
    href: "/for/founders",
    title: "Founders & executives",
    description: "The 60-second nightly debrief for high performers",
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
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-white/60"
          }`}
        >
          Who it&apos;s for
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
          className={`absolute left-0 top-full mt-1 w-72 rounded-lg border border-zinc-200/60 bg-[#FAFAF7] shadow-lg transition-all duration-200 origin-top ${
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
                      ? "border-violet-500 bg-white/80"
                      : "border-transparent hover:border-violet-500 hover:bg-white/60"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      isActive ? "text-zinc-900" : "text-zinc-700"
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5 leading-snug">
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
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-500 hover:text-zinc-900 hover:bg-white/60"
          }`}
        >
          Who it&apos;s for
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
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-white/60"
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
    <nav className="sticky top-0 z-50 border-b border-zinc-200/60 bg-[#FAFAF7]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        {/* Left: logo + dropdown + links */}
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 group"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm text-white transition-transform duration-300 group-hover:rotate-12">
              ✦
            </div>
            <span className="font-semibold text-zinc-900 hidden sm:block tracking-tight">
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
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-900 hover:bg-white/60"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: user info */}
        <div className="flex items-center gap-3">
          {user.image ? (
            <img
              src={user.image}
              alt=""
              className="h-7 w-7 rounded-full ring-2 ring-white"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-600">
              {initials}
            </div>
          )}
          <span className="text-sm text-zinc-600 hidden sm:block">
            {user.name ?? user.email}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="text-sm text-zinc-400 hover:text-zinc-700 transition"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
