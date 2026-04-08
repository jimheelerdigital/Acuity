"use client";

import { useState } from "react";
import { MOOD_EMOJI, MOOD_LABELS } from "@acuity/shared";
import type { Entry, Mood } from "@prisma/client";

type EntryCardProps = {
  entry: Pick<
    Entry,
    | "id"
    | "summary"
    | "mood"
    | "energy"
    | "themes"
    | "wins"
    | "blockers"
    | "createdAt"
  >;
};

export function EntryCard({ entry }: EntryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const moodKey = entry.mood as Mood | null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden transition hover:border-zinc-700">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-start justify-between gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-medium text-zinc-500">{date}</span>
            {moodKey && (
              <span className="text-xs text-zinc-400">
                {MOOD_EMOJI[moodKey]} {MOOD_LABELS[moodKey]}
              </span>
            )}
            {entry.energy !== null && (
              <span className="text-xs text-zinc-500">
                · Energy {entry.energy}/10
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-200 leading-snug line-clamp-2">
            {entry.summary ?? "No summary generated."}
          </p>
          {entry.themes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.themes.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-4 space-y-4">
          {entry.wins.length > 0 && (
            <div>
              <p className="text-xs font-medium text-green-500 mb-1.5">Wins</p>
              <ul className="space-y-1">
                {entry.wins.map((w, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <span className="text-green-500 shrink-0">✓</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entry.blockers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-400 mb-1.5">Blockers</p>
              <ul className="space-y-1">
                {entry.blockers.map((b, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <span className="text-red-400 shrink-0">↳</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
