"use client";

import { Check, ChevronRight, Archive } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MAX_ACTIVE_HABITS, isExpectedOn, isPaused } from "@acuity/shared";
import {
  checksByHabit,
  createHabit,
  fetchHabits,
  setHabitCheck,
  streakFor,
  todayLocalDate,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-client";

/**
 * Habits list (web) — the browser twin of apps/mobile/app/habits.tsx.
 *
 * Check-off is optimistic and reverts on failure: we never show a check the
 * server didn't record. The checkbox toggles today; the rest of the row links
 * to the per-habit detail page (streaks, history, notes, active days).
 */
export function HabitList() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayLocalDate();

  const load = useCallback(async () => {
    try {
      const res = await fetchHabits();
      setHabits(res.habits);
      setChecks(res.checks);
    } catch {
      // Leave the list empty; the empty state reads better than an error.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byHabit = useMemo(() => checksByHabit(checks), [checks]);
  const atCap = habits.length >= MAX_ACTIVE_HABITS;

  const onCreate = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || creating || atCap) return;
    setCreating(true);
    setError(null);
    try {
      const habit = await createHabit(trimmed);
      if (habit) {
        setHabits((prev) => [...prev, habit]);
        setName("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Please try again.");
    } finally {
      setCreating(false);
    }
  }, [name, creating, atCap]);

  const toggle = useCallback(
    async (habit: Habit) => {
      const done = byHabit.get(habit.id)?.has(today) ?? false;
      const next = !done;
      setChecks((prev) =>
        next
          ? [...prev, { habitId: habit.id, localDate: today }]
          : prev.filter(
              (c) => !(c.habitId === habit.id && c.localDate === today)
            )
      );
      const ok = await setHabitCheck(habit.id, next, today).catch(() => false);
      if (!ok) {
        setChecks((prev) =>
          next
            ? prev.filter(
                (c) => !(c.habitId === habit.id && c.localDate === today)
              )
            : [...prev, { habitId: habit.id, localDate: today }]
        );
      }
    },
    [byHabit, today]
  );

  return (
    <div className="pb-16">
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-tight text-acuity-text">
          Habits
        </h1>
        <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
          Small things you want to keep doing. Check them off when they happen.
        </p>
      </header>

      {/* Create */}
      <div className="mb-6 flex gap-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onCreate();
          }}
          placeholder={atCap ? `Up to ${MAX_ACTIVE_HABITS} at once` : "Add a habit"}
          disabled={atCap}
          maxLength={80}
          className="flex-1 rounded-xl border border-acuity-line bg-acuity-card-bg px-3.5 py-3 text-[15px] text-acuity-text placeholder:text-acuity-text-ter focus:border-acuity-primary focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={!name.trim() || creating || atCap}
          className="rounded-xl bg-acuity-primary px-5 font-display text-[15px] text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {creating ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? (
        <p className="mb-4 text-sm text-acuity-bad" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[58px] animate-pulse rounded-xl border border-acuity-line bg-acuity-bg-sub"
            />
          ))}
        </div>
      ) : habits.length === 0 ? (
        <p className="text-[15px] leading-relaxed text-acuity-text-ter">
          Nothing here yet. Add one above — one is plenty to start.
        </p>
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => {
            const done = byHabit.get(habit.id)?.has(today) ?? false;
            const streak = streakFor(habit, byHabit, today);
            const dueToday = isExpectedOn(habit, today);
            const paused = isPaused(habit);
            return (
              <li
                key={habit.id}
                className="flex items-center gap-3 rounded-xl border border-acuity-line bg-acuity-card-bg pr-2"
              >
                {/* Checkbox — toggles today; disabled when not due today */}
                <button
                  type="button"
                  onClick={() => dueToday && void toggle(habit)}
                  disabled={!dueToday}
                  aria-label={`Mark ${habit.name} done`}
                  aria-pressed={done}
                  className="flex items-center py-3.5 pl-3.5 disabled:cursor-default"
                >
                  <span
                    className={`flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] transition ${
                      done
                        ? "border-transparent bg-acuity-primary"
                        : "border-acuity-line-strong bg-transparent"
                    } ${dueToday ? "" : "opacity-50"}`}
                  >
                    {done ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} /> : null}
                  </span>
                </button>

                {/* Name + state — links to the detail page */}
                <Link
                  href={`/habits/${habit.id}`}
                  className="flex flex-1 items-center gap-2 py-3.5"
                >
                  <span className="flex-1 min-w-0">
                    <span
                      className={`block truncate text-[15px] text-acuity-text ${
                        done ? "line-through opacity-70" : ""
                      }`}
                    >
                      {habit.name}
                    </span>
                    {paused ? (
                      <span className="mt-0.5 block text-xs text-acuity-text-ter">
                        Paused
                      </span>
                    ) : !dueToday ? (
                      <span className="mt-0.5 block text-xs text-acuity-text-ter">
                        Not today
                      </span>
                    ) : null}
                  </span>
                  {streak > 0 ? (
                    <span className="font-mono text-xs text-acuity-text-ter">
                      {streak}d
                    </span>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-acuity-text-ter" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8">
        <Link
          href="/habits/archived"
          className="inline-flex items-center gap-1.5 text-sm text-acuity-text-ter transition hover:text-acuity-text-sec"
        >
          <Archive className="h-4 w-4" />
          Archived habits
        </Link>
      </div>
    </div>
  );
}
