"use client";

import { formatRelativeDate } from "@acuity/shared";

type Sentiment = "positive" | "neutral" | "challenging";

const DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

const BADGE_BG: Record<Sentiment, string> = {
  positive: "rgba(52,211,153,0.15)",
  challenging: "rgba(248,113,113,0.15)",
  neutral: "rgba(148,163,184,0.15)",
};

const BADGE_FG: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#FCA5A5",
  neutral: "#CBD5E1",
};

/**
 * Clean theme row — sentiment dot, name, pill badge with mention
 * count, muted metadata line below. No sparkline (the bubble cluster
 * carries the temporal story).
 *
 * Web parity with the mobile ThemeListRow.
 */
export function ThemeListRow({
  name,
  mentionCount,
  sentiment,
  firstMentionedAt,
  lastMentionedAt,
  onClick,
}: {
  name: string;
  mentionCount: number;
  sentiment: Sentiment;
  firstMentionedAt: string;
  lastMentionedAt: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1.5 block w-full rounded-2xl border px-5 py-3.5 text-left transition-colors"
      style={{
        backgroundColor: "rgba(30,30,46,0.6)",
        borderColor: "rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className="inline-block shrink-0 rounded-full"
            style={{
              width: 8,
              height: 8,
              backgroundColor: DOT[sentiment],
              boxShadow:
                sentiment === "neutral" ? "none" : `0 0 6px ${DOT[sentiment]}`,
            }}
            aria-hidden
          />
          <span
            className="truncate"
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#FAFAFA",
            }}
          >
            {sentenceCase(name)}
          </span>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 tabular-nums"
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.2px",
            backgroundColor: BADGE_BG[sentiment],
            color: BADGE_FG[sentiment],
          }}
        >
          {mentionCount}
        </span>
      </div>
      <div
        className="mt-1.5 truncate pl-[18px]"
        style={{ fontSize: 11, color: "rgba(161,161,170,0.7)" }}
      >
        First seen {formatRelativeDate(firstMentionedAt)} · Recent:{" "}
        {formatRelativeDate(lastMentionedAt)}
      </div>
    </button>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
