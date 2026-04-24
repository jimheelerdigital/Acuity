"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, LifeBuoy, LogOut, Settings } from "lucide-react";

type UserMenuProps = {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
  initials: string;
};

/**
 * Account-menu dropdown. Trigger is the user's avatar (image or
 * initials fallback) plus a subtle chevron. Panel is anchored to the
 * right edge so it never overflows narrow viewports. Keyboard a11y:
 * Enter/Space/ArrowDown opens, arrows cycle, Home/End jump, Tab/Esc
 * close, Esc returns focus to trigger.
 */
export function UserMenu({ name, email, image, initials }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | HTMLButtonElement | null>>([]);

  const close = useCallback(() => setOpen(false), []);

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

  useEffect(() => {
    if (open) {
      const first = itemRefs.current[0];
      if (first) first.focus();
    }
  }, [open]);

  function focusItem(index: number) {
    const items = itemRefs.current.filter(Boolean) as Array<
      HTMLAnchorElement | HTMLButtonElement
    >;
    if (items.length === 0) return;
    const wrapped = (index + items.length) % items.length;
    items[wrapped]?.focus();
  }

  function currentItemIndex() {
    const items = itemRefs.current.filter(Boolean) as Array<
      HTMLAnchorElement | HTMLButtonElement
    >;
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

  const setItemRef =
    (index: number) =>
    (el: HTMLAnchorElement | HTMLButtonElement | null) => {
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

/**
 * Session-aware wrapper — pulls user info from NextAuth so call sites
 * don't need to prop-drill. Returns null if the session isn't ready.
 */
export function SessionUserMenu() {
  const { data: session } = useSession();
  const user = session?.user;
  if (!user) return null;

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.email?.charAt(0).toUpperCase() ?? "?";

  return (
    <UserMenu
      name={user.name}
      email={user.email}
      image={user.image}
      initials={initials}
    />
  );
}
