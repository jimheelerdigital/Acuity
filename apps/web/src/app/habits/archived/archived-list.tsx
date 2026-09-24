"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  checksByHabit,
  fetchArchivedHabits,
  streakFor,
  todayLocalDate,
  unarchiveHabit,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-client";

export function ArchivedHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocalDate();

  const load = useCallback(async () => {
    try {
      const res = await fetchArchivedHabits();
      setHabits(res.habits);
      setChecks(res.checks);
    } catch {
      // empty state reads better than an error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byHabit = useMemo(() => checksByHabit(checks), [checks]);

  const restore = useCallback(
    async (habit: Habit) => {
      if (restoringId) return;
      setRestoringId(habit.id);
      setError(null);
      try {
        const ok = await unarchiveHabit(habit.id);
        if (ok) setHabits((prev) => prev.filter((h) => h.id !== habit.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't restore that.");
      } finally {
        setRestoringId(null);
      }
    },
    [restoringId]
  );

  return (
    <div className="pb-16">
      <Link
        href="/habits"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-acuity-text-ter transition hover:text-acuity-text-sec"
      >
        <ArrowLeft className="h-4 w-4" />
        Habits
      </Link>

      <h1 className="font-display text-3xl tracking-tight text-acuity-text">
        Archived habits
      </h1>
      <p className="mt-1 mb-6 max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
        Deleted habits keep their history. Restore one to start tracking it
        again.
      </p>

      {error ? (
        <p className="mb-4 text-sm text-acuity-bad" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-[58px] animate-pulse rounded-xl border border-acuity-line bg-acuity-bg-sub"
            />
          ))}
        </div>
      ) : habits.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-acuity-text-ter">
          No archived habits.
        </p>
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => {
            const streak = streakFor(habit, byHabit, today);
            return (
              <li
                key={habit.id}
                className="flex items-center gap-3 rounded-xl border border-acuity-line bg-acuity-card-bg px-3.5 py-3.5"
              >
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-[15px] text-acuity-text">
                    {habit.name}
                  </span>
                  {streak > 0 ? (
                    <span className="mt-0.5 block text-xs text-acuity-text-ter">
                      {streak}-day streak at archive
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void restore(habit)}
                  disabled={restoringId === habit.id}
                  className="rounded-lg border border-acuity-line-strong px-3.5 py-2 text-sm font-medium text-acuity-text transition hover:bg-acuity-bg-sub disabled:opacity-50"
                >
                  {restoringId === habit.id ? "Restoring…" : "Restore"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
