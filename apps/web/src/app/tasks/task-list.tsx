"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  createdAt: string;
  entry: { entryDate: string } | null;
};

type Tab = "open" | "snoozed" | "completed";

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("open");
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState("");

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?all=1");
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const act = useCallback(
    async (id: string, action: string) => {
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
          body: JSON.stringify({ id, action }),
        });
        if (res.ok) await fetchTasks();
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchTasks]
  );

  const saveInlineEdit = useCallback(
    async (id: string, nextTitle: string) => {
      const trimmed = nextTitle.trim();
      setInlineEditId(null);
      setInlineEditText("");
      const task = tasks.find((t) => t.id === id);
      const original = task?.title ?? task?.text ?? "";
      if (!trimmed || trimmed === original) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, title: trimmed } : t))
      );
      try {
        await fetch("/api/tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id,
            action: "edit",
            fields: { title: trimmed },
          }),
        });
        await fetchTasks();
      } catch {
        await fetchTasks();
      }
    },
    [tasks, fetchTasks]
  );

  const beginInlineEdit = useCallback((task: Task) => {
    setInlineEditId(task.id);
    setInlineEditText(task.title ?? task.text ?? "");
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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "open", label: "Open", count: grouped.open.length },
    { key: "snoozed", label: "Snoozed", count: grouped.snoozed.length },
    { key: "completed", label: "Completed", count: grouped.completed.length },
  ];

  const current = grouped[activeTab];

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
          Tasks
          {grouped.open.length > 0 && (
            <span className="ml-2 align-middle text-base font-normal text-zinc-400 dark:text-zinc-500">
              {grouped.open.length} open
            </span>
          )}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Click a task to edit, click the circle to complete.
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
        <ul className="rounded-xl bg-white dark:bg-[#13131F] border border-zinc-200 dark:border-white/10 overflow-hidden">
          {current.map((task, idx) => (
            <li
              key={task.id}
              className={
                idx === 0
                  ? ""
                  : "border-t border-zinc-100 dark:border-white/5"
              }
            >
              <TaskRow
                task={task}
                tab={activeTab}
                busy={acting.has(task.id)}
                isEditing={inlineEditId === task.id}
                editText={inlineEditText}
                onEditChange={setInlineEditText}
                onEditBegin={() => beginInlineEdit(task)}
                onEditEnd={() => saveInlineEdit(task.id, inlineEditText)}
                onToggle={() =>
                  act(task.id, task.status === "DONE" ? "reopen" : "complete")
                }
                onOpenFullEdit={() => setEditingTask(task)}
                onSnooze={() => act(task.id, "snooze")}
                onReopen={() => act(task.id, "reopen")}
                onDismiss={() => act(task.id, "dismiss")}
              />
            </li>
          ))}
        </ul>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={async () => {
            setEditingTask(null);
            await fetchTasks();
          }}
        />
      )}
    </>
  );
}

function TaskRow({
  task,
  tab,
  busy,
  isEditing,
  editText,
  onEditChange,
  onEditBegin,
  onEditEnd,
  onToggle,
  onOpenFullEdit,
  onSnooze,
  onReopen,
  onDismiss,
}: {
  task: Task;
  tab: Tab;
  busy: boolean;
  isEditing: boolean;
  editText: string;
  onEditChange: (next: string) => void;
  onEditBegin: () => void;
  onEditEnd: () => void;
  onToggle: () => void;
  onOpenFullEdit: () => void;
  onSnooze: () => void;
  onReopen: () => void;
  onDismiss: () => void;
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  return (
    <div
      className="group flex items-start gap-3 py-3 px-4 transition-opacity"
      style={{ opacity: isDone ? 0.55 : 1 }}
    >
      <Checkbox
        checked={isDone}
        busy={busy}
        muted={tab === "snoozed"}
        onToggle={onToggle}
      />

      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            ref={inputRef}
            value={editText}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditEnd}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onEditEnd();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onEditEnd();
              }
            }}
            className="w-full bg-transparent text-sm leading-snug text-zinc-900 dark:text-zinc-100 outline-none border-b border-violet-500 py-0"
          />
        ) : (
          <button
            type="button"
            onClick={onEditBegin}
            className={`text-left text-sm leading-snug w-full ${
              isDone
                ? "text-zinc-400 dark:text-zinc-500 line-through"
                : "text-zinc-800 dark:text-zinc-100"
            }`}
          >
            {label}
          </button>
        )}

        {(showPriorityChip || dueDate || task.description) && !isEditing && (
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
            {dueDate && (
              <span className="text-amber-600">Due {dueDate}</span>
            )}
            {task.description && (
              <span className="line-clamp-1 flex-1 min-w-0">
                {task.description}
              </span>
            )}
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {tab !== "completed" && (
            <RowAction
              title="Details"
              aria="Open full edit"
              onClick={onOpenFullEdit}
              busy={busy}
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
            </RowAction>
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
          {tab === "snoozed" && (
            <RowAction
              title="Reopen now"
              aria="Reopen"
              onClick={onReopen}
              busy={busy}
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
            </RowAction>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 22px circle, 2px border. Empty when unchecked, #7C3AED fill + white check
 * when checked. Matches the mobile Tasks screen exactly.
 */
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
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task.title ?? task.text ?? "");
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [due, setDue] = useState(
    task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
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
      if (res.ok) onSaved();
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
      desc: "Record a session and they'll appear.",
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
