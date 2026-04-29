"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Interactive Open Tasks card on /home. Mirrors the mobile tasks-tab
 * UX:
 *   - Checkbox on the left → tap to mark complete. Optimistic: the
 *     row fades out immediately and disappears from the local list,
 *     PATCH /api/tasks fires in the background.
 *   - Title in the middle, priority badge on the right.
 *   - Tap the body (anywhere except the checkbox) → navigate to
 *     /tasks for the full editing surface. Mobile opens a task
 *     detail screen; web's analogue is just the tasks page.
 *
 * Server seeds the initial list as a prop. After a completion the
 * list is filtered locally; we don't refetch — same pattern the
 * mobile tab uses (see apps/mobile/app/(tabs)/tasks.tsx ~line 193).
 */

export type OpenTask = {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  priority: string;
  groupId: string | null;
};

export type TaskGroup = {
  id: string;
  name: string;
  color: string;
  order: number;
};

export function OpenTasksCard({
  initialTasks,
  groups,
}: {
  initialTasks: OpenTask[];
  groups: TaskGroup[];
}) {
  const router = useRouter();
  // `pending` carries IDs in the brief window between checkbox tap
  // and removal — drives the fade-out animation.
  const [tasks, setTasks] = useState<OpenTask[]>(initialTasks);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();

  const completeTask = async (id: string) => {
    if (pending.has(id)) return;
    setPending((prev) => new Set(prev).add(id));

    try {
      const res = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "complete" }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      // Drop from the visible list once the network confirms. The
      // 180ms gives the fade animation time to play.
      setTimeout(() => {
        setTasks((prev) => prev.filter((t) => t.id !== id));
        setPending((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        // Refresh server data so the dashboard's other counts
        // (Streak, recent sessions task counts) stay in sync if the
        // user lingers without navigating.
        startTransition(() => router.refresh());
      }, 180);
    } catch {
      // Network failure — restore the row. No toast for now to
      // match mobile's silent-retry-by-user pattern.
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const openDetail = (id: string) => {
    router.push(`/tasks#task-${id}`);
  };

  // Group the tasks by groupId so the card renders the same WORK /
  // PERSONAL section headers used on the /tasks page. Tasks without
  // a groupId fall into a synthetic "Other" bucket so they always
  // render. Sections respect the parent group order; the synthetic
  // bucket pins to the end.
  const grouped = (() => {
    const byGroupId = new Map<string | null, OpenTask[]>();
    for (const t of tasks) {
      const k = t.groupId ?? null;
      const arr = byGroupId.get(k) ?? [];
      arr.push(t);
      byGroupId.set(k, arr);
    }
    const sections: { id: string | null; name: string; color: string; tasks: OpenTask[] }[] = [];
    for (const g of groups) {
      const ts = byGroupId.get(g.id);
      if (ts && ts.length) {
        sections.push({ id: g.id, name: g.name, color: g.color, tasks: ts });
      }
    }
    const ungrouped = byGroupId.get(null);
    if (ungrouped && ungrouped.length) {
      sections.push({ id: null, name: "Other", color: "#71717A", tasks: ungrouped });
    }
    return sections;
  })();

  return (
    <section className="flex h-full flex-col lg:col-span-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:p-7 dark:border-white/10 dark:bg-[#1E1E2E]">
      {/* Standard header pair — matches the rest of the dashboard
          (13px / 0.18em eyebrow + 24px tracking-tight title). */}
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2
            className="font-semibold uppercase text-zinc-400 dark:text-zinc-500"
            style={{ fontSize: 13, letterSpacing: "0.18em" }}
          >
            Open tasks
          </h2>
          <p className="mt-2 text-xl font-semibold tracking-tight md:text-2xl text-zinc-900 dark:text-zinc-50">
            {tasks.length === 0
              ? "All clear"
              : tasks.length === 1
                ? "1 thing waiting"
                : `${tasks.length} things waiting`}
          </p>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center dark:border-white/10">
          <div className="text-2xl mb-1.5">✅</div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Nothing on the list
          </p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Record a session to extract new tasks.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map((section) => (
            <div key={section.id ?? "ungrouped"}>
              {/* Section header — colored dot, name, count. Mirrors
                  the /tasks page's group strip. */}
              <div className="mb-2.5 flex items-center gap-2.5 border-b border-zinc-200/70 pb-2 dark:border-white/[0.07]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: section.color,
                    boxShadow: `0 0 6px ${section.color}66`,
                  }}
                />
                <span
                  className="font-semibold uppercase text-zinc-500 dark:text-zinc-400"
                  style={{ fontSize: 12, letterSpacing: "0.14em" }}
                >
                  {section.name}
                </span>
                <span className="text-xs font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
                  {section.tasks.length}
                </span>
              </div>
              <ul className="space-y-2">
                {section.tasks.map((task) => {
                  const isPending = pending.has(task.id);
                  const title = task.title ?? task.text ?? "Untitled task";
                  return (
                    <li
                      key={task.id}
                      className={`flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3 transition-all duration-200 hover:shadow-md dark:border-white/10 dark:bg-[#13131F] dark:hover:bg-[#24243A] ${
                        isPending
                          ? "opacity-40 line-through pointer-events-none"
                          : ""
                      }`}
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={isPending}
                        aria-label={`Mark "${title}" complete`}
                        onClick={() => {
                          void completeTask(task.id);
                        }}
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-zinc-300 bg-white transition-colors hover:border-violet-500 hover:bg-violet-50 dark:border-white/20 dark:bg-transparent dark:hover:border-violet-400 dark:hover:bg-violet-950/30"
                      >
                        {isPending && (
                          <Check
                            className="h-3 w-3 text-violet-600 dark:text-violet-400"
                            strokeWidth={3}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDetail(task.id)}
                        className="flex-1 min-w-0 text-left"
                        aria-label={`Open ${title}`}
                      >
                        <p className="truncate text-sm text-zinc-800 leading-snug dark:text-zinc-100">
                          {title}
                        </p>
                      </button>
                      <PriorityBadge priority={task.priority} />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  // URGENT and HIGH map to the same hot-pink badge; MEDIUM is amber;
  // LOW is muted. Matches the mobile tasks tab's priority chip
  // semantics — hot states are visually grouped.
  const styles: Record<string, string> = {
    URGENT:
      "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    HIGH:
      "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    MEDIUM:
      "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    LOW:
      "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
  };
  const cls = styles[priority] ?? styles.LOW;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}
    >
      {priority}
    </span>
  );
}
