/**
 * GET /api/admin/adlab/debug-sessions — debug endpoint showing raw session event counts
 * with bot detection analysis.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BOT_PATTERNS = /facebookexternalhit|Facebot|FacebookBot|WhatsApp|Twitterbot|LinkedInBot|Googlebot|bingbot|Bytespider|Amazonbot|prefetch|prerender|HeadlessChrome|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|Exabot|ia_archiver|MJ12bot|AhrefsBot|SemrushBot|DotBot|PetalBot|bot\/|crawler|spider/i;

function isBot(ua: string | null): boolean {
  if (!ua) return false;
  return BOT_PATTERNS.test(ua);
}

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

  // Step progress for "advanced past pain hook" check
  const ADVANCED_EVENTS = new Set([
    "funnel_diagnostic_loop_viewed", "funnel_diagnostic_loop",
    "funnel_mirror_viewed", "funnel_commitment_completed",
    "funnel_signup_completed", "funnel_payment_completed",
  ]);

  // Build summary
  const sessions = [...sessionMap.entries()].map(([token, evts]) => {
    const sorted = evts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const browserField = evts.find((e) => e.browser)?.browser ?? null;
    const botDetected = isBot(browserField);
    const advancedPastPainHook = evts.some((e) => ADVANCED_EVENTS.has(e.event));

    return {
      sessionId: token.slice(0, 8),
      fullToken: token,
      eventCount: evts.length,
      browser: browserField,
      isBot: botDetected,
      advancedPastPainHook,
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

  // Bot analysis
  const botSessions = sessions.filter((s) => s.isBot);
  const realSessions = sessions.filter((s) => !s.isBot);
  const noBrowserSessions = sessions.filter((s) => !s.browser);
  const realAdvanced = realSessions.filter((s) => s.advancedPastPainHook);

  // UA breakdown — show unique UAs and how many sessions each has
  const uaCounts: Record<string, { count: number; isBot: boolean }> = {};
  for (const s of sessions) {
    const ua = s.browser || "(no browser field)";
    if (!uaCounts[ua]) uaCounts[ua] = { count: 0, isBot: s.isBot };
    uaCounts[ua].count++;
  }
  const uaBreakdown = Object.entries(uaCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([ua, { count, isBot: bot }]) => ({ ua: ua.slice(0, 200), count, isBot: bot }));

  return NextResponse.json({
    summary: {
      totalEvents: events.length,
      eventsWithoutToken: noTokenCount,
      totalSessions: sessions.length,
      botSessions: botSessions.length,
      realSessions: realSessions.length,
      noBrowserField: noBrowserSessions.length,
      realSessionsAdvancedPastPainHook: realAdvanced.length,
      realSessionsStuckAtPainHook: realSessions.length - realAdvanced.length,
    },
    eventCountDistribution: countDist,
    uaBreakdown,
    // Show bot sessions first, then real, limited to 50 each
    botSessionDetails: botSessions.slice(0, 50).map((s) => ({
      sessionId: s.sessionId, browser: s.browser, eventCount: s.eventCount,
      firstEvent: s.firstEvent, source: s.source, campaign: s.campaign,
    })),
    realSessionDetails: realSessions.slice(0, 50).map((s) => ({
      sessionId: s.sessionId, browser: s.browser, eventCount: s.eventCount,
      advancedPastPainHook: s.advancedPastPainHook,
      firstEvent: s.firstEvent, lastEvent: s.lastEvent, durationSec: s.durationSec,
      source: s.source, campaign: s.campaign,
    })),
  });
}
