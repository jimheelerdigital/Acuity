/**
 * GET /api/admin/adlab/debug-sessions — debug endpoint showing raw session event counts.
 * Shows all OnboardingEvent records from the last 24 hours grouped by sessionToken.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const events = await prisma.onboardingEvent.findMany({
    where: {
      event: { startsWith: "funnel_" },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 10000,
    select: {
      sessionToken: true,
      event: true,
      value: true,
      createdAt: true,
      utmSource: true,
      utmCampaign: true,
      utmContent: true,
      browser: true,
    },
  });

  // Group by session
  const sessionMap = new Map<string, typeof events>();
  let noTokenCount = 0;
  for (const e of events) {
    if (!e.sessionToken) { noTokenCount++; continue; }
    const key = e.sessionToken;
    if (!sessionMap.has(key)) sessionMap.set(key, []);
    sessionMap.get(key)!.push(e);
  }

  // Build summary
  const sessions = [...sessionMap.entries()].map(([token, evts]) => {
    const sorted = evts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return {
      sessionId: token.slice(0, 8),
      fullToken: token,
      eventCount: evts.length,
      events: sorted.map((e) => ({
        event: e.event,
        value: e.value,
        createdAt: e.createdAt,
        browser: e.browser,
      })),
      firstEvent: sorted[0].event,
      lastEvent: sorted[sorted.length - 1].event,
      durationSec: Math.round((new Date(sorted[sorted.length - 1].createdAt).getTime() - new Date(sorted[0].createdAt).getTime()) / 1000),
      source: evts.find((e) => e.utmSource)?.utmSource ?? "direct",
      campaign: evts.find((e) => e.utmCampaign)?.utmCampaign ?? null,
      creative: evts.find((e) => e.utmContent)?.utmContent ?? null,
    };
  }).sort((a, b) => b.eventCount - a.eventCount);

  // Distribution stats
  const countDist: Record<number, number> = {};
  for (const s of sessions) {
    countDist[s.eventCount] = (countDist[s.eventCount] ?? 0) + 1;
  }

  const singleEventSessions = sessions.filter((s) => s.eventCount === 1);
  const multiEventSessions = sessions.filter((s) => s.eventCount > 1);

  return NextResponse.json({
    totalEvents: events.length,
    eventsWithoutToken: noTokenCount,
    totalSessions: sessions.length,
    singleEventSessions: singleEventSessions.length,
    multiEventSessions: multiEventSessions.length,
    eventCountDistribution: countDist,
    sessions: sessions.slice(0, 100), // Limit to 100 for response size
  });
}
