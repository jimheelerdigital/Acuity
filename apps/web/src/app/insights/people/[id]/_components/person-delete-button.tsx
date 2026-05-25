"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Inline "permanently delete this archived Person" affordance.
 * Only renders on the archived detail view — the Person has zero
 * EntityMentions in the DB, so deletion is non-destructive to any
 * other surface. Cascade-deletes the (already empty) mention set
 * via the FK relation; merge history isn't tracked so no extra
 * cleanup needed.
 *
 * Two-step confirm (click "Delete permanently" → "Yes, delete")
 * stops accidental taps on small viewports. On success, router
 * navigates back to /insights/people.
 */

export function PersonDeleteButton({ personId }: { personId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Couldn't delete. Try again.");
        return;
      }
      router.push("/insights/people");
      router.refresh();
    } catch {
      setError("Couldn't delete. Try again.");
    } finally {
      setPending(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-acuity-pill px-3 py-1.5 text-[12px] font-medium text-acuity-text-ter transition hover:text-acuity-text"
      >
        Delete permanently
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-acuity-text-sec">
        This removes the record entirely.
      </span>
      <button
        type="button"
        onClick={() => void onDelete()}
        disabled={pending}
        className="rounded-acuity-pill px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
        style={{ color: "var(--acuity-warn)" }}
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-acuity-pill px-3 py-1.5 text-[12px] font-medium text-acuity-text-ter"
      >
        Cancel
      </button>
      {error && (
        <span
          className="w-full text-[12px]"
          style={{ color: "var(--acuity-warn)" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
