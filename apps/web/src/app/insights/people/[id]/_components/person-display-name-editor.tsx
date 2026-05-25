"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Inline rename for a Person's displayName. Slice 5 v1.2.
 *
 * Read mode: large display name + a small pencil glyph button.
 * Edit mode: text input + Save / Cancel. PATCHes the rename
 * endpoint, then router.refresh() so the rest of the page (Timeline
 * row alts, Care Pattern copy, etc.) re-render against the new name.
 *
 * Validation: trimmed length must be 1-80 chars. Empty submit or
 * out-of-range surfaces an inline error and leaves edit mode open.
 */

const MAX_LEN = 80;

export function PersonDisplayNameEditor({
  personId,
  initialName,
}: {
  personId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_LEN) {
      setError(`Name must be 1–${MAX_LEN} characters.`);
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      setError(null);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      if (!res.ok) {
        setError("Couldn't save — try again.");
        return;
      }
      setName(trimmed);
      setEditing(false);
      router.refresh();
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setPending(false);
    }
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
    setError(null);
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="truncate font-display text-3xl font-bold tracking-tight text-acuity-text">
          {name}
        </h1>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Rename"
          className="rounded-full p-1 text-acuity-text-ter transition hover:bg-acuity-card-bg-tint hover:text-acuity-text"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          else if (e.key === "Escape") cancel();
        }}
        maxLength={MAX_LEN + 5}
        className="flex-1 min-w-0 rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg px-3 py-1.5 font-display text-2xl font-bold text-acuity-text focus:outline-none focus:ring-1 focus:ring-acuity-text-ter"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={pending}
        className="rounded-acuity-pill bg-acuity-text px-3 py-1.5 text-[12px] font-semibold text-acuity-bg disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={cancel}
        className="rounded-acuity-pill px-3 py-1.5 text-[12px] font-medium text-acuity-text-ter"
      >
        Cancel
      </button>
      {error && (
        <p
          className="w-full text-[12px]"
          style={{ color: "var(--acuity-warn)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
