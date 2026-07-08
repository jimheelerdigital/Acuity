import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CALENDAR_INTEGRATION_ENABLED } from "@acuity/shared";

import { Card, SectionHeader } from "@/components/acuity";
import { BackButton } from "@/components/back-button";
import { getAuthOptions } from "@/lib/auth";

/**
 * /insights/calendar — basic list view, slice 6 v1.2.
 *
 * Stub by design. The richer calendar insights surface (meeting
 * density patterns, anchor-people clustering, time-of-day theme
 * correlation) lands at the Anchor People × Patterns Across Time
 * intersection in a future workstream. This page exists today so
 * the meeting-density card on /home has a real destination.
 *
 * Renders the last 30 days of events as a simple Card list. Empty
 * state copy invites the user to connect calendar from /account
 * when they have nothing yet.
 */

const WINDOW_DAYS = 30;
const MAX_ROWS = 100;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Calendar — Insights — Ripple",
  robots: { index: false, follow: false },
};

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

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default async function CalendarInsightsPage() {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/insights/calendar");
  }

  const { prisma } = await import("@/lib/prisma");
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86400_000);
  const events = await prisma.calendarEvent.findMany({
    where: { userId: session.user.id, startTime: { gte: windowStart } },
    orderBy: { startTime: "desc" },
    take: MAX_ROWS,
    select: {
      id: true,
      summary: true,
      startTime: true,
      attendees: true,
      location: true,
    },
  });

  return (
    <div className="min-h-screen bg-acuity-bg text-acuity-text">
      <main className="acuity-fade-up mx-auto max-w-2xl px-6 py-10">
        <BackButton className="mb-6" ariaLabel="Back to Insights" />
        <header className="mb-8">
          <SectionHeader label="Calendar" />
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-acuity-text">
            What was on your calendar
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-acuity-text-sec">
            Last {WINDOW_DAYS} days. Helps you remember what happened
            when — and what you might want to reflect on next.
          </p>
        </header>

        {events.length === 0 ? (
          <Card variant="default" radius="xl" padding={6}>
            {!CALENDAR_INTEGRATION_ENABLED ? (
              // Kill switch: don't steer users into the (disabled) connect flow.
              <p className="text-[15px] leading-relaxed text-acuity-text-sec">
                Calendar sync is{" "}
                <span className="font-medium text-acuity-text">coming soon</span>
                {" "}— temporarily unavailable while we finish setup. Once it&apos;s
                back, we&apos;ll pull the last 30 days in here.
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-acuity-text-sec">
                Nothing here yet. Connect Google Calendar from your{" "}
                <a
                  href="/account#calendar"
                  className="underline decoration-acuity-text-ter underline-offset-2"
                >
                  Account settings
                </a>
                {" "}and we&apos;ll pull the last 30 days in.
              </p>
            )}
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const attendees = normalizeAttendees(e.attendees);
              return (
                <Card key={e.id} variant="tinted" radius="lg" padding={4}>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
                    {formatDateTime(e.startTime)}
                  </p>
                  <p className="mt-1 font-display text-[15px] font-semibold text-acuity-text">
                    {e.summary?.trim() || "(no title)"}
                  </p>
                  {(attendees.length > 0 || e.location) && (
                    <p className="mt-1 text-[12px] text-acuity-text-ter">
                      {attendees.length > 0 &&
                        `with ${attendees.slice(0, 3).join(", ")}${attendees.length > 3 ? ` +${attendees.length - 3} more` : ""}`}
                      {attendees.length > 0 && e.location && " · "}
                      {e.location ?? ""}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
