"use client";

import {
  Briefcase,
  ChevronDown,
  HeartPulse,
  Palette,
  Sprout,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  GOAL_GROUPS,
  goalGroupForArea,
  type GoalGroupMeta,
} from "@acuity/shared";

/**
 * Tree-view Goals page.
 *
 * Calls GET /api/goals/tree, renders the forest as nested expandable
 * cards. Top-level goals surface first; children indent 24px per level.
 * Tasks show as leaf rows with a toggle; check → mark DONE / reopen.
 *
 * Add-subgoal opens a modal; archive + delete call the existing goal
 * PATCH/DELETE endpoints. Drag-and-drop reparent was scoped out for
 * v1 — the API supports it (PATCH /api/goals/[id]/reparent) so a
 * v2 addition is UI-only.
 *
 * Suggestions banner shows a PENDING count and links to the review
 * modal when the user has any.
 */

// Shape mirrors the API's GoalNode.
type Goal = {
  id: string;
  title: string;
  description: string | null;
  lifeArea: string;
  status: string;
  manualProgress: number;
  calculatedProgress: number;
  parentGoalId: string | null;
  depth: number;
  createdAt: string;
  lastMentionedAt: string | null;
  children: Goal[];
  tasks: Task[];
};

type Task = {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  priority: string;
};

const LIFE_AREA_META: Record<string, { label: string; color: string }> = {
  CAREER: { label: "Career", color: "#3B82F6" },
  HEALTH: { label: "Health", color: "#14B8A6" },
  RELATIONSHIPS: { label: "Relationships", color: "#F43F5E" },
  FINANCES: { label: "Finances", color: "#F59E0B" },
  PERSONAL: { label: "Personal Growth", color: "#A855F7" },
  OTHER: { label: "Other", color: "#71717A" },
};

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  NOT_STARTED: {
    label: "Not started",
    bg: "bg-zinc-100 dark:bg-white/5",
    text: "text-zinc-500 dark:text-zinc-400",
  },
  IN_PROGRESS: {
    label: "In progress",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  ON_HOLD: {
    label: "On hold",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
  },
  COMPLETE: {
    label: "Complete",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-700 dark:text-violet-300",
  },
  ARCHIVED: {
    label: "Archived",
    bg: "bg-zinc-100 dark:bg-white/5",
    text: "text-zinc-400 dark:text-zinc-500",
  },
};

export function GoalList() {
  const [roots, setRoots] = useState<Goal[] | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [addSubgoalFor, setAddSubgoalFor] = useState<Goal | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchTree = useCallback(async (withArchived = false) => {
    setLoading(true);
    const res = await fetch(
      `/api/goals/tree${withArchived ? "?includeArchived=1" : ""}`
    );
    if (res.ok) {
      const body = await res.json();
      setRoots(body.roots);
      setPendingSuggestions(body.pendingSuggestionsCount ?? 0);
      // Auto-expand top-level on first load so user sees their first-level
      // context without a click. Stable set identity per fetch.
      setExpanded((prev) => {
        if (prev.size > 0) return prev;
        const next = new Set<string>();
        for (const r of body.roots as Goal[]) next.add(r.id);
        return next;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTree(includeArchived);
  }, [fetchTree, includeArchived]);

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const performAction = useCallback(
    async (goalId: string, action: "complete" | "archive" | "start" | "restore") => {
      await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goalId, action }),
      });
      await fetchTree(includeArchived);
    },
    [fetchTree, includeArchived]
  );

  const deleteGoal = useCallback(
    async (goalId: string) => {
      if (!confirm("Delete this goal + its sub-goals? This can't be undone.")) return;
      await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
      await fetchTree(includeArchived);
    },
    [fetchTree, includeArchived]
  );

  const toggleTask = useCallback(
    async (taskId: string, currentStatus: string) => {
      const action = currentStatus === "DONE" ? "reopen" : "complete";
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: taskId, action }),
      });
      await fetchTree(includeArchived);
    },
    [fetchTree, includeArchived]
  );

  const groupedRoots = useMemo(() => {
    const byGroup = new Map<string, Goal[]>();
    for (const g of roots ?? []) {
      const group = goalGroupForArea(g.lifeArea);
      const arr = byGroup.get(group.id) ?? [];
      arr.push(g);
      byGroup.set(group.id, arr);
    }
    return GOAL_GROUPS.map((group) => ({
      group,
      goals: byGroup.get(group.id) ?? [],
    }));
  }, [roots]);

  const toggleGroupCollapse = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const inProgressCount = useMemo(() => {
    if (!roots) return 0;
    let n = 0;
    const walk = (g: Goal) => {
      if (g.status === "IN_PROGRESS") n += 1;
      for (const c of g.children) walk(c);
    };
    for (const r of roots) walk(r);
    return n;
  }, [roots]);

  if (loading && !roots) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  const totalGoals = (roots ?? []).length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
            Goals
            {inProgressCount > 0 && (
              <span className="ml-2 align-middle text-base font-normal text-zinc-400 dark:text-zinc-500">
                {inProgressCount} in progress
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            What you&apos;re working toward. Tap a goal for detail, or
            use the +&nbsp;button to add a sub-step.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded"
          />
          Show archived
        </label>
      </div>

      {pendingSuggestions > 0 && (
        <SuggestionsBanner
          count={pendingSuggestions}
          onOpen={() => setShowSuggestions(true)}
        />
      )}

      {totalGoals === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
          <div className="text-3xl mb-3">🎯</div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No goals yet</p>
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Mention a goal in your daily debrief and we&apos;ll track it here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedRoots.map(({ group, goals }) => {
            if (goals.length === 0) return null;
            const groupCollapsed = collapsedGroups.has(group.id);
            return (
              <section key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(group.id)}
                  className="w-full flex items-center gap-3 mb-2 group"
                >
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: group.color + "1A" }}
                  >
                    <GoalGroupIcon name={group.icon} color={group.color} />
                  </span>
                  <span className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                    {group.label}
                  </span>
                  <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 tabular-nums">
                    {goals.length}
                  </span>
                  <ChevronDown
                    className={`ml-auto h-4 w-4 text-zinc-400 transition-transform ${
                      groupCollapsed ? "-rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
                {!groupCollapsed && (
                  <div className="space-y-3">
                    {goals.map((g) => (
                      <GoalTreeNode
                        key={g.id}
                        goal={g}
                        depth={0}
                        expanded={expanded}
                        onToggleExpand={toggleExpanded}
                        onAction={performAction}
                        onDelete={deleteGoal}
                        onToggleTask={toggleTask}
                        onAddSubgoal={setAddSubgoalFor}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {addSubgoalFor && (
        <AddSubgoalModal
          parent={addSubgoalFor}
          onClose={() => setAddSubgoalFor(null)}
          onSaved={async () => {
            setAddSubgoalFor(null);
            await fetchTree(includeArchived);
          }}
        />
      )}

      {showSuggestions && (
        <SuggestionsModal
          onClose={() => setShowSuggestions(false)}
          onAnyChange={async () => {
            await fetchTree(includeArchived);
          }}
        />
      )}
    </>
  );
}

// ─── Tree node — recursive ────────────────────────────────────────────

function GoalTreeNode({
  goal,
  depth,
  expanded,
  onToggleExpand,
  onAction,
  onDelete,
  onToggleTask,
  onAddSubgoal,
}: {
  goal: Goal;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onAction: (id: string, action: "complete" | "archive" | "start" | "restore") => void;
  onDelete: (id: string) => void;
  onToggleTask: (id: string, currentStatus: string) => void;
  onAddSubgoal: (goal: Goal) => void;
}) {
  const isExpanded = expanded.has(goal.id);
  const status = STATUS_STYLES[goal.status] ?? STATUS_STYLES.NOT_STARTED;
  const area = LIFE_AREA_META[goal.lifeArea] ?? {
    label: goal.lifeArea,
    color: "#71717A",
  };
  const hasChildren = goal.children.length > 0;
  const hasTasks = goal.tasks.length > 0;
  const hasAnyChildren = hasChildren || hasTasks;
  const manualDifferent =
    goal.manualProgress !== goal.calculatedProgress && goal.manualProgress !== 0;
  const struck = goal.status === "COMPLETE";

  return (
    <div style={{ marginLeft: depth * 24 }}>
      <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] transition-all hover:shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_20px_rgba(0,0,0,0.08)] dark:shadow-none dark:ring-1 dark:ring-white/5">
        <div className="flex items-start gap-3">
          {hasAnyChildren ? (
            <button
              onClick={() => onToggleExpand(goal.id)}
              className="mt-1 p-1 rounded hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 120ms" }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ) : (
            <span className="w-5 h-5 mt-1 inline-block" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.text}`}
              >
                {status.label}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: area.color + "20", color: area.color }}
              >
                {area.label}
              </span>
              {hasChildren && (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  {goal.children.length} sub-goal{goal.children.length === 1 ? "" : "s"}
                </span>
              )}
            </div>

            <Link
              href={`/goals/${goal.id}`}
              className={`block text-sm leading-snug hover:text-violet-600 dark:hover:text-violet-400 transition ${
                struck
                  ? "text-zinc-400 dark:text-zinc-500 line-through"
                  : "text-zinc-800 dark:text-zinc-100"
              }`}
            >
              {goal.title}
            </Link>

            {/* Progress */}
            <div className="mt-2 flex items-center gap-3">
              <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
                <div
                  className="h-1.5 rounded-full bg-violet-500 transition-all duration-500"
                  style={{ width: `${goal.calculatedProgress}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 tabular-nums">
                {goal.calculatedProgress}%
              </span>
              {manualDifferent && (
                <span
                  className="text-[10px] text-zinc-400 dark:text-zinc-500"
                  title={`You set ${goal.manualProgress}% manually — rolled-up value is ${goal.calculatedProgress}%`}
                >
                  · you: {goal.manualProgress}%
                </span>
              )}
            </div>
          </div>

          {/* Per-goal actions */}
          <GoalActions
            goal={goal}
            onAction={onAction}
            onDelete={onDelete}
            onAddSubgoal={onAddSubgoal}
          />
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasAnyChildren && (
        <div className="mt-2 space-y-2 pl-3 border-l border-zinc-200 dark:border-white/10 ml-2">
          {goal.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              onToggle={() => onToggleTask(t.id, t.status)}
              indentPx={(depth + 1) * 24}
            />
          ))}
          {goal.children.map((child) => (
            <GoalTreeNode
              key={child.id}
              goal={child}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
              onAction={onAction}
              onDelete={onDelete}
              onToggleTask={onToggleTask}
              onAddSubgoal={onAddSubgoal}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GoalActions({
  goal,
  onAction,
  onDelete,
  onAddSubgoal,
}: {
  goal: Goal;
  onAction: (id: string, action: "complete" | "archive" | "start" | "restore") => void;
  onDelete: (id: string) => void;
  onAddSubgoal: (goal: Goal) => void;
}) {
  const [open, setOpen] = useState(false);
  const canAddSubgoal = goal.depth < 4;

  return (
    <div className="relative shrink-0 flex items-center gap-1">
      {canAddSubgoal && (
        <button
          onClick={() => onAddSubgoal(goal)}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition"
          aria-label="Add sub-goal"
          title="Add sub-goal"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 transition"
        aria-label="More"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-10 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] shadow-lg min-w-[140px] py-1"
          onMouseLeave={() => setOpen(false)}
        >
          {goal.status !== "IN_PROGRESS" && goal.status !== "COMPLETE" && (
            <MenuItem
              label="Start"
              onClick={() => {
                setOpen(false);
                onAction(goal.id, "start");
              }}
            />
          )}
          {goal.status !== "COMPLETE" && (
            <MenuItem
              label="Mark complete"
              onClick={() => {
                setOpen(false);
                onAction(goal.id, "complete");
              }}
            />
          )}
          {goal.status !== "ARCHIVED" && (
            <MenuItem
              label="Archive"
              onClick={() => {
                setOpen(false);
                onAction(goal.id, "archive");
              }}
            />
          )}
          {goal.status === "ARCHIVED" && (
            <MenuItem
              label="Restore"
              onClick={() => {
                setOpen(false);
                onAction(goal.id, "restore");
              }}
            />
          )}
          <MenuItem
            label="Delete"
            danger
            onClick={() => {
              setOpen(false);
              onDelete(goal.id);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-100 dark:hover:bg-white/5 ${
        danger ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

function TaskRow({
  task,
  onToggle,
  indentPx,
}: {
  task: Task;
  onToggle: () => void;
  indentPx: number;
}) {
  const label = task.title ?? task.text ?? "Untitled task";
  const done = task.status === "DONE";
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 bg-zinc-50 dark:bg-[#13131F]"
      style={{ marginLeft: indentPx - 12 }}
    >
      <button
        onClick={onToggle}
        aria-label={done ? "Mark open" : "Mark done"}
        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
          done
            ? "border-violet-500 bg-violet-500"
            : "border-zinc-300 dark:border-white/20"
        }`}
      >
        {done && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        )}
      </button>
      <span
        className={`text-xs ${
          done
            ? "text-zinc-400 dark:text-zinc-500 line-through"
            : "text-zinc-700 dark:text-zinc-200"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function AddSubgoalModal({
  parent,
  onClose,
  onSaved,
}: {
  parent: Goal;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/goals/${parent.id}/add-subgoal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(
          body.detail ??
            body.error ??
            (res.status >= 500
              ? "Something went wrong on our end — please try again."
              : "We couldn't save that — please check your input and retry.")
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Under</p>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          {parent.title}
        </h2>

        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
          Sub-goal
        </label>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onClose();
          }}
          placeholder="What's the next step?"
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
        />
        {err && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={saving || !text.trim()}
            onClick={save}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add sub-goal"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionsBanner({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="mb-5 w-full rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-[#1E1E2E] px-5 py-3 flex items-center justify-between gap-3 text-left hover:border-violet-300 dark:hover:border-violet-700/40 transition"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
          From your recordings
        </p>
        <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-100">
          {count} reflection{count === 1 ? "" : "s"} could become sub-goal
          {count === 1 ? "" : "s"}. Review →
        </p>
      </div>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-violet-500"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

// Suggestions modal — lives in F.5 separate file for composability.
import { SuggestionsModal } from "./suggestions-modal";

function GoalGroupIcon({
  name,
  color,
}: {
  name: GoalGroupMeta["icon"];
  color: string;
}) {
  const Icon =
    name === "Briefcase"
      ? Briefcase
      : name === "HeartPulse"
        ? HeartPulse
        : name === "Wallet"
          ? Wallet
          : name === "Users"
            ? Users
            : name === "Sprout"
              ? Sprout
              : Palette;
  return <Icon className="h-4 w-4" color={color} strokeWidth={2} aria-hidden />;
}
