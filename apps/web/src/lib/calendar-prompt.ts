import "server-only";

/**
 * Calendar-prompt formatter for the v1.1 calendar AI augmentation
 * (slice C2 pre-design). Builds the `calendarBlock` string that
 * extractFromTranscript will splice into Claude's user message
 * alongside memoryContext / goalBlock / dimensionBlock /
 * taskGroupsBlock.
 *
 * **NOT wired into pipeline.ts yet.** Slice C2 is blocked on V5
 * dispositional themes reaching 100% rollout under the
 * v1_1_dispositional_themes feature flag — shipping calendar
 * augmentation while V5 is mid-ramp would confound the production
 * cohort data we're collecting on V5's recurrence rates.
 *
 * When C2 unblocks, the wiring is one new optional parameter on
 * extractFromTranscript and one new template-string interpolation
 * — see docs/v1-1/calendar-integration-scoping.md §4. The shape of
 * the formatted string is locked here so Phase A mobile can
 * package the same JSON the server emits and we get a clean test
 * surface during the wait.
 *
 * Privacy invariants enforced at the formatter (defense in depth —
 * the mobile client also strips these before upload, but the
 * server projects again):
 *   - No location, no notes/description, no attendee names/emails.
 *   - Per-event we keep title + times + attendeesCount + isAllDay
 *     + calendarSource only.
 *   - The CalendarEventInput type intentionally does NOT have
 *     location / notes / attendees fields, so a buggy caller
 *     can't accidentally pass them through.
 */

/** Calendar source classifier — used to label events in the prompt. */
export type CalendarSource = "work" | "personal" | "shared" | "unknown";

/**
 * Single calendar event projected to the fields the AI prompt needs.
 * Intentionally narrow — see header comment privacy invariants.
 */
export interface CalendarEventInput {
  /** Event title / summary. Free text from the user's calendar. */
  title: string;
  /** Event start, ISO 8601. */
  startISO: string;
  /** Event end, ISO 8601. */
  endISO: string;
  /** True for all-day events. Filters out of "meeting count" math. */
  isAllDay: boolean;
  /** Number of attendees (just the count, never the array). */
  attendeesCount: number;
  /** Calendar source label — work / personal / shared / unknown. */
  source: CalendarSource;
}

/**
 * Input to formatCalendarBlock. Today's events are required; prior-
 * day and prior-week summaries are optional and only included if
 * present (don't pad the prompt for users on day 1 of having a
 * connected calendar).
 */
export interface CalendarBlockInput {
  /** ISO date string, "YYYY-MM-DD". The day the entry is about. */
  todayISO: string;
  /** Today's events, sorted ascending by startISO. */
  todayEvents: CalendarEventInput[];
  /**
   * Yesterday's events, optional. When present, summarized as a
   * single-line comparative ("Yesterday: 3 events, 2.5 hrs of
   * meetings") — not enumerated event-by-event.
   */
  yesterdayEvents?: CalendarEventInput[];
  /**
   * Past 7 days of events (NOT including today), optional. Drives
   * the week roll-up line ("Past week meeting load: 23 meetings,
   * peak day Tuesday").
   */
  pastWeekEvents?: CalendarEventInput[];
}

/**
 * Format a calendar block for inclusion in the extraction prompt.
 *
 * Returns "" if there's nothing useful to say (no today events AND
 * no past-week activity) — the caller can `if (calendarBlock)` to
 * skip the prepend entirely rather than emitting an empty section.
 *
 * Spec — see docs/v1-1/calendar-integration-scoping.md §4. Shape:
 *
 *   Today's calendar (from the user's connected calendar):
 *   - 09:00–09:30 Standup (4 attendees, work)
 *   - 10:00–11:00 Quarterly review (12 attendees, work)
 *   Day summary: 2 work meetings, 0 personal events.
 *
 *   Yesterday's calendar: 3 events, ~2.5 hrs of meetings.
 *
 *   Past week meeting load: 23 meetings total, peak day Tuesday (7).
 */
export function formatCalendarBlock(input: CalendarBlockInput): string {
  const { todayEvents, yesterdayEvents, pastWeekEvents } = input;

  const hasAnything =
    todayEvents.length > 0 ||
    (yesterdayEvents && yesterdayEvents.length > 0) ||
    (pastWeekEvents && pastWeekEvents.length > 0);
  if (!hasAnything) return "";

  const sections: string[] = [];

  // ── Today block ────────────────────────────────────────────────
  if (todayEvents.length > 0) {
    const lines = ["Today's calendar (from the user's connected calendar):"];
    // Sort defensively — caller is supposed to provide sorted, but a
    // single sort here costs ~µs and prevents prompt-time surprises.
    const sorted = [...todayEvents].sort((a, b) =>
      a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0
    );
    for (const e of sorted) {
      lines.push(formatEventLine(e));
    }
    lines.push(formatDaySummary(sorted));
    sections.push(lines.join("\n"));
  }

  // ── Yesterday block ────────────────────────────────────────────
  if (yesterdayEvents && yesterdayEvents.length > 0) {
    sections.push(formatPriorDayLine(yesterdayEvents));
  }

  // ── Past week block ────────────────────────────────────────────
  if (pastWeekEvents && pastWeekEvents.length > 0) {
    sections.push(formatPastWeekLine(pastWeekEvents));
  }

  return sections.join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatEventLine(e: CalendarEventInput): string {
  if (e.isAllDay) {
    return `- All day: ${sanitizeTitle(e.title)} (${e.source})`;
  }
  const start = formatTimeHHMM(e.startISO);
  const end = formatTimeHHMM(e.endISO);
  const attendees =
    e.attendeesCount > 0
      ? `${e.attendeesCount} attendee${e.attendeesCount === 1 ? "" : "s"}, `
      : "";
  return `- ${start}–${end} ${sanitizeTitle(e.title)} (${attendees}${e.source})`;
}

function formatDaySummary(events: CalendarEventInput[]): string {
  // Count work / personal / shared meetings (excluding all-day events).
  const meetings = events.filter((e) => !e.isAllDay);
  const work = meetings.filter((e) => e.source === "work").length;
  const personal = meetings.filter((e) => e.source === "personal").length;
  const shared = meetings.filter((e) => e.source === "shared").length;
  const allDay = events.filter((e) => e.isAllDay).length;

  const parts: string[] = [];
  if (work > 0) parts.push(`${work} work meeting${work === 1 ? "" : "s"}`);
  if (personal > 0)
    parts.push(`${personal} personal event${personal === 1 ? "" : "s"}`);
  if (shared > 0)
    parts.push(`${shared} shared event${shared === 1 ? "" : "s"}`);
  if (allDay > 0)
    parts.push(`${allDay} all-day event${allDay === 1 ? "" : "s"}`);

  if (parts.length === 0) return "Day summary: no scheduled events.";
  return `Day summary: ${parts.join(", ")}.`;
}

function formatPriorDayLine(events: CalendarEventInput[]): string {
  const meetings = events.filter((e) => !e.isAllDay);
  const totalMs = meetings.reduce(
    (acc, e) =>
      acc + (new Date(e.endISO).getTime() - new Date(e.startISO).getTime()),
    0
  );
  const hours = Math.round((totalMs / (1000 * 60 * 60)) * 10) / 10;
  return `Yesterday's calendar: ${events.length} event${
    events.length === 1 ? "" : "s"
  }, ~${hours} hr${hours === 1 ? "" : "s"} of meetings.`;
}

function formatPastWeekLine(events: CalendarEventInput[]): string {
  const meetings = events.filter((e) => !e.isAllDay);
  const total = meetings.length;
  if (total === 0) return "Past week meeting load: 0 meetings.";

  const byDay = new Map<string, number>();
  for (const e of meetings) {
    const day = e.startISO.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  let peakDay = "";
  let peakCount = 0;
  for (const [day, count] of byDay.entries()) {
    if (count > peakCount) {
      peakDay = day;
      peakCount = count;
    }
  }
  const peakDOW = formatDayOfWeek(peakDay);
  return `Past week meeting load: ${total} meeting${
    total === 1 ? "" : "s"
  } total, peak day ${peakDOW} (${peakCount}).`;
}

function formatTimeHHMM(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "??:??";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatDayOfWeek(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "Unknown";
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return days[d.getUTCDay()] ?? "Unknown";
}

/**
 * Strip control chars and excessive whitespace from event titles.
 * Calendar titles are user-controlled but flow into a Claude prompt;
 * defense against prompt-injection attempts via crafted event titles
 * (e.g. "Lunch\n\n--- IGNORE PRIOR INSTRUCTIONS").
 */
function sanitizeTitle(title: string): string {
  // Collapse any whitespace (newlines, tabs, multiple spaces) to a
  // single space, then trim. Cap length at 200 chars — anything
  // longer is almost certainly malicious or accidental.
  const collapsed = title.replace(/\s+/g, " ").trim();
  return collapsed.length > 200 ? collapsed.slice(0, 200) + "…" : collapsed;
}
