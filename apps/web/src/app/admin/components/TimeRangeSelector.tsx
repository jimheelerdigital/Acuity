"use client";

export type TimeRange =
  | "today"
  | "7d"
  | "30d"
  | "60d"
  | "90d"
  | "all"
  | "mtd"
  | "custom";

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "60d", label: "60d" },
  { value: "90d", label: "90d" },
  { value: "mtd", label: "MTD" },
  { value: "all", label: "All" },
  { value: "custom", label: "Custom" },
];

interface Props {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
}

export default function TimeRangeSelector({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-acuity-pill border border-acuity-line bg-acuity-bg-sub p-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-acuity-pill px-3.5 py-1.5 text-[13px] font-medium tabular-nums transition duration-acuity-base ease-acuity-standard ${
              value === opt.value
                ? "bg-acuity-grad-mix text-acuity-text"
                : "text-acuity-text-sec hover:text-acuity-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === "custom" && onCustomChange && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStart ?? ""}
            onChange={(e) => onCustomChange(e.target.value, customEnd ?? "")}
            className="rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-[13px] text-acuity-text tabular-nums focus:outline-none focus:ring-1 focus:ring-acuity-primary"
          />
          <span className="text-[13px] text-acuity-text-quiet">to</span>
          <input
            type="date"
            value={customEnd ?? ""}
            onChange={(e) => onCustomChange(customStart ?? "", e.target.value)}
            className="rounded-acuity-sm bg-acuity-bg-inset px-3 py-2 text-[13px] text-acuity-text tabular-nums focus:outline-none focus:ring-1 focus:ring-acuity-primary"
          />
        </div>
      )}
    </div>
  );
}

export function getDateRange(range: TimeRange, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start: Date;

  switch (range) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7d":
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start = new Date(end);
      start.setDate(start.getDate() - 30);
      break;
    case "60d":
      start = new Date(end);
      start.setDate(start.getDate() - 60);
      break;
    case "all":
      // Far-past start; the metrics API clamps to DASHBOARD_EPOCH anyway.
      start = new Date("2020-01-01T00:00:00.000Z");
      break;
    case "90d":
      start = new Date(end);
      start.setDate(start.getDate() - 90);
      break;
    case "mtd":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "custom":
      start = customStart ? new Date(customStart) : new Date(end.getTime() - 7 * 86400000);
      if (customEnd) {
        return { start, end: new Date(customEnd + "T23:59:59.999") };
      }
      break;
    default:
      start = new Date(end);
      start.setDate(start.getDate() - 7);
  }

  return { start, end };
}
