"use client";

export type TimeWindow = "week" | "month" | "3months" | "6months" | "all";

const CHIPS: { key: TimeWindow; label: string }[] = [
  { key: "week", label: "Last week" },
  { key: "month", label: "Last month" },
  { key: "3months", label: "3 months" },
  { key: "6months", label: "6 months" },
  { key: "all", label: "All time" },
];

/**
 * Segmented pill time selector — dark rounded track with the active
 * option filled in accent purple and a soft glow. Parity with the
 * mobile TimeChips.
 */
export function TimeChips({
  value,
  onChange,
}: {
  value: TimeWindow;
  onChange: (next: TimeWindow) => void;
}) {
  return (
    <div
      className="overflow-x-auto scrollbar-hide -mx-6 px-6 py-1"
      style={{ scrollbarWidth: "none" }}
    >
      <div
        className="inline-flex rounded-full border p-1"
        style={{
          backgroundColor: "rgba(30,30,46,0.6)",
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        {CHIPS.map((c) => {
          const active = c.key === value;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onChange(c.key)}
              className="shrink-0 rounded-full px-4 py-2 text-sm transition-all"
              style={{
                backgroundColor: active ? "#7C3AED" : "transparent",
                color: active ? "#FFFFFF" : "rgba(228,228,231,0.7)",
                fontWeight: active ? 600 : 500,
                boxShadow: active
                  ? "0 4px 14px rgba(124,58,237,0.5)"
                  : "none",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
