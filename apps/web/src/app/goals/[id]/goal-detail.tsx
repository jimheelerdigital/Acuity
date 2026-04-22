"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatRelativeDate } from "@acuity/shared";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  progress: number;
  notes: string | null;
  targetDate: string | null;
  lastMentionedAt: string | null;
  createdAt: string;
};

type LinkedEntry = {
  id: string;
  summary: string | null;
  mood: string | null;
  createdAt: string;
};

const STATUS_OPTIONS = [
  { value: "NOT_STARTED", label: "Not started" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "COMPLETE", label: "Complete" },
];

const LIFE_AREA_LABELS: Record<string, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

export function GoalDetail({
  initialGoal,
  linkedEntries,
}: {
  initialGoal: Goal;
  linkedEntries: LinkedEntry[];
}) {
  const router = useRouter();
  const [goal, setGoal] = useState<Goal>(initialGoal);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialGoal.title);
  const [notesDraft, setNotesDraft] = useState(initialGoal.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const patch = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, action: "edit", fields }),
      });
      if (res.ok) {
        const data = await res.json();
        setGoal((prev) => ({
          ...prev,
          ...data.goal,
          targetDate: data.goal.targetDate ?? null,
          lastMentionedAt: data.goal.lastMentionedAt ?? null,
          createdAt: data.goal.createdAt ?? prev.createdAt,
        }));
      }
    } finally {
      setSaving(false);
    }
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    if (!next || next === goal.title) {
      setEditingTitle(false);
      setTitleDraft(goal.title);
      return;
    }
    await patch({ title: next });
    setEditingTitle(false);
  };

  const saveNotes = async () => {
    if (notesDraft === (goal.notes ?? "")) {
      setEditingNotes(false);
      return;
    }
    await patch({ notes: notesDraft || null });
    setEditingNotes(false);
  };

  const remove = async () => {
    if (!confirm("Delete this goal? This can't be undone.")) return;
    setDeleting(true);
    const res = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    if (res.ok) router.push("/goals");
    else setDeleting(false);
  };

  return (
    <article className="space-y-8">
      {/* Header — area + title + status pill */}
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">
          {LIFE_AREA_LABELS[goal.lifeArea] ?? goal.lifeArea}
        </p>

        {editingTitle ? (
          <div className="flex items-center gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setEditingTitle(false);
                  setTitleDraft(goal.title);
                }
              }}
              autoFocus
              className="flex-1 rounded-lg border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50 outline-none focus:border-violet-500"
            />
            <button
              disabled={saving}
              onClick={saveTitle}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="group text-left w-full"
          >
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition">
              {goal.title}
              <span className="ml-2 text-xs font-normal text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition">
                (click to edit)
              </span>
            </h1>
          </button>
        )}

        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          First mentioned {formatRelativeDate(goal.createdAt)}
          {goal.lastMentionedAt && goal.lastMentionedAt !== goal.createdAt && (
            <> · last mentioned {formatRelativeDate(goal.lastMentionedAt)}</>
          )}
        </p>
      </header>

      {/* Status + progress */}
      <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none dark:ring-1 dark:ring-white/5">
        <div className="flex items-center justify-between gap-4">
          <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Status
          </label>
          <select
            value={goal.status}
            onChange={(e) => patch({ status: e.target.value })}
            disabled={saving}
            className="rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Progress
            </label>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {goal.progress}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={goal.progress}
            onChange={(e) => setGoal((g) => ({ ...g, progress: Number(e.target.value) }))}
            onMouseUp={() => patch({ progress: goal.progress })}
            onTouchEnd={() => patch({ progress: goal.progress })}
            className="w-full accent-violet-500"
          />
        </div>
      </section>

      {/* Notes */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Notes
          </h2>
          {!editingNotes && (
            <button
              onClick={() => {
                setNotesDraft(goal.notes ?? "");
                setEditingNotes(true);
              }}
              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500"
            >
              {goal.notes ? "Edit" : "Add notes"}
            </button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              autoFocus
              rows={4}
              placeholder="Reflections, blockers, next steps…"
              className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingNotes(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={saveNotes}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
              >
                Save notes
              </button>
            </div>
          </div>
        ) : goal.notes ? (
          <p className="whitespace-pre-wrap rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200">
            {goal.notes}
          </p>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500 italic">No notes yet.</p>
        )}
      </section>

      {/* Add reflection CTA */}
      <section>
        <button
          onClick={() =>
            router.push(`/home#record?goal=${encodeURIComponent(goal.title)}`)
          }
          className="w-full rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50 dark:bg-violet-950/20 px-5 py-4 text-left transition hover:border-violet-300 dark:hover:border-violet-700/40"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
            Add a reflection
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Record a short update on this goal →
          </p>
        </button>
      </section>

      {/* Linked entries */}
      {linkedEntries.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Linked entries
          </h2>
          <div className="space-y-2">
            {linkedEntries.map((e) => (
              <a
                key={e.id}
                href={`/entries/${e.id}`}
                className="block rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
              >
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-1">
                  {formatRelativeDate(e.createdAt)}
                  {e.mood && <> · {e.mood.toLowerCase()}</>}
                </p>
                <p className="text-sm text-zinc-700 dark:text-zinc-200 line-clamp-2">
                  {e.summary ?? "(no summary)"}
                </p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Delete */}
      <section className="pt-6 border-t border-zinc-200 dark:border-white/10">
        <button
          disabled={deleting}
          onClick={remove}
          className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-40"
        >
          Delete goal
        </button>
      </section>
    </article>
  );
}
