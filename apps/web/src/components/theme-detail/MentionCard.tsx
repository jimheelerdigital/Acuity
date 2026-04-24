"use client";

import Link from "next/link";

import { formatRelativeDate, MOOD_LABELS } from "@acuity/shared";

/**
 * One mention card — dark rounded, timestamp + mood header, clamped
 * summary. Whole card is a link to the entry.
 */
export function MentionCard({
  entryId,
  summary,
  mood,
  createdAt,
}: {
  entryId: string;
  summary: string | null;
  mood: string | null;
  createdAt: string;
}) {
  return (
    <Link
      href={`/entries/${entryId}`}
      className="block rounded-2xl border px-4 py-3.5 transition-colors"
      style={{
        backgroundColor: "rgba(30,30,46,0.7)",
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ fontSize: 12, color: "rgba(161,161,170,0.8)", fontWeight: 500 }}
      >
        <span>{formatRelativeDate(createdAt)}</span>
        {mood ? <span>{MOOD_LABELS[mood] ?? mood}</span> : null}
      </div>
      <p
        className="mt-1.5 line-clamp-3"
        style={{ fontSize: 14, lineHeight: 1.45, color: "#E4E4E7" }}
      >
        {summary ?? "(no summary)"}
      </p>
    </Link>
  );
}
