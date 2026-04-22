"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PRIORITY_COLOR } from "@acuity/shared";

type Task = {
  id: string;
  title: string | null;
  text: string | null;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  snoozedUntil: string | null;
  completedAt: string | null;
  groupId: string | null;
  createdAt: string;
  entry: { entryDate: string } | null;
};

type TaskGroup = {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  isDefault: boolean;
  isAIGenerated: boolean;
  taskCount: number;
};

type Tab = "open" | "snoozed" | "completed";

const UNGROUPED_KEY = "__ungrouped__";

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [moveMenuTaskId, setMoveMenuTaskId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const [tasksRes, groupsRes] = await Promise.all([
      fetch("/api/tasks?all=1"),
      fetch("/api/task-groups"),
    ]);
    if (tasksRes.ok) {
      const data = await tasksRes.json();
      setTasks(data.tasks);
    }
    if (groupsRes.ok) {
      const data = await groupsRes.json();
      setGroups(data.groups);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const act = useCallback(
    async (id: string, action: string, extra?: Record<string, unknown>) => {
      if (action === "complete" || action === "reopen") {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, status: action === "complete" ? "DONE" : "OPEN" }
              : t
          )
        );
      }
      setActing((prev) => new Set(prev).add(id));
      try {
        const res = await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, ...extra }),
        });
        if (res.ok) await fetchAll();
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchAll]
  );

  const toggleGroup = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const now = Date.now();

  const grouped = useMemo(() => {
    const open: Task[] = [];
    const snoozed: Task[] = [];
    const completed: Task[] = [];

    for (const t of tasks) {
      if (t.status === "DONE") {
        completed.push(t);
      } else if (
        t.status === "SNOOZED" &&
        t.snoozedUntil &&
        new Date(t.snoozedUntil).getTime() > now
      ) {
        snoozed.push(t);
      } else {
        open.push(t);
      }
    }

    return { open, snoozed, completed };
  }, [tasks, now]);

  const current = grouped[activeTab];

  const tasksByGroup = useMemo(() => {
    const byGroup = new Map<string, Task[]>();
    for (const t of current) {
      const key = t.groupId ?? UNGROUPED_KEY;
      const arr = byGroup.get(key) ?? [];
      arr.push(t);
      byGroup.set(key, arr);
    }
    return byGroup;
  }, [current]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order),
    [groups]
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open", count: grouped.open.length },
    { key: "snoozed", label: "Snoozed", count: grouped.snoozed.length },
    { key: "completed", label: "Completed", count: grouped.completed.length },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">
          Tasks
          {grouped.open.length > 0 && (
            <span className="ml-2 align-middle text-base font-normal text-zinc-400 dark:text-zinc-500">
              {grouped.open.length} open
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Click a task to edit, click the circle to complete. Groups are
          AI-inferred — hover a row to change.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl bg-zinc-100 dark:bg-white/10 p-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? "bg-white dark:bg-[#1E1E2E] text-zinc-900 dark:text-zinc-50 shadow-sm"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div className="space-y-3">
          {sortedGroups.map((group) => {
            const groupTasks = tasksByGroup.get(group.id) ?? [];
            if (groupTasks.length === 0) return null;
            const collapsed = collapsedGroups.has(group.id);
            return (
              <GroupSection
                key={group.id}
                group={group}
                tasks={groupTasks}
                collapsed={collapsed}
                onToggle={() => toggleGroup(group.id)}
                tab={activeTab}
                groups={sortedGroups}
                acting={acting}
                onToggleComplete={(task) =>
                  act(
                    task.id,
                    task.status === "DONE" ? "reopen" : "complete"
                  )
                }
                onSnooze={(task) => act(task.id, "snooze")}
                onDismiss={(task) => act(task.id, "dismiss")}
                onMove={(task, groupId) =>
                  act(task.id, "move", { groupId })
                }
                onOpenFullEdit={(task) => setEditingTask(task)}
                moveMenuTaskId={moveMenuTaskId}
                setMoveMenuTaskId={setMoveMenuTaskId}
              />
            );
          })}

          {(() => {
            const ungroupedTasks = tasksByGroup.get(UNGROUPED_KEY) ?? [];
            if (ungroupedTasks.length === 0) return null;
            const collapsed = collapsedGroups.has(UNGROUPED_KEY);
            return (
              <GroupSection
                key={UNGROUPED_KEY}
                group={{
                  id: UNGROUPED_KEY,
                  name: "Ungrouped",
                  icon: "help-circle",
                  color: "#A1A1AA",
                  order: 999,
                  isDefault: false,
                  isAIGenerated: false,
                  taskCount: ungroupedTasks.length,
                }}
                tasks={ungroupedTasks}
                collapsed={collapsed}
                onToggle={() => toggleGroup(UNGROUPED_KEY)}
                tab={activeTab}
                groups={sortedGroups}
                acting={acting}
                onToggleComplete={(task) =>
                  act(
                    task.id,
                    task.status === "DONE" ? "reopen" : "complete"
                  )
                }
                onSnooze={(task) => act(task.id, "snooze")}
                onDismiss={(task) => act(task.id, "dismiss")}
                onMove={(task, groupId) =>
                  act(task.id, "move", { groupId })
                }
                onOpenFullEdit={(task) => setEditingTask(task)}
                moveMenuTaskId={moveMenuTaskId}
                setMoveMenuTaskId={setMoveMenuTaskId}
              />
            );
          })()}
        </div>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          groups={sortedGroups}
          onClose={() => setEditingTask(null)}
          onSaved={async () => {
            setEditingTask(null);
            await fetchAll();
          }}
        />
      )}
    </>
  );
}

function GroupSection({
  group,
  tasks,
  collapsed,
  onToggle,
  tab,
  groups,
  acting,
  onToggleComplete,
  onSnooze,
  onDismiss,
  onMove,
  onOpenFullEdit,
  moveMenuTaskId,
  setMoveMenuTaskId,
}: {
  group: TaskGroup;
  tasks: Task[];
  collapsed: boolean;
  onToggle: () => void;
  tab: Tab;
  groups: TaskGroup[];
  acting: Set<string>;
  onToggleComplete: (task: Task) => void;
  onSnooze: (task: Task) => void;
  onDismiss: (task: Task) => void;
  onMove: (task: Task, groupId: string | null) => void;
  onOpenFullEdit: (task: Task) => void;
  moveMenuTaskId: string | null;
  setMoveMenuTaskId: (id: string | null) => void;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-[#13131F] border border-zinc-200 dark:border-white/10 overflow-visible">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition"
      >
        <div className="flex items-center gap-2">
          <span
            className="block h-2 w-2 rounded-full"
            style={{ backgroundColor: group.color }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
            {group.name}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            {tasks.length}
          </span>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-zinc-400 transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {!collapsed && (
        <ul>
          {tasks.map((task, idx) => (
            <li
              key={task.id}
              className={
                idx === 0
                  ? "border-t border-zinc-100 dark:border-white/5"
                  : "border-t border-zinc-100 dark:border-white/5"
              }
            >
              <TaskRow
                task={task}
                tab={tab}
                groups={groups}
                busy={acting.has(task.id)}
                onToggle={() => onToggleComplete(task)}
                onOpenFullEdit={() => onOpenFullEdit(task)}
                onSnooze={() => onSnooze(task)}
                onDismiss={() => onDismiss(task)}
                onMove={(groupId) => onMove(task, groupId)}
                moveMenuOpen={moveMenuTaskId === task.id}
                setMoveMenuOpen={(open) =>
                  setMoveMenuTaskId(open ? task.id : null)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  tab,
  groups,
  busy,
  onToggle,
  onOpenFullEdit,
  onSnooze,
  onDismiss,
  onMove,
  moveMenuOpen,
  setMoveMenuOpen,
}: {
  task: Task;
  tab: Tab;
  groups: TaskGroup[];
  busy: boolean;
  onToggle: () => void;
  onOpenFullEdit: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
  onMove: (groupId: string | null) => void;
  moveMenuOpen: boolean;
  setMoveMenuOpen: (open: boolean) => void;
}) {
  const label = task.title ?? task.text ?? "Untitled task";
  const isDone = task.status === "DONE";
  const priorityColor =
    PRIORITY_COLOR[task.priority] ?? PRIORITY_COLOR.MEDIUM;
  const showPriorityChip =
    task.priority === "URGENT" || task.priority === "HIGH";
  const dueDate = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className="group relative flex items-start gap-3 py-3 px-4 transition-opacity"
      style={{ opacity: isDone ? 0.55 : 1 }}
    >
      <Checkbox
        checked={isDone}
        busy={busy}
        muted={tab === "snoozed"}
        onToggle={onToggle}
      />

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={onOpenFullEdit}
          className={`text-left text-sm leading-snug w-full ${
            isDone
              ? "text-zinc-400 dark:text-zinc-500 line-through"
              : "text-zinc-800 dark:text-zinc-100"
          }`}
        >
          {label}
        </button>

        {(showPriorityChip || dueDate || task.description) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
            {showPriorityChip && (
              <span
                className="rounded-full px-2 py-0.5 font-medium"
                style={{
                  backgroundColor: priorityColor + "18",
                  color: priorityColor,
                }}
              >
                {task.priority}
              </span>
            )}
            {dueDate && <span className="text-amber-600">Due {dueDate}</span>}
            {task.description && (
              <span className="line-clamp-1 flex-1 min-w-0">
                {task.description}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity relative">
          <button
            type="button"
            onClick={() => setMoveMenuOpen(!moveMenuOpen)}
            title="Move to…"
            aria-label="Move to group"
            className="rounded-lg p-1.5 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-700 dark:hover:text-zinc-200"
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
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
              <rect x="9" y="3" width="6" height="4" rx="1" />
            </svg>
          </button>
          {moveMenuOpen && (
            <div
              className="absolute right-0 top-9 z-20 w-40 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] shadow-lg overflow-hidden"
              onMouseLeave={() => setMoveMenuOpen(false)}
            >
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={g.id === task.groupId}
                  onClick={() => {
                    onMove(g.id);
                    setMoveMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <span
                    className="block h-2 w-2 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  {g.name}
                </button>
              ))}
              <button
                type="button"
                disabled={task.groupId === null}
                onClick={() => {
                  onMove(null);
                  setMoveMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-500 dark:text-zinc-400 border-t border-zinc-100 dark:border-white/5 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-40"
              >
                <span className="block h-2 w-2 rounded-full bg-zinc-400" />
                Ungrouped
              </button>
            </div>
          )}
          {tab === "open" && (
            <>
              <RowAction
                title="Snooze 24h"
                aria="Snooze"
                onClick={onSnooze}
                busy={busy}
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </RowAction>
              <RowAction
                title="Delete"
                aria="Delete"
                onClick={onDismiss}
                busy={busy}
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </RowAction>
            </>
          )}
        </div>
    </div>
  );
}

function Checkbox({
  checked,
  busy,
  muted,
  onToggle,
}: {
  checked: boolean;
  busy: boolean;
  muted?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      aria-label={checked ? "Mark task incomplete" : "Mark task complete"}
      aria-pressed={checked}
      className="mt-0.5 shrink-0 flex items-center justify-center transition-all duration-150 hover:scale-110 disabled:opacity-40"
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderStyle: muted ? "dashed" : "solid",
        borderColor: checked ? "#7C3AED" : "#A1A1AA",
        backgroundColor: checked ? "#7C3AED" : "transparent",
      }}
    >
      {checked ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : null}
    </button>
  );
}

function RowAction({
  title,
  aria,
  busy,
  onClick,
  children,
}: {
  title: string;
  aria: string;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={aria}
      className="rounded-lg p-1.5 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-40"
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

function TaskEditModal({
  task,
  groups,
  onClose,
  onSaved,
}: {
  task: Task;
  groups: TaskGroup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title ?? task.text ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""
  );
  const [groupId, setGroupId] = useState<string | "">(task.groupId ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      // Save fields
      await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: task.id,
          action: "edit",
          fields: {
            title: title.trim() || (task.title ?? task.text),
            description: description.trim() || null,
            priority,
            dueDate: due || null,
          },
        }),
      });
      // If group changed, fire a separate move action
      if ((groupId || null) !== task.groupId) {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: task.id,
            action: "move",
            groupId: groupId || null,
          }),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          Task details
        </h2>

        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
          Title
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
        />

        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-3 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
            >
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Due date
            </label>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-3 mb-1">
          Group
        </label>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#13131F] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500"
        >
          <option value="">Ungrouped</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const config = {
    open: {
      icon: "✅",
      title: "No tasks yet",
      desc: "Record a session and Acuity will extract them for you.",
    },
    snoozed: {
      icon: "😴",
      title: "No snoozed tasks",
      desc: "Snoozed tasks will appear here.",
    },
    completed: {
      icon: "🎉",
      title: "No completed tasks yet",
      desc: "Complete a task and it will show up here.",
    },
  }[tab];

  return (
    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-16 text-center">
      <div className="text-3xl mb-3">{config.icon}</div>
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {config.title}
      </p>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        {config.desc}
      </p>
    </div>
  );
}
