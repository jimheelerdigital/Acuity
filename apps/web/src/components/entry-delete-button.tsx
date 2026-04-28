"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Subtle delete-control + confirm-modal pair for an Entry.
 *
 * Two render modes via `variant`:
 *   - "button" — a Trash icon-button suitable for the top-right of a
 *     detail page header.
 *   - "menu-item" — a row label suitable for use inside a hover/right-
 *     click menu on the entries list.
 *
 * On confirmation:
 *   - DELETE /api/entries/<id>
 *   - On 200: call onDeleted() (parent decides nav / list-removal)
 *   - On non-200: surface the error inline in the modal; user can
 *     close + retry.
 */

type Variant = "button" | "menu-item";

interface Props {
  entryId: string;
  variant?: Variant;
  /** Called once the DELETE returns 200. Parent decides whether to
   *  router.refresh() (detail-page case) or splice the row out
   *  optimistically (list case). */
  onDeleted?: () => void;
}

export function EntryDeleteButton({
  entryId,
  variant = "button",
  onDeleted,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setError(null);
  }, [busy]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const confirmDelete = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      // Parent handles navigation / list update. Default fallback
      // (when parent passes nothing): refresh the route so server data
      // re-fetches without the deleted row.
      if (onDeleted) {
        onDeleted();
      } else {
        router.refresh();
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }, [entryId, onDeleted, router]);

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-red-500/10 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition"
          aria-label="Delete this entry"
          title="Delete this entry"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Delete</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOpen(true);
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 hover:bg-red-500/10 dark:text-red-400"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete entry
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete entry"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-[#1E1E2E] dark:ring-1 dark:ring-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Delete this entry?
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              This cannot be undone. The transcript, audio, and any
              extracted tasks or themes from this entry will be removed.
            </p>
            {error && (
              <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="rounded-md px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
