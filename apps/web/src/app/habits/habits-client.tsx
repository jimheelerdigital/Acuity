"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  MAX_ACTIVE_HABITS,
  currentStreak,
  isExpectedOn,
  shiftDate,
  type HabitLike,
} from "@acuity/shared";
import { Card } from "@/components/acuity";

/**
 * Web habit tracker. Parity with `apps/mobile/app/habits.tsx`.
 *
 * ── Shared streak logic, deliberately ────────────────────────────────
 * `currentStreak` / `isExpectedOn` come from `@acuity/shared/habits`, the
 * same functions mobile calls. Reimplementing "what counts as a streak"
 * per platform is how the two surfaces end up showing a user different
 * numbers for the same habit on the same day.
 *
 * ── What this screen can and cannot do ───────────────────────────────
 * The existing API supports exactly three operations: list, create, and
 * set today's check. There is no edit or archive endpoint — not on the
 * server and not in the mobile client (`lib/habits-api.ts` exposes only
 * fetchHabits / createHabit / setHabitCheck). Rather than invent a PATCH
 * contract here that mobile would then have to adopt, this screen ships
 * what the API actually supports and the PR flags the gap.
 *
 * The heatmap is READ-ONLY for the same reason: `/api/habits/[id]/check`
 * validates `localDate` against today and rejects anything else, so a
 * past cell has nothing to call. Making cells look tappable would promise
 * something the backend refuses.
 */

interface Habit extends HabitLike {
  id: string;
  name: string;
  daysActive: number[];
  archivedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

interface HabitCheckRow {
  habitId: string;
  localDate: string;
}

/** Today's date in the BROWSER's zone — the calendar the user sees. */
function todayLocalDate(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];
/** Weeks shown in the heatmap. 18 ≈ a season, and fits without scrolling. */
const HEATMAP_WEEKS = 18;

export function HabitsClient() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheckRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  /** Habit ids with a check-toggle in flight, so each row can disable itself. */
  const [pending, setPending] = useState<Set<string>>(new Set());

  const today = todayLocalDate();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/habits");
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as {
        habits?: Habit[];
        checks?: HabitCheckRow[];
      };
      setHabits(data.habits ?? []);
      setChecks(data.checks ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** habitId → set of checked local dates. Rebuilt only when checks change. */
  const checkedByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of checks) {
      let set = map.get(c.habitId);
      if (!set) {
        set = new Set<string>();
        map.set(c.habitId, set);
      }
      set.add(c.localDate);
    }
    return map;
  }, [checks]);

  async function toggle(habit: Habit, checked: boolean) {
    if (pending.has(habit.id)) return;
    setPending((p) => new Set(p).add(habit.id));

    // Optimistic: the toggle is the whole interaction, so waiting on a
    // round-trip before the checkbox moves makes the page feel broken.
    // Reverted below if the write fails.
    setChecks((prev) =>
      checked
        ? [...prev, { habitId: habit.id, localDate: today }]
        : prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
    );

    try {
      const res = await fetch(`/api/habits/${habit.id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localDate: today, checked }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setChecks((prev) =>
        checked
          ? prev.filter((c) => !(c.habitId === habit.id && c.localDate === today))
          : [...prev, { habitId: habit.id, localDate: today }]
      );
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(habit.id);
        return next;
      });
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as {
        habit?: Habit;
        error?: string;
      } | null;
      if (!res.ok || !data?.habit) {
        // The server's message is the useful one — it knows about the cap.
        setCreateError(data?.error ?? "Couldn't add that habit.");
        return;
      }
      setHabits((prev) => [...prev, data.habit!]);
      setName("");
    } catch {
      setCreateError("Couldn't add that habit.");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-acuity-primary dark:border-white/10" />
      </div>
    );
  }

  if (failed) {
    return (
      <Card padding={6}>
        <p className="text-[15px] leading-relaxed text-acuity-text-sec">
          Couldn&rsquo;t load your habits just now. Refresh the page and they
          should come back.
        </p>
      </Card>
    );
  }

  const atCap = habits.length >= MAX_ACTIVE_HABITS;

  return (
    <div className="acuity-stagger">
      {habits.length === 0 ? (
        <Card padding={6} className="mb-8">
          <p className="font-display text-xl font-semibold text-acuity-text">
            Nothing tracked yet
          </p>
          <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-acuity-text-sec">
            Add one thing you want to keep doing. One is enough to start —
            the point is the return, not the list.
          </p>
        </Card>
      ) : (
        <div className="mb-8 space-y-3">
          {habits.map((habit) => {
            const checked = checkedByHabit.get(habit.id) ?? new Set<string>();
            const doneToday = checked.has(today);
            const streak = currentStreak(habit, checked, today);
            const expectedToday = isExpectedOn(habit, today);
            const busy = pending.has(habit.id);

            return (
              <Card key={habit.id} variant="tinted" radius="lg" padding={5}>
                <div className="flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => void toggle(habit, !doneToday)}
                    disabled={busy}
                    aria-pressed={doneToday}
                    aria-label={`${doneToday ? "Uncheck" : "Check off"} ${habit.name}`}
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-acuity-pill border transition disabled:opacity-50"
                    style={{
                      backgroundColor: doneToday
                        ? "var(--acuity-primary)"
                        : "transparent",
                      borderColor: doneToday
                        ? "var(--acuity-primary)"
                        : "var(--acuity-line-strong)",
                    }}
                  >
                    {doneToday && (
                      <span className="text-[15px] leading-none text-white">
                        ✓
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-medium text-acuity-text">
                      {habit.name}
                    </p>
                    <p className="mt-1 text-[13px] text-acuity-text-ter">
                      {streak > 0
                        ? `${streak} day${streak === 1 ? "" : "s"} in a row`
                        : expectedToday
                          ? "Due today"
                          : "Not scheduled today"}
                      {habit.daysActive.length < 7 && (
                        <span className="ml-2 text-acuity-text-quiet">
                          {habit.daysActive
                            .map((d) => DAY_INITIALS[d])
                            .join("")}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <Heatmap
                  habit={habit}
                  checked={checked}
                  today={today}
                  weeks={HEATMAP_WEEKS}
                />
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Add ────────────────────────────────────────────────────── */}
      <Card padding={5}>
        <form onSubmit={(e) => void create(e)}>
          <label
            htmlFor="habit-name"
            className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter"
          >
            Add a habit
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="habit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={atCap || creating}
              placeholder="Walk before the kids are up"
              className="min-w-0 flex-1 rounded-acuity-lg border border-acuity-card-border bg-acuity-bg-inset px-4 py-3 text-[15px] text-acuity-text placeholder:text-acuity-text-quiet disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={atCap || creating || !name.trim()}
              className="shrink-0 rounded-acuity-pill px-5 py-3 text-[15px] font-semibold text-white transition disabled:opacity-40"
              style={{ backgroundColor: "var(--acuity-primary)" }}
            >
              {creating ? "Adding…" : "Add"}
            </button>
          </div>
          {atCap && (
            <p className="mt-2 text-[13px] text-acuity-text-ter">
              You can track up to {MAX_ACTIVE_HABITS} habits at once.
            </p>
          )}
          {createError && (
            <p className="mt-2 text-[13px] text-rose-600 dark:text-rose-400">
              {createError}
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}

/**
 * Calendar heatmap — one column per week, oldest on the left.
 *
 * Read-only by design (see the file header): the check endpoint only
 * accepts today's date, so a past cell has nothing to call.
 *
 * Days the habit was never scheduled for render as a faint outline rather
 * than an empty square, so a Mon/Wed/Fri habit does not look like four
 * missed days every week.
 */
function Heatmap({
  habit,
  checked,
  today,
  weeks,
}: {
  habit: Habit;
  checked: ReadonlySet<string>;
  today: string;
  weeks: number;
}) {
  const columns = useMemo(() => {
    // Walk back to the Sunday that starts the earliest visible week so the
    // grid's rows line up with weekdays.
    const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const lastSunday = shiftDate(today, -todayDow);
    const firstSunday = shiftDate(lastSunday, -(weeks - 1) * 7);

    const cols: { date: string; state: "done" | "missed" | "off" | "future" }[][] =
      [];
    for (let w = 0; w < weeks; w += 1) {
      const col: { date: string; state: "done" | "missed" | "off" | "future" }[] =
        [];
      for (let d = 0; d < 7; d += 1) {
        const date = shiftDate(firstSunday, w * 7 + d);
        const state =
          date > today
            ? "future"
            : checked.has(date)
              ? "done"
              : isExpectedOn(habit, date)
                ? "missed"
                : "off";
        col.push({ date, state });
      }
      cols.push(col);
    }
    return cols;
  }, [habit, checked, today, weeks]);

  return (
    <div className="mt-4 overflow-x-auto">
      <div className="flex gap-[3px]" aria-hidden>
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((cell) => (
              <span
                key={cell.date}
                title={cell.date}
                className="block h-[10px] w-[10px] rounded-[2px]"
                style={{
                  backgroundColor:
                    cell.state === "done"
                      ? "var(--acuity-primary)"
                      : cell.state === "missed"
                        ? "var(--acuity-line-strong)"
                        : "transparent",
                  border:
                    cell.state === "off" || cell.state === "future"
                      ? "1px solid var(--acuity-line)"
                      : "none",
                  opacity: cell.state === "future" ? 0.35 : 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* The grid is decorative repetition; the streak line above already
          states the fact a screen reader needs. */}
      <p className="sr-only">
        {`Completed ${[...checked].length} time(s) in the last ${weeks} weeks.`}
      </p>
    </div>
  );
}
