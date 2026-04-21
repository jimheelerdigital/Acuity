"use client";

import Link from "next/link";
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
  NOT_STARTED: { label: "Not started", bg: "bg-zinc-100 dark:bg-white/5", text: "text-zinc-500 dark:text-zinc-400" },
  IN_PROGRESS: { label: "In progress", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-600 dark:text-emerald-400" },
  ON_HOLD: { label: "On hold", bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-600 dark:text-amber-400" },
  COMPLETE: { label: "Complete", bg: "bg-violet-50 dark:bg-violet-950/30", text: "text-violet-600 dark:text-violet-400" },
};

export function GoalList() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

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

  const grouped = useMemo(() => {
    const map = new Map<string, Goal[]>();
    for (const g of goals) {
      const key = g.lifeArea || "PERSONAL";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    return map;
  }, [goals]);

  const activeCount = goals.filter((g) => g.status === "IN_PROGRESS").length;

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
              {activeCount} in progress
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          What you&apos;re working toward. Tap any goal to open it.
        </p>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
          <div className="text-3xl mb-3">🎯</div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No goals yet</p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Mention a goal in your daily debrief and we&apos;ll track it here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([area, areaGoals]) => {
            const areaInfo = LIFE_AREAS[area] ?? { label: area, color: "#71717A" };
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
                    const status = STATUS_STYLES[goal.status] ?? STATUS_STYLES.NOT_STARTED;
                    const struck = goal.status === "COMPLETE";
                    return (
                      <Link
                        key={goal.id}
                        href={`/goals/${goal.id}`}
                        className="block rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] transition-all duration-200 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_20px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 dark:shadow-none dark:ring-1 dark:ring-white/5"
                      >
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
                              {new Date(goal.targetDate).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          )}
                        </div>

                        <p
                          className={`text-sm leading-snug ${
                            struck
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
                      </Link>
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
