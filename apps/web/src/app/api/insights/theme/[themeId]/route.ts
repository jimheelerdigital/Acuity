/**
 * GET /api/insights/theme/[themeId]
 *
 * Single-theme drill-down. Returns:
 *   theme          — name, sentiment band, mention count, first/last seen
 *   trend          — mentions per day for the last 30 days (array length 30)
 *   mentions       — every entry that mentions this theme, newest-first
 *                    (summary snippet + mood + createdAt + entryId)
 *   relatedThemes  — up to 5 themes that co-occur in the same entries
 *   aiInsight      — placeholder for the AI-generated pattern narrative
 *                    (TODO: reuse existing theme analysis when available)
 *
 * Auth: cookie session or mobile bearer via getAnySessionUserId.
 * Ownership-guarded: the theme must belong to the requesting user.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;

type SentimentBand = "positive" | "neutral" | "challenging";

function scoreToBand(score: number): SentimentBand {
  if (score > 0.25) return "positive";
  if (score < -0.25) return "challenging";
  return "neutral";
}

function sentimentToScore(s: string): number {
  if (s === "POSITIVE") return 1;
  if (s === "NEGATIVE") return -1;
  return 0;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { themeId: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");

  const theme = await prisma.theme.findFirst({
    where: { id: params.themeId, userId },
    select: { id: true, name: true, createdAt: true },
  });
  if (!theme) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mentions = await prisma.themeMention.findMany({
    where: { themeId: theme.id },
    orderBy: { createdAt: "desc" },
    select: {
      entryId: true,
      sentiment: true,
      createdAt: true,
      entry: {
        select: {
          id: true,
          summary: true,
          mood: true,
          createdAt: true,
        },
      },
    },
  });

  // Aggregate sentiment band from the ThemeMention rows.
  const avgSentiment =
    mentions.length > 0
      ? mentions.reduce((s, m) => s + sentimentToScore(m.sentiment), 0) /
        mentions.length
      : 0;
  const sentimentBand = scoreToBand(avgSentiment);

  const mentionCount = mentions.length;
  const firstMentionedAt = theme.createdAt.toISOString();
  const lastMentionedAt =
    mentions[0]?.createdAt.toISOString() ?? firstMentionedAt;

  // Trend: bucket mentions into the last 30 calendar days (UTC). Index
  // 0 = oldest day in the window, index 29 = today.
  const now = Date.now();
  const trend: number[] = Array.from({ length: TREND_DAYS }, () => 0);
  const windowStart = now - (TREND_DAYS - 1) * DAY_MS;
  for (const m of mentions) {
    const t = m.createdAt.getTime();
    if (t < windowStart) continue;
    const dayIdx = Math.floor((t - windowStart) / DAY_MS);
    const clamped = Math.max(0, Math.min(TREND_DAYS - 1, dayIdx));
    trend[clamped] += 1;
  }

  // Related themes — other themes that appear on the same entries.
  // One query for entryIds → one query for all their mentions grouped
  // by themeId. Top 5 by co-occurrence count (exclude self).
  const entryIds = Array.from(new Set(mentions.map((m) => m.entryId)));
  const related: Array<{ id: string; name: string; count: number }> = [];
  if (entryIds.length > 0) {
    const coMentions = await prisma.themeMention.findMany({
      where: {
        entryId: { in: entryIds },
        themeId: { not: theme.id },
      },
      select: {
        themeId: true,
        theme: { select: { id: true, name: true, userId: true } },
      },
    });
    const byId = new Map<string, { name: string; count: number }>();
    for (const cm of coMentions) {
      if (cm.theme.userId !== userId) continue;
      const prev = byId.get(cm.theme.id);
      if (prev) prev.count += 1;
      else byId.set(cm.theme.id, { name: cm.theme.name, count: 1 });
    }
    for (const [id, v] of byId.entries()) {
      related.push({ id, name: v.name, count: v.count });
    }
    related.sort((a, b) => b.count - a.count);
  }

  return NextResponse.json({
    theme: {
      id: theme.id,
      name: theme.name,
      sentimentBand,
      mentionCount,
      firstMentionedAt,
      lastMentionedAt,
    },
    trend,
    mentions: mentions.slice(0, 50).map((m) => ({
      entryId: m.entry.id,
      summary: m.entry.summary,
      mood: m.entry.mood,
      sentiment: m.sentiment,
      createdAt: m.createdAt.toISOString(),
    })),
    relatedThemes: related.slice(0, 5),
    // TODO: plug in real AI analysis. For now a terse placeholder
    // derived from the sentiment band + mention cadence — honest
    // enough to not mislead, sparse enough not to feel AI-fabricated.
    aiInsight:
      mentions.length === 0
        ? null
        : placeholderInsight(mentions.length, sentimentBand, trend),
  });
}

function placeholderInsight(
  mentionCount: number,
  band: SentimentBand,
  trend: number[]
): string {
  const recent = trend.slice(-7).reduce((a, b) => a + b, 0);
  const prior = trend.slice(0, -7).reduce((a, b) => a + b, 0);
  const trendWord =
    recent > prior ? "picking up" : recent < prior ? "tapering" : "steady";
  const bandWord =
    band === "challenging"
      ? "usually carrying some weight"
      : band === "positive"
        ? "mostly a positive thread"
        : "fairly neutral in tone";
  return `${mentionCount} mention${
    mentionCount === 1 ? "" : "s"
  } so far, ${bandWord}, ${trendWord} this week.`;
}
