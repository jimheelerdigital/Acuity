"use client";

/**
 * Sentiment legend — horizontal row of small colored-dot/label pairs.
 * Sits under the bubble cluster; understated so it reads as a key,
 * not a hero row.
 */
export function SentimentLegend() {
  return (
    <div className="flex items-center justify-center gap-6 py-3">
      <Item color="#F87171" label="Challenging" />
      <Item color="#94A3B8" label="Neutral" />
      <Item color="#34D399" label="Positive" />
    </div>
  );
}

function Item({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block rounded-full"
        style={{
          width: 8,
          height: 8,
          backgroundColor: color,
          boxShadow: `0 0 6px ${color}`,
        }}
        aria-hidden
      />
      <span
        style={{
          fontSize: 11,
          color: "rgba(228,228,231,0.7)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
    </span>
  );
}
