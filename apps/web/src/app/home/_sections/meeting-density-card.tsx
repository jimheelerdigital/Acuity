import { Card, SectionHeader } from "@/components/acuity";

/**
 * Meeting-density card — slice 6 v1.2 Calendar Integration.
 *
 * Server-rendered card on /home that counts the user's CalendarEvent
 * rows from the last 7 days. Renders only when the user has at least
 * one event in window. Disconnected users + brand-new connections
 * see nothing here — no point in showing "0 meetings this week".
 *
 * Click → /insights/calendar for the basic list (stub for now;
 * richer calendar insights live at the Anchor People × Patterns
 * Across Time intersection in a future workstream).
 */

const WINDOW_DAYS = 7;

export async function MeetingDensityCard({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const count = await prisma.calendarEvent.count({
    where: { userId, startTime: { gte: windowStart, lte: new Date() } },
  });
  if (count === 0) return null;

  return (
    <a
      href="/insights/calendar"
      className="mb-6 block transition hover:brightness-105"
    >
      <Card variant="default" radius="xl" padding={6}>
        <SectionHeader label="Calendar" />
        <p className="mt-3 font-display text-2xl font-bold tracking-tight text-acuity-text sm:text-3xl">
          You had {count} meeting{count === 1 ? "" : "s"} this week
        </p>
        <p className="mt-2 text-[14px] text-acuity-text-sec">
          See the list →
        </p>
      </Card>
    </a>
  );
}
