"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { ProgressionItemKey } from "@acuity/shared";

/**
 * "Getting to know Acuity" discovery card. Rendered on Home during
 * the first 14 days of a user's account. Server decides visibility +
 * which items are unlocked (see lib/progression.ts); this client
 * component handles rendering + the manual "mark done" + dismiss
 * actions.
 *
 * Auto-completed items (entry-exists, weekly-report-exists, life-
 * audit-exists) arrive with completed=true from the server so the
 * user doesn't need to tap them.
 */

interface Item {
  key: ProgressionItemKey;
  title: string;
  description: string;
  href: string;
  completed: boolean;
}

export function ProgressionChecklist({
  items,
  completedCount,
  totalVisibleCount,
}: {
  items: Item[];
  completedCount: number;
  totalVisibleCount: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();
  const [localItems, setLocalItems] = useState(items);

  if (hidden) return null;

  const progress = Math.round(
    (completedCount / Math.max(1, totalVisibleCount)) * 100
  );

  const markComplete = (key: ProgressionItemKey) => {
    // Optimistic update — flip the UI first, then fire the server
    // call. Rollback if the POST fails (rare; non-fatal either way).
    setLocalItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, completed: true } : i))
    );
    startTransition(async () => {
      try {
        await fetch("/api/progression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "complete", key }),
        });
      } catch {
        // Best-effort; a stale optimistic tick is acceptable.
      }
    });
  };

  const dismiss = () => {
    setHidden(true);
    startTransition(async () => {
      try {
        await fetch("/api/progression", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "dismiss" }),
        });
      } catch {
        // ignore
      }
    });
  };

  const done = localItems.filter((i) => i.completed).length;

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Getting to know Acuity
          </h2>
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {done} of {localItems.length} complete · unlocks over your first
            two weeks
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
          <button
            onClick={dismiss}
            className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:bg-white/5"
            title="Hide this card for good"
          >
            Hide
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="mt-4 space-y-2">
          {localItems.map((item) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-zinc-100 px-3 py-2 transition-colors dark:border-white/5"
            >
              <button
                onClick={() => !item.completed && markComplete(item.key)}
                aria-label={item.completed ? "Completed" : "Mark complete"}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  item.completed
                    ? "border-violet-500 bg-violet-500 text-white"
                    : "border-zinc-300 hover:border-violet-400 dark:border-white/20 dark:hover:border-violet-400"
                }`}
                disabled={item.completed}
              >
                {item.completed ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : null}
              </button>
              <Link href={item.href} className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    item.completed
                      ? "text-zinc-400 line-through dark:text-zinc-500"
                      : "text-zinc-900 dark:text-zinc-50"
                  }`}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {item.description}
                </p>
              </Link>
              {!item.completed && (
                <Link
                  href={item.href}
                  className="shrink-0 text-xs font-medium text-violet-600 hover:text-violet-500 dark:text-violet-400"
                >
                  Open →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
