import { Card, SectionHeader } from "@/components/acuity";

/**
 * 28-night recording heatmap — per DESIGN_SYSTEM.md §9.1 Entries
 * surface inventory. Slice 5 (2026-05-22).
 *
 * Renders the last 28 days as a single horizontal grid. Today on the
 * right, day-27-ago on the left. Cells with at least one entry that
 * day fill with `gradPrimary` at descending opacity (today brightest,
 * oldest dimmest). Today specifically uses `gradMix` for the
 * coral→violet duo so the user can spot the "now" cell at a glance.
 * Empty cells are neutral (line-strong).
 *
 * The streak callout in the header ("X / 28 recorded") gives a
 * lightweight gamification cue without needing the full mobile streak
 * tile (which lives on Home, not Entries).
 *
 * Streak math: count consecutive non-zero days starting from today,
 * working backwards. Stops at the first gap. Matches mobile's flame
 * tile logic — same input, same output.
 */
export interface Heatmap28Props {
  /** ISO date strings or Date objects — any entry counts as "recorded
   *  that day", regardless of mood / status / completeness. */
  entryDates: Array<Date | string>;
}

const DAYS = 28;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function Heatmap28({ entryDates }: Heatmap28Props) {
  // Build a set of local-day timestamps for which the user recorded.
  // Multiple entries on the same day collapse to one — we're showing
  // "did they record today?" not "how many?".
  const recordedDays = new Set<number>();
  for (const d of entryDates) {
    const date = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(date.getTime())) continue;
    recordedDays.add(startOfLocalDay(date));
  }

  const today = startOfLocalDay(new Date());

  // Build the 28-cell array, oldest first → most recent (today) last.
  // Cells store whether the user recorded on that day + how many days
  // ago it was (0..27) for opacity-shading.
  const cells = Array.from({ length: DAYS }, (_, i) => {
    const daysAgo = DAYS - 1 - i;
    const cellTime = today - daysAgo * MS_PER_DAY;
    return {
      daysAgo,
      hadEntry: recordedDays.has(cellTime),
      isToday: daysAgo === 0,
    };
  });

  const recorded = cells.filter((c) => c.hadEntry).length;

  // Streak from today backwards.
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].hadEntry) streak += 1;
    else break;
  }

  return (
    <Card variant="default" radius="xl" padding={5} className="mb-6">
      <SectionHeader
        label="Last 28 nights"
        trailing={
          <span className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
            {streak > 0 ? `${streak}-night streak` : "Restart tonight"}
          </span>
        }
      />

      <div className="mt-4 flex items-baseline gap-3">
        <span
          className="font-display text-[44px] font-extrabold leading-none tracking-tight text-acuity-text"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {recorded}
        </span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          of 28 recorded
        </span>
      </div>

      <div
        className="mt-5 grid gap-[6px]"
        style={{ gridTemplateColumns: `repeat(${DAYS}, minmax(0, 1fr))` }}
        aria-label={`${recorded} of the last 28 nights recorded`}
        role="img"
      >
        {cells.map((cell, i) => (
          <Cell key={i} {...cell} />
        ))}
      </div>
    </Card>
  );
}

function Cell({
  daysAgo,
  hadEntry,
  isToday,
}: {
  daysAgo: number;
  hadEntry: boolean;
  isToday: boolean;
}) {
  if (isToday && hadEntry) {
    // Today + recorded → gradMix focal point.
    return (
      <div
        className="aspect-square rounded-[3px] bg-acuity-grad-mix"
        title="Tonight"
      />
    );
  }
  if (isToday && !hadEntry) {
    // Today + not yet → quiet primary-soft pulse (no animation; the
    // softness reads as "the day is still open").
    return (
      <div
        className="aspect-square rounded-[3px] bg-acuity-primary-soft"
        title="Tonight (not yet)"
      />
    );
  }
  if (hadEntry) {
    // Past day with an entry → gradPrimary at opacity decreasing with
    // age. 28 days back lands at ~30% opacity, today at 100%. Inline
    // style because Tailwind opacity utilities don't compose with
    // bg-acuity-grad-primary without color-mix gymnastics.
    const opacity = Math.max(0.3, 1 - daysAgo / 40);
    return (
      <div
        className="aspect-square rounded-[3px] bg-acuity-grad-primary"
        style={{ opacity }}
        title={`${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`}
      />
    );
  }
  // Empty day.
  return (
    <div
      className="aspect-square rounded-[3px] bg-acuity-line-strong"
      title={`${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago — no entry`}
    />
  );
}
