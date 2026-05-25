"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Small inline link / unlink control for a single CalendarEvent
 * row on the entry detail page. Slice 6 v1.2.
 *
 * Two states:
 *   - Unlinked: "+" button. Click → POST PATCH .../link-event, then
 *     router.refresh() so the parent server component re-fetches
 *     and the "Linked" badge appears.
 *   - Linked: "×" button. Click → PATCH unlink, refresh, badge gone.
 *
 * Optimistic state: we flip the local visual immediately on click
 * so the user doesn't see a 200ms blank state during the round-trip,
 * then trust router.refresh() to reconcile. On API failure we revert
 * + surface a tiny inline error tooltip.
 */

export function EntryEventLinker({
  entryId,
  eventId,
  initialLinked,
}: {
  entryId: string;
  eventId: string;
  initialLinked: boolean;
}) {
  const router = useRouter();
  const [linked, setLinked] = useState(initialLinked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const next = !linked;
    setLinked(next); // optimistic
    try {
      const res = await fetch(`/api/entries/${entryId}/link-event`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          action: next ? "link" : "unlink",
        }),
      });
      if (!res.ok) {
        setLinked(!next); // revert
        setError(
          res.status === 404
            ? "Event not found"
            : "Couldn't update — try again"
        );
        return;
      }
      router.refresh();
    } catch {
      setLinked(!next);
      setError("Couldn't update — try again");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={linked ? "Unlink this event" : "Link this event"}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-acuity-card-border text-acuity-text-sec transition hover:bg-acuity-card-bg-tint hover:text-acuity-text disabled:opacity-60"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {linked ? "×" : "+"}
        </span>
      </button>
      {error && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--acuity-warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
