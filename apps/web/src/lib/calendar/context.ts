/**
 * Calendar context for the recording-extraction pipeline.
 *
 * Slice 3 v1.2 Calendar Integration. Pulls events from the local
 * CalendarEvent mirror in the [recordedAt - 12h, recordedAt + 6h]
 * window — captures the day's events from the previous evening
 * through the next afternoon, which is the natural arc for an
 * evening reflection.
 *
 * Returns a structured block the LLM prompt can interpolate plus
 * the raw event ids so the post-extraction matcher can substring-
 * match summaries against entry text and populate Entry.linkedEventIds.
 */

const LOOKBACK_HOURS = 12;
const LOOKAHEAD_HOURS = 6;
const MAX_EVENTS = 25; // hard ceiling to keep prompt size predictable

export interface CalendarContextEvent {
  id: string;
  externalEventId: string;
  summary: string | null;
  startTime: Date;
  endTime: Date | null;
  attendees: string[]; // display names or emails
  location: string | null;
}

export interface CalendarContext {
  events: CalendarContextEvent[];
  /** Prompt-ready text block. Empty string when there are no events. */
  promptBlock: string;
}

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

function formatTime(d: Date): string {
  // 12-hour with leading zero stripped — matches casual reflection
  // tone ("3pm" not "15:00").
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export async function fetchCalendarContext(
  userId: string,
  recordedAt: Date
): Promise<CalendarContext> {
  const { prisma } = await import("@/lib/prisma");

  const windowStart = new Date(
    recordedAt.getTime() - LOOKBACK_HOURS * 3600_000
  );
  const windowEnd = new Date(
    recordedAt.getTime() + LOOKAHEAD_HOURS * 3600_000
  );

  const rows = await prisma.calendarEvent.findMany({
    where: {
      userId,
      startTime: { gte: windowStart, lt: windowEnd },
    },
    orderBy: { startTime: "asc" },
    take: MAX_EVENTS,
    select: {
      id: true,
      externalEventId: true,
      summary: true,
      startTime: true,
      endTime: true,
      attendees: true,
      location: true,
    },
  });

  const events: CalendarContextEvent[] = rows.map((r) => ({
    id: r.id,
    externalEventId: r.externalEventId,
    summary: r.summary,
    startTime: r.startTime,
    endTime: r.endTime,
    attendees: normalizeAttendees(r.attendees),
    location: r.location,
  }));

  if (events.length === 0) {
    return { events, promptBlock: "" };
  }

  // One line per event: "9:00 AM — Standup with Sarah (zoom)".
  // Attendees capped at 3 + count to keep tokens predictable on
  // big invites. Empty fields elided so the prompt doesn't read
  // like "(no attendees)" noise.
  const lines = events.map((e) => {
    const title = e.summary?.trim() || "(no title)";
    const time = formatTime(e.startTime);
    const trailing: string[] = [];
    if (e.attendees.length > 0) {
      const first = e.attendees.slice(0, 3).join(", ");
      const more = e.attendees.length > 3 ? ` +${e.attendees.length - 3}` : "";
      trailing.push(`with ${first}${more}`);
    }
    if (e.location) trailing.push(e.location);
    const tail = trailing.length > 0 ? ` — ${trailing.join(" · ")}` : "";
    return `${time} — ${title}${tail}`;
  });

  const promptBlock = `Here are the calendar events from the user's day, anchored to the recording window. When the user references meetings, people, or events in the transcript, anchor them to specific calendar entries if the match is clear. Do not invent or assume references that aren't in the transcript.\n\n${lines.join("\n")}\n\n`;

  return { events, promptBlock };
}

/**
 * Post-extraction matcher: given the entry's summary + transcript
 * and the events that were in the prompt context, return the IDs
 * of events whose titles substring-match the entry text. Conservative
 * by design — only obvious matches link automatically. Slice 6's
 * manual link/unlink UI handles the long tail.
 */
export function inferLinkedEventIds(
  text: string,
  events: Array<{
    id: string;
    summary: string | null;
    attendees: string[];
  }>
): string[] {
  if (!text || events.length === 0) return [];
  const haystack = text.toLowerCase();
  const linked: string[] = [];
  for (const e of events) {
    const title = e.summary?.trim().toLowerCase();
    if (!title || title.length < 4) continue; // skip 1-3 char titles ("hi", "x")
    if (haystack.includes(title)) {
      linked.push(e.id);
      continue;
    }
    // Attendee fallback — if the entry mentions a specific person
    // from a small (1-3 attendee) meeting, link that meeting.
    if (e.attendees.length >= 1 && e.attendees.length <= 3) {
      for (const a of e.attendees) {
        const lower = a.toLowerCase();
        // First-name match: split on whitespace, take token 0.
        const first = lower.split(/\s+/)[0];
        if (first.length >= 3 && haystack.includes(first)) {
          linked.push(e.id);
          break;
        }
      }
    }
  }
  return Array.from(new Set(linked));
}
