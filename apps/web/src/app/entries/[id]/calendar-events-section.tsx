import { Card, SectionHeader } from "@/components/acuity";

import { EntryEventLinker } from "./entry-event-linker";

/**
 * Calendar Events that day — surfaces below the transcript on the
 * entry detail page. Slice 5 v1.2 Calendar Integration.
 *
 * Pulls CalendarEvent rows from the recording's [createdAt - 12h,
 * createdAt + 6h] window (same window the extraction pipeline
 * used in slice 3). Empty list → render nothing; we don't show a
 * "no events" empty state because a user without calendar
 * connected would always see it and it's noise.
 *
 * Each event card carries a subtle "linked" badge when its id is
 * in entry.linkedEventIds (auto-linked by the post-extraction
 * matcher OR manually linked via slice 6's UI).
 *
 * Server component — single Prisma read, no client state. Slice 6
 * wires a small client island into each row for the link/unlink
 * affordance.
 */

const LOOKBACK_HOURS = 12;
const LOOKAHEAD_HOURS = 6;
const MAX_EVENTS = 25;

interface AttendeeRow {
  email?: string | null;
  displayName?: string | null;
}

function normalizeAttendees(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is AttendeeRow => typeof r === "object" && r !== null)
    .map((r) => r.displayName?.trim() || r.email?.trim() || "")
    .filter((s) => s.length > 0);
}

function formatTimeRange(start: Date, end: Date | null): string {
  const startStr = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (!end) return startStr;
  const endStr = end.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${startStr} – ${endStr}`;
}

export async function EntryCalendarEventsSection({
  userId,
  entryId,
  recordedAt,
  linkedEventIds,
}: {
  userId: string;
  entryId: string;
  recordedAt: Date;
  linkedEventIds: string[];
}) {
  const { prisma } = await import("@/lib/prisma");
  const windowStart = new Date(recordedAt.getTime() - LOOKBACK_HOURS * 3600_000);
  const windowEnd = new Date(recordedAt.getTime() + LOOKAHEAD_HOURS * 3600_000);

  const rows = await prisma.calendarEvent.findMany({
    where: { userId, startTime: { gte: windowStart, lt: windowEnd } },
    orderBy: { startTime: "asc" },
    take: MAX_EVENTS,
    select: {
      id: true,
      summary: true,
      startTime: true,
      endTime: true,
      attendees: true,
      location: true,
    },
  });

  if (rows.length === 0) return null;

  const linkedSet = new Set(linkedEventIds);

  return (
    <section>
      <SectionHeader label="Calendar events that day" count={rows.length} />
      <div className="mt-3 space-y-2">
        {rows.map((e) => {
          const attendees = normalizeAttendees(e.attendees);
          const visible = attendees.slice(0, 3);
          const extra = Math.max(0, attendees.length - visible.length);
          const isLinked = linkedSet.has(e.id);
          return (
            <Card key={e.id} variant="tinted" radius="lg" padding={4}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-[15px] font-semibold text-acuity-text">
                      {e.summary?.trim() || "(no title)"}
                    </p>
                    {isLinked && (
                      <span
                        className="rounded-acuity-pill px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[1.2px]"
                        style={{
                          color: "var(--acuity-good)",
                          backgroundColor:
                            "color-mix(in oklch, var(--acuity-good), transparent 88%)",
                        }}
                      >
                        Linked
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] text-acuity-text-sec">
                    {formatTimeRange(e.startTime, e.endTime)}
                    {e.location ? ` · ${e.location}` : ""}
                  </p>
                  {visible.length > 0 && (
                    <p className="mt-1 text-[12px] text-acuity-text-ter">
                      with {visible.join(", ")}
                      {extra > 0 ? ` +${extra} more` : ""}
                    </p>
                  )}
                </div>
                <EntryEventLinker
                  entryId={entryId}
                  eventId={e.id}
                  initialLinked={isLinked}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
