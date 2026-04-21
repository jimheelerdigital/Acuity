"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatRelativeDate } from "@acuity/shared";

/**
 * Suggestions review modal. Loads PENDING GoalSuggestion rows from
 * GET /api/goals/suggestions and renders each as a card with
 * Accept / Edit / Dismiss affordances. Acting on any suggestion fires
 * onAnyChange so the parent (goals-list) can re-fetch the tree.
 *
 * Empty state renders when the user clears them all mid-session.
 */

type Suggestion = {
  id: string;
  parentGoalId: string | null;
  parentGoalTitle: string | null;
  suggestedText: string;
  createdAt: string;
  source: {
    entryId: string;
    createdAt: string;
    excerpt: string;
  } | null;
};

export function SuggestionsModal({
  onClose,
  onAnyChange,
}: {
  onClose: () => void;
  onAnyChange: () => void;
}) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/goals/suggestions");
    if (res.ok) {
      const body = await res.json();
      setItems(body.suggestions);
    } else {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: string,
    action: "accept" | "dismiss" | "edit-accept",
    editedText?: string
  ) => {
    setPending((p) => new Set(p).add(id));
    try {
      const res = await fetch("/api/goals/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, editedText }),
      });
      if (res.ok) {
        setItems((prev) => (prev ?? []).filter((s) => s.id !== id));
        setEditingId(null);
        onAnyChange();
      }
    } finally {
      setPending((p) => {
        const next = new Set(p);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white dark:bg-[#1E1E2E] border border-zinc-200 dark:border-white/10 p-6 shadow-2xl my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Review suggestions
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Sub-goals we pulled from your recordings. Accept the ones
              that fit; dismiss the rest.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-400 dark:text-zinc-500"
            aria-label="Close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {items === null ? (
          <div className="py-12 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <div className="text-3xl mb-2">✨</div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              All caught up — no pending suggestions.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((s) => {
              const isPending = pending.has(s.id);
              const isEditing = editingId === s.id;
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] p-4"
                >
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    {s.parentGoalTitle
                      ? `Under "${s.parentGoalTitle}"`
                      : "Top-level suggestion"}
                  </p>

                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={2}
                      className="w-full mt-1 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-violet-500 resize-none"
                    />
                  ) : (
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {s.suggestedText}
                    </p>
                  )}

                  {s.source && (
                    <p className="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                      <Link
                        href={`/entry/${s.source.entryId}`}
                        className="hover:underline"
                      >
                        from your {formatRelativeDate(s.source.createdAt)} entry
                      </Link>
                      {s.source.excerpt && (
                        <>
                          {" — "}
                          <span className="italic">“{s.source.excerpt}”</span>
                        </>
                      )}
                    </p>
                  )}

                  <div className="mt-3 flex justify-end gap-2">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-white/5"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={isPending || !editText.trim()}
                          onClick={() =>
                            act(s.id, "edit-accept", editText.trim())
                          }
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
                        >
                          Save + accept
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          disabled={isPending}
                          onClick={() => act(s.id, "dismiss")}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-white dark:hover:bg-white/5 disabled:opacity-40"
                        >
                          Dismiss
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => {
                            setEditingId(s.id);
                            setEditText(s.suggestedText);
                          }}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-white dark:hover:bg-white/5 disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          disabled={isPending}
                          onClick={() => act(s.id, "accept")}
                          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
                        >
                          Accept
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
