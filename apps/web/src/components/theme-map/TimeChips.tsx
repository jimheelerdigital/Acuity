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
 * Horizontally-scrolling time-range chips. Active chip gets a subtle
 * purple fill + ring. Driven by the spec values in the mockup v4.
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
      className="flex gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 py-1"
      style={{ scrollbarWidth: "none" }}
    >
      {CHIPS.map((c) => {
        const active = c.key === value;
        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onChange(c.key)}
            className="shrink-0 rounded-full px-[14px] py-2 text-sm font-medium transition-all"
            style={{
              backgroundColor: active
                ? "rgba(124,58,237,0.13)"
                : "transparent",
              borderWidth: 1,
              borderColor: active ? "#7C3AED" : "var(--border, rgba(148,163,184,0.25))",
              color: active
                ? "#C4B5FD"
                : "rgba(148,163,184,0.85)",
              boxShadow: active ? "0 0 0 3px rgba(124,58,237,0.12)" : "none",
            }}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}
