"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  progress: number;
  targetDate: string | null;
  createdAt: string;
};

// Canonical 6 areas — must match @acuity/shared `LIFE_AREAS`.
const LIFE_AREAS: Record<string, { label: string; color: string }> = {
  CAREER: { label: "Career", color: "#3B82F6" },
  HEALTH: { label: "Health", color: "#14B8A6" },
  RELATIONSHIPS: { label: "Relationships", color: "#F43F5E" },
  FINANCES: { label: "Finances", color: "#F59E0B" },
  PERSONAL: { label: "Personal Growth", color: "#A855F7" },
  OTHER: { label: "Other", color: "#71717A" },
};

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  ACTIVE: { label: "Active", bg: "bg-emerald-50", text: "text-emerald-600" },
  COMPLETED: { label: "Completed", bg: "bg-violet-50", text: "text-violet-600" },
  PAUSED: { label: "Paused", bg: "bg-amber-50", text: "text-amber-600" },
  ABANDONED: { label: "Archived", bg: "bg-zinc-100", text: "text-zinc-500" },
};

export function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [editingProgress, setEditingProgress] = useState<string | null>(null);
  const [progressValue, setProgressValue] = useState(0);

  const fetchGoals = useCallback(async () => {
    const res = await fetch("/api/goals");
    if (res.ok) {
      const data = await res.json();
      setGoals(data.goals);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const act = useCallback(
    async (id: string, action: string, extra?: Record<string, unknown>) => {
      setActing((prev) => new Set(prev).add(id));
      try {
        const res = await fetch("/api/goals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, ...extra }),
        });
        if (res.ok) await fetchGoals();
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchGoals]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = g.lifeArea || "PERSONAL";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return map;
  }, [goals]);

  const activeCount = goals.filter((g) => g.status === "ACTIVE").length;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
          Goals
          {activeCount > 0 && (
            <span className="ml-2 align-middle text-base font-normal text-zinc-400 dark:text-zinc-500">
              {activeCount} active
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          What you're working toward.
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
          <div className="text-3xl mb-3">🎯</div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No goals yet</p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Mention a goal in your daily debrief and we'll track it here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([area, areaGoals]) => {
            const areaInfo = LIFE_AREAS[area] ?? {
              label: area,
              color: "#71717A",
            };
            return (
              <section key={area}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: areaInfo.color }}
                  />
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                    {areaInfo.label}
                  </h2>
                </div>
                <div className="space-y-3">
                  {areaGoals.map((goal) => {
                    const status = STATUS_STYLES[goal.status] ?? STATUS_STYLES.ACTIVE;
                    const busy = acting.has(goal.id);
                    const isEditing = editingProgress === goal.id;

                    return (
                      <div
                        key={goal.id}
                        className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-5 py-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.bg} ${status.text}`}
                              >
                                {status.label}
                              </span>
                              <span
                                className="rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: areaInfo.color + "18",
                                  color: areaInfo.color,
                                }}
                              >
                                {areaInfo.label}
                              </span>
                              {goal.targetDate && (
                                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                  Target{" "}
                                  {new Date(goal.targetDate).toLocaleDateString(
                                    "en-US",
                                    { month: "short", day: "numeric", year: "numeric" }
                                  )}
                                </span>
                              )}
                            </div>

                            <p
                              className={`text-sm leading-snug ${
                                goal.status === "COMPLETED" || goal.status === "ABANDONED"
                                  ? "text-zinc-400 dark:text-zinc-500 line-through"
                                  : "text-zinc-800 dark:text-zinc-100"
                              }`}
                            >
                              {goal.title}
                            </p>

                            {goal.description && (
                              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500 line-clamp-2">
                                {goal.description}
                              </p>
                            )}

                            {/* Progress bar */}
                            <div className="mt-3 flex items-center gap-3">
                              <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                                <div
                                  className="h-1.5 rounded-full bg-violet-500 transition-all duration-700"
                                  style={{ width: `${goal.progress}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 w-8 text-right">
                                {goal.progress}%
                              </span>
                            </div>

                            {/* Progress slider */}
                            {isEditing && (
                              <div className="mt-3 flex items-center gap-3">
                                <input
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={5}
                                  value={progressValue}
                                  onChange={(e) =>
                                    setProgressValue(Number(e.target.value))
                                  }
                                  className="flex-1 accent-violet-500"
                                />
                                <span className="text-xs text-zinc-400 dark:text-zinc-500 w-8 text-right">
                                  {progressValue}%
                                </span>
                                <button
                                  disabled={busy}
                                  onClick={() => {
                                    act(goal.id, "progress", {
                                      progress: progressValue,
                                    });
                                    setEditingProgress(null);
                                  }}
                                  className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 transition disabled:opacity-40"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingProgress(null)}
                                  className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          {goal.status === "ACTIVE" && !isEditing && (
                            <div className="flex shrink-0 gap-1.5">
                              <ActionBtn
                                label="Complete"
                                title="Mark complete"
                                busy={busy}
                                onClick={() => act(goal.id, "complete")}
                              >
                                <path d="M20 6 9 17l-5-5" />
                              </ActionBtn>
                              <ActionBtn
                                label="Update Progress"
                                title="Update progress"
                                busy={busy}
                                onClick={() => {
                                  setProgressValue(goal.progress);
                                  setEditingProgress(goal.id);
                                }}
                              >
                                <path d="M12 20h9" />
                                <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838.838-2.872a2 2 0 0 1 .506-.855z" />
                              </ActionBtn>
                              <ActionBtn
                                label="Archive"
                                title="Archive"
                                busy={busy}
                                onClick={() => act(goal.id, "archive")}
                              >
                                <path d="M21 8v13H3V8" />
                                <path d="M1 3h22v5H1z" />
                                <path d="M10 12h4" />
                              </ActionBtn>
                            </div>
                          )}
                          {goal.status === "PAUSED" && (
                            <ActionBtn
                              label="Resume"
                              title="Resume"
                              busy={busy}
                              onClick={() => act(goal.id, "resume")}
                            >
                              <polygon points="6 3 20 12 6 21 6 3" />
                            </ActionBtn>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function ActionBtn({
  label,
  title,
  busy,
  onClick,
  children,
}: {
  label: string;
  title: string;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={label}
      className="rounded-lg p-1.5 text-zinc-400 dark:text-zinc-500 transition-all duration-200 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-40"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}
