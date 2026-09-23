"use client";

import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { dayOfWeek, isExpectedOn, shiftDate } from "@acuity/shared";
import {
  archiveHabit,
  checksByHabit,
  fetchHabits,
  statsFor,
  todayLocalDate,
  updateHabit,
  type Habit,
} from "@/lib/habits-client";

const DAY_LABELS = [
  { i: 0, label: "S" },
  { i: 1, label: "M" },
  { i: 2, label: "T" },
  { i: 3, label: "W" },
  { i: 4, label: "T" },
  { i: 5, label: "F" },
  { i: 6, label: "S" },
];

// Rolling calendar: last 5 weeks (Sun→Sat rows), current week at the bottom.
// 5 weeks covers the 30-day window the completion-rate stat uses.
const HEATMAP_WEEKS = 5;

// done — a completion was recorded (accent fill)
// off — a non-scheduled day (solid grey fill)
// untracked — a scheduled day with no completion (past OR future): left blank.
type CellState = "done" | "off" | "untracked";

export function HabitDetail({ id }: { id: string }) {
  const router = useRouter();
  const today = todayLocalDate();

  const [habit, setHabit] = useState<Habit | null>(null);
  const [checkSet, setCheckSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Rename (inline).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Notes/description (committed via "Save notes").
  const [desc, setDesc] = useState("");
  const [savedDesc, setSavedDesc] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { habits, checks } = await fetchHabits();
      const found = habits.find((h) => h.id === id) ?? null;
      setHabit(found);
      const initialDesc = found?.description ?? "";
      setDesc(initialDesc);
      setSavedDesc(initialDesc);
      setNameDraft(found?.name ?? "");
      setCheckSet(checksByHabit(checks).get(id) ?? new Set<string>());
    } catch {
      setHabit((prev) => prev ?? null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (!habit)
      return { current: 0, best: 0, rate: { done: 0, expected: 0, pct: 0 } };
    return statsFor(habit, checkSet, today);
  }, [habit, checkSet, today]);

  // Heatmap: 5 columns (weeks) of 7 (Sun→Sat), oldest → newest, ending today.
  const weeks = useMemo(() => {
    const todayDow = dayOfWeek(today);
    const start = shiftDate(today, -((HEATMAP_WEEKS - 1) * 7 + todayDow));
    const cols: Array<
      Array<{ date: string; day: number; state: CellState; isToday: boolean }>
    > = [];
    let cursor = start;
    for (let w = 0; w < HEATMAP_WEEKS; w += 1) {
      const col: Array<{
        date: string;
        day: number;
        state: CellState;
        isToday: boolean;
      }> = [];
      for (let d = 0; d < 7; d += 1) {
        const isToday = cursor === today;
        let state: CellState;
        if (checkSet.has(cursor)) state = "done";
        else if (habit && isExpectedOn(habit, cursor)) state = "untracked";
        else state = "off";
        col.push({ date: cursor, day: Number(cursor.slice(8, 10)), state, isToday });
        cursor = shiftDate(cursor, 1);
      }
      cols.push(col);
    }
    return cols;
  }, [habit, checkSet, today]);

  const saveName = useCallback(async () => {
    if (!habit) return;
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || next === habit.name) {
      setNameDraft(habit.name);
      return;
    }
    const updated = await updateHabit(habit.id, { name: next }).catch(() => null);
    if (updated) setHabit((h) => (h ? { ...h, ...updated } : h));
    else setNameDraft(habit.name);
  }, [habit, nameDraft]);

  const saveDesc = useCallback(async () => {
    if (!habit || savingDesc) return;
    setSavingDesc(true);
    try {
      const updated = await updateHabit(habit.id, { description: desc.trim() });
      if (updated) {
        setHabit((h) => (h ? { ...h, ...updated } : h));
        setSavedDesc(updated.description ?? "");
        setDesc(updated.description ?? "");
      }
    } catch {
      // leave the draft in place so the user can retry
    } finally {
      setSavingDesc(false);
    }
  }, [habit, desc, savingDesc]);

  const toggleDay = useCallback(
    async (dayIndex: number) => {
      if (!habit) return;
      const has = habit.daysActive.includes(dayIndex);
      const daysActive = has
        ? habit.daysActive.filter((d) => d !== dayIndex)
        : [...habit.daysActive, dayIndex].sort();
      // Optimistic; revert on failure.
      setHabit((h) => (h ? { ...h, daysActive } : h));
      const updated = await updateHabit(habit.id, { daysActive }).catch(
        () => null
      );
      if (!updated) setHabit((h) => (h ? { ...h, daysActive: habit.daysActive } : h));
      else setHabit((h) => (h ? { ...h, ...updated } : h));
    },
    [habit]
  );

  const remove = useCallback(async () => {
    if (!habit || deleting) return;
    const ok = window.confirm(
      `Delete "${habit.name}"? Your history is kept and it stops nudging.`
    );
    if (!ok) return;
    setDeleting(true);
    const done = await archiveHabit(habit.id).catch(() => false);
    if (done) router.push("/habits");
    else setDeleting(false);
  }, [habit, deleting, router]);

  // Fill: done is the accent; off is the one solid grey chip; untracked days
  // are blank (just their number). Today gets a secondary ring on any state.
  const cellClasses = (state: CellState, isToday: boolean): string => {
    const base =
      "flex aspect-square items-center justify-center rounded-md text-[10px] font-bold";
    const fill =
      state === "done"
        ? "bg-acuity-primary text-white"
        : state === "off"
          ? "bg-acuity-bg-inset-strong text-acuity-text-ter"
          : "text-acuity-text-ter";
    const ring = isToday
      ? state === "done"
        ? " ring-2 ring-inset ring-acuity-secondary"
        : " ring-2 ring-inset ring-acuity-secondary text-acuity-secondary"
      : "";
    return `${base} ${fill}${ring}`;
  };

  if (loading) {
    return (
      <div className="space-y-4 pb-16">
        <div className="h-8 w-48 animate-pulse rounded bg-acuity-bg-sub" />
        <div className="h-24 animate-pulse rounded-xl bg-acuity-bg-sub" />
        <div className="h-40 animate-pulse rounded-xl bg-acuity-bg-sub" />
      </div>
    );
  }

  if (!habit) {
    return (
      <div className="flex flex-col items-start gap-4 py-16">
        <p className="text-acuity-text-sec">Habit not found.</p>
        <button
          type="button"
          onClick={() => router.push("/habits")}
          className="rounded-full bg-acuity-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Back to Habits
        </button>
      </div>
    );
  }

  const dirtyDesc = desc.trim() !== savedDesc.trim();

  return (
    <div className="pb-16">
      <button
        type="button"
        onClick={() => router.push("/habits")}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-acuity-text-ter transition hover:text-acuity-text-sec"
      >
        <ArrowLeft className="h-4 w-4" />
        Habits
      </button>

      {/* Title / rename */}
      {editingName ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveName();
            if (e.key === "Escape") {
              setNameDraft(habit.name);
              setEditingName(false);
            }
          }}
          maxLength={80}
          className="w-full rounded-lg border border-acuity-line bg-acuity-card-bg px-2 py-1 text-2xl font-bold tracking-tight text-acuity-text focus:border-acuity-primary focus:outline-none"
        />
      ) : (
        <button type="button" onClick={() => setEditingName(true)} className="text-left">
          <h1 className="text-3xl font-bold tracking-tight text-acuity-text">
            {habit.name}
          </h1>
          <span className="mt-1 block text-xs text-acuity-text-ter">
            Click to rename
          </span>
        </button>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <StatCard label="Current" value={`${stats.current}`} unit="day streak" />
        <StatCard label="Best" value={`${stats.best}`} unit="day streak" />
        <StatCard
          label="Last 30 days"
          value={`${stats.rate.pct}%`}
          unit={`${stats.rate.done}/${stats.rate.expected} done`}
        />
      </div>

      {/* History */}
      <SectionLabel>History</SectionLabel>
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          {DAY_LABELS.map((d, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[11px] font-bold text-acuity-text-ter"
            >
              {d.label}
            </span>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="flex gap-1.5">
            {week.map((c) => (
              <div key={c.date} className="flex-1">
                <div className={cellClasses(c.state, c.isToday)}>{c.day}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-acuity-text-ter">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-acuity-primary" /> Done
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm ring-2 ring-inset ring-acuity-secondary" />{" "}
          Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-acuity-line" /> Not
          tracked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-acuity-bg-inset-strong" /> Off
          day
        </span>
      </div>

      {/* Notes */}
      <SectionLabel>Notes</SectionLabel>
      <p className="mb-3 text-[13px] text-acuity-text-sec">
        What this habit involves. Ripple uses this to spot the habit in your
        recordings — even if you don&apos;t say its name.
      </p>
      <textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="e.g. hamstring stretch, calf raises, cobra pose"
        maxLength={1000}
        className="min-h-24 w-full resize-y rounded-xl border border-acuity-line-strong bg-acuity-card-bg p-3 text-[15px] leading-relaxed text-acuity-text placeholder:text-acuity-text-ter focus:border-acuity-primary focus:outline-none"
      />
      {dirtyDesc ? (
        <button
          type="button"
          onClick={() => void saveDesc()}
          disabled={savingDesc}
          className="mt-2.5 rounded-lg bg-acuity-primary px-4 py-2.5 font-display text-sm text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {savingDesc ? "Saving…" : "Save notes"}
        </button>
      ) : null}

      {/* Active days */}
      <SectionLabel>Active days</SectionLabel>
      <p className="mb-3 text-[13px] text-acuity-text-sec">
        Turn all off to pause the habit.
      </p>
      <div className="flex gap-2">
        {DAY_LABELS.map((d) => {
          const on = habit.daysActive.includes(d.i);
          return (
            <button
              key={d.i}
              type="button"
              onClick={() => void toggleDay(d.i)}
              aria-pressed={on}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition ${
                on
                  ? "bg-acuity-primary text-white"
                  : "bg-acuity-bg-inset text-acuity-text-ter hover:bg-acuity-bg-inset-strong"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* Delete */}
      <div className="mt-8 border-t border-acuity-line pt-6">
        <button
          type="button"
          onClick={() => void remove()}
          disabled={deleting}
          className="inline-flex items-center gap-2 text-sm font-medium text-acuity-bad transition hover:opacity-80 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? "Deleting…" : "Delete habit"}
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-2xl bg-acuity-bg-inset p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-acuity-text-ter">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-bold text-acuity-text">{value}</div>
      <div className="mt-0.5 text-xs text-acuity-text-ter">{unit}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-7 text-[13px] font-bold uppercase tracking-wider text-acuity-text-sec">
      {children}
    </h2>
  );
}
