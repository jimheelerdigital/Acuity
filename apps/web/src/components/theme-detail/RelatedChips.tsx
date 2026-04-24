"use client";

import Link from "next/link";

type Sentiment = "positive" | "neutral" | "challenging";

const DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94A3B8",
};

/**
 * Related-themes pill chips — horizontal scroll on narrow viewports,
 * wrap on wider ones. Sentiment dot + theme name + small count per chip.
 */
export function RelatedChips({
  items,
}: {
  items: Array<{
    id: string;
    name: string;
    count: number;
    sentiment?: Sentiment;
  }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((r) => {
        const tone = r.sentiment ?? "neutral";
        return (
          <Link
            key={r.id}
            href={`/insights/theme/${r.id}`}
            className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 transition-colors"
            style={{
              backgroundColor: "rgba(30,30,46,0.7)",
              borderColor: "rgba(255,255,255,0.06)",
            }}
          >
            <span
              className="inline-block rounded-full"
              style={{
                width: 7,
                height: 7,
                backgroundColor: DOT[tone],
              }}
              aria-hidden
            />
            <span
              style={{
                fontSize: 13,
                color: "#E4E4E7",
                fontWeight: 500,
              }}
            >
              {sentenceCase(r.name)}
            </span>
            <span
              style={{ fontSize: 12, color: "rgba(161,161,170,0.65)" }}
            >
              ×{r.count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
