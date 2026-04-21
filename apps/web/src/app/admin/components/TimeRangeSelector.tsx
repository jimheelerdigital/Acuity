"use client";

export type TimeRange =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "mtd"
  | "custom";

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "mtd", label: "Month-to-date" },
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
      <div className="flex items-center gap-1 rounded-lg bg-[#13131F] p-1">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              value === opt.value
                ? "bg-[#7C5CFC] text-white"
                : "text-white/40 hover:text-white/70"
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
            className="rounded-md bg-[#13131F] px-3 py-1.5 text-xs text-white/80"
          />
          <span className="text-xs text-white/30">to</span>
          <input
            type="date"
            value={customEnd ?? ""}
            onChange={(e) => onCustomChange(customStart ?? "", e.target.value)}
            className="rounded-md bg-[#13131F] px-3 py-1.5 text-xs text-white/80"
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
