"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/acuity";

/**
 * Inline transcript editor on /entries/[id]. Slice 2 v1.2 entry
 * editing.
 *
 * Read mode: the transcript text + a small pencil "Edit" affordance.
 * Edit mode: full-width textarea with the existing text, Save +
 * Cancel buttons. Save PATCHes /api/entries/[id] with the new
 * transcript and switches the page into a "Re-processing…" state by
 * polling /api/entries/[id] every 2s until status === COMPLETE
 * again, then router.refresh().
 *
 * Why the polling instead of subscribing to Inngest events: the
 * entry detail page already lives on Next App Router server
 * components — a router.refresh on completion re-fetches the new
 * derived state in one shot. Polling is the simpler hook.
 */

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 90_000;

export function TranscriptEditor({
  entryId,
  initialTranscript,
  reprocessing: initialReprocessing,
}: {
  entryId: string;
  initialTranscript: string;
  reprocessing: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTranscript);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(initialReprocessing);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
      // Auto-grow: set height to scrollHeight on focus.
      const el = textareaRef.current;
      if (el) {
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight + 20, 720)}px`;
      }
    }
  }, [editing]);

  // Reprocess poll loop. Runs when reprocessing flips true and
  // bails when the server says reprocessingStartedAt cleared (or
  // POLL_TIMEOUT_MS elapses — better than spinning forever).
  useEffect(() => {
    if (!reprocessing) return;
    let cancelled = false;
    const startedAt = Date.now();
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        if (!cancelled) {
          setReprocessing(false);
          router.refresh();
        }
        return;
      }
      try {
        const res = await fetch(`/api/entries/${entryId}`);
        if (res.ok) {
          const body = (await res.json()) as {
            entry: { status: string; reprocessingStartedAt: string | null };
          };
          if (
            !body.entry.reprocessingStartedAt &&
            body.entry.status === "COMPLETE"
          ) {
            if (!cancelled) {
              setReprocessing(false);
              router.refresh();
              return;
            }
          }
        }
      } catch {
        // Network blip — keep polling, the next tick may succeed.
      }
      if (!cancelled) setTimeout(tick, POLL_INTERVAL_MS);
    };
    const id = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [reprocessing, entryId, router]);

  const save = async () => {
    const next = draft.trim();
    if (next.length === 0) {
      setError("Transcript can't be empty.");
      return;
    }
    if (next === initialTranscript.trim()) {
      setEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          typeof body?.error === "string"
            ? body.error
            : `Couldn't save (${res.status}).`
        );
        return;
      }
      const body = (await res.json()) as { reprocessing?: boolean };
      setEditing(false);
      if (body.reprocessing) {
        setReprocessing(true);
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(initialTranscript);
    setEditing(false);
    setError(null);
  };

  if (reprocessing) {
    return (
      <Card variant="tinted" radius="lg" padding={5}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Re-processing…
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-acuity-text-sec">
          Ripple is re-deriving themes, mood, and people mentions from
          your edited transcript. This usually takes about 30 seconds.
        </p>
      </Card>
    );
  }

  if (!editing) {
    return (
      <>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            Transcript
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="Edit transcript"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-medium text-acuity-text-ter transition hover:bg-acuity-card-bg-tint hover:text-acuity-text"
          >
            <svg
              width="12"
              height="12"
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
            Edit
          </button>
        </div>
        <Card variant="tinted" radius="lg" padding={5}>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-acuity-text-sec">
            {initialTranscript}
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Editing transcript
        </p>
      </div>
      <Card variant="tinted" radius="lg" padding={4}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-acuity-text outline-none focus:ring-0"
          rows={Math.min(20, Math.max(6, draft.split("\n").length + 2))}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-acuity-pill bg-acuity-grad-primary px-4 py-2 text-[13px] font-semibold text-white shadow-acuity-glow-primary disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={cancel}
            className="rounded-acuity-pill px-3 py-2 text-[13px] font-medium text-acuity-text-ter hover:text-acuity-text"
          >
            Cancel
          </button>
          <p className="text-[12px] text-acuity-text-ter">
            Saving rebuilds themes, mood, and people mentions from the
            edited text.
          </p>
        </div>
        {error && (
          <p
            className="mt-3 text-[12px]"
            style={{ color: "var(--acuity-warn)" }}
          >
            {error}
          </p>
        )}
      </Card>
    </>
  );
}
