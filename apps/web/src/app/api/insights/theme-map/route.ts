/**
 * GET /api/insights/theme-map
 *
 * Query:
 *   window   — 'week' | 'month' | '3months' | '6months' | 'year' | 'all'
 *              default: 'month'
 *   snapshot — ISO date string, optional. Scrubs the time-range further
 *              to createdAt <= snapshot, so the client slider can
 *              replay the graph at a past moment inside the window.
 *
 * Response shape:
 *   themes[]           — one per distinct theme in the window, sorted
 *                        by mentionCount desc. Capped to the top 50.
 *   coOccurrences[]    — theme-pair counts when both themes appeared
 *                        in the same entry. Symmetric-deduped
 *                        (theme1Id < theme2Id) so each pair shows once.
 *   meta               — windowStart, windowEnd, totalEntries,
 *                        snapshotAt.
 *
 * Caching: Cache-Control private, max-age=300 — 5 min is enough for
 * the force-graph to feel responsive while still updating after a new
 * recording lands. No server-side cache (per-user data rules out
 * shared CDN caching).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS: Record<string, number | null> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  "3months": 90 * 24 * 60 * 60 * 1000,
  "6months": 180 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
  all: null, // no lower bound
};

// Max nodes to return. Force-graph readability degrades sharply past
// ~50 nodes on a mobile-sized canvas; the long tail is mostly
// single-mention themes the user doesn't need to see at-a-glance.
const MAX_THEMES = 50;

const QuerySchema = z.object({
  window: z
    .enum(["week", "month", "3months", "6months", "year", "all"])
    .default("month"),
  snapshot: z
    .string()
    .datetime({ offset: true })
    .optional(),
});

const SENTIMENT_TO_SCORE: Record<string, number> = {
  POSITIVE: 1,
  NEUTRAL: 0,
  NEGATIVE: -1,
};

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse({
    window: req.nextUrl.searchParams.get("window") ?? undefined,
    snapshot: req.nextUrl.searchParams.get("snapshot") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query params", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { window: windowKey, snapshot } = parsed.data;

  const now = new Date();
  const windowSpan = WINDOW_MS[windowKey];
  const windowStart =
    windowSpan === null ? null : new Date(now.getTime() - windowSpan);
  const windowEnd = snapshot ? new Date(snapshot) : now;

  // Defend against the snapshot being AFTER now — clamp. This
  // also clamps a snapshot older than windowStart (we treat it as
  // "all data up through this moment, but still inside the window").
  const effectiveEnd = windowEnd > now ? now : windowEnd;

  const { prisma } = await import("@/lib/prisma");

  // Pull mentions with their theme + entry ids. We don't need the
  // entry's full summary yet — that's lazy-loaded into the detail
  // panel via the recentEntries projection below.
  const mentionsFilter: {
    theme: { userId: string };
    createdAt: { gte?: Date; lte: Date };
  } = {
    theme: { userId },
    createdAt: { lte: effectiveEnd },
  };
  if (windowStart) {
    mentionsFilter.createdAt.gte = windowStart;
  }

  const mentions = await prisma.themeMention.findMany({
    where: mentionsFilter,
    select: {
      themeId: true,
      entryId: true,
      sentiment: true,
      createdAt: true,
      theme: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (mentions.length === 0) {
    return NextResponse.json(
      {
        themes: [],
        coOccurrences: [],
        meta: {
          windowStart: windowStart?.toISOString() ?? null,
          windowEnd: effectiveEnd.toISOString(),
          totalEntries: 0,
          snapshotAt: snapshot ?? null,
        },
      },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  }

  // ── Aggregate per theme ──────────────────────────────────────────
  type ThemeAgg = {
    id: string;
    name: string;
    mentionCount: number;
    sentimentSum: number;
    firstMentionedAt: Date;
    lastMentionedAt: Date;
    entryIds: Set<string>;
  };
  const byTheme = new Map<string, ThemeAgg>();
  const entryIdSet = new Set<string>();

  // entryId → Set<themeId> so we can compute co-occurrences without an
  // extra DB query. Only themes that win the top-MAX_THEMES cut
  // contribute to the final coOccurrences list.
  const entryToThemes = new Map<string, Set<string>>();

  for (const m of mentions) {
    entryIdSet.add(m.entryId);
    const existing = byTheme.get(m.themeId);
    const score = SENTIMENT_TO_SCORE[m.sentiment] ?? 0;
    if (existing) {
      existing.mentionCount += 1;
      existing.sentimentSum += score;
      if (m.createdAt < existing.firstMentionedAt) {
        existing.firstMentionedAt = m.createdAt;
      }
      if (m.createdAt > existing.lastMentionedAt) {
        existing.lastMentionedAt = m.createdAt;
      }
      existing.entryIds.add(m.entryId);
    } else {
      byTheme.set(m.themeId, {
        id: m.theme.id,
        name: m.theme.name,
        mentionCount: 1,
        sentimentSum: score,
        firstMentionedAt: m.createdAt,
        lastMentionedAt: m.createdAt,
        entryIds: new Set([m.entryId]),
      });
    }

    let entryThemeSet = entryToThemes.get(m.entryId);
    if (!entryThemeSet) {
      entryThemeSet = new Set<string>();
      entryToThemes.set(m.entryId, entryThemeSet);
    }
    entryThemeSet.add(m.themeId);
  }

  // Top-N by mention count. Ties broken by recency (most recently
  // mentioned first) so the long tail of 1-mention themes doesn't
  // win the tiebreaker arbitrarily.
  const topThemes = Array.from(byTheme.values())
    .sort((a, b) => {
      if (b.mentionCount !== a.mentionCount) {
        return b.mentionCount - a.mentionCount;
      }
      return b.lastMentionedAt.getTime() - a.lastMentionedAt.getTime();
    })
    .slice(0, MAX_THEMES);
  const topThemeIds = new Set(topThemes.map((t) => t.id));

  // ── Co-occurrences (top-themes × top-themes only) ────────────────
  type Pair = { theme1Id: string; theme2Id: string; count: number };
  const pairMap = new Map<string, Pair>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const themeSet of entryToThemes.values()) {
    const ids = Array.from(themeSet).filter((id) => topThemeIds.has(id));
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const k = pairKey(ids[i], ids[j]);
        const existing = pairMap.get(k);
        if (existing) {
          existing.count += 1;
        } else {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]];
          pairMap.set(k, { theme1Id: a, theme2Id: b, count: 1 });
        }
      }
    }
  }

  const coOccurrences = Array.from(pairMap.values()).sort(
    (a, b) => b.count - a.count
  );

  // ── Recent entries projection (top 5 per theme) ──────────────────
  // Pull only the entry rows we need — top-themes' unique entryIds.
  const recentEntryIds = new Set<string>();
  for (const theme of topThemes) {
    // Cap per-theme to the 5 most recent to keep the payload small.
    // Walking the theme's entry set in mention-desc order would need
    // an ordered structure; easier to re-derive via a recent-first
    // scan of the mentions array.
    const seen: string[] = [];
    for (const m of mentions) {
      if (m.themeId !== theme.id) continue;
      if (seen.includes(m.entryId)) continue;
      seen.push(m.entryId);
      recentEntryIds.add(m.entryId);
      if (seen.length >= 5) break;
    }
  }

  const entryRows = await prisma.entry.findMany({
    where: {
      id: { in: Array.from(recentEntryIds) },
      userId,
    },
    select: {
      id: true,
      createdAt: true,
      transcript: true,
      summary: true,
    },
  });
  const entryMap = new Map(entryRows.map((e) => [e.id, e]));

  // Build the per-theme recentEntries list. Attach the sentiment of
  // the specific mention that bridged theme↔entry (not the entry's
  // overall sentiment).
  const themes = topThemes.map((t) => {
    const perEntry = new Map<
      string,
      {
        id: string;
        createdAt: string;
        sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
        excerpt: string;
      }
    >();
    for (const m of mentions) {
      if (m.themeId !== t.id) continue;
      if (perEntry.has(m.entryId)) continue;
      const entry = entryMap.get(m.entryId);
      if (!entry) continue;
      const raw = entry.summary ?? entry.transcript ?? "";
      const excerpt = raw.length > 200 ? `${raw.slice(0, 200).trim()}…` : raw;
      perEntry.set(m.entryId, {
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        sentiment: (m.sentiment === "POSITIVE" ||
        m.sentiment === "NEGATIVE"
          ? m.sentiment
          : "NEUTRAL") as "POSITIVE" | "NEUTRAL" | "NEGATIVE",
        excerpt,
      });
      if (perEntry.size >= 5) break;
    }
    const avgSentiment =
      t.mentionCount > 0 ? t.sentimentSum / t.mentionCount : 0;
    return {
      id: t.id,
      name: t.name,
      mentionCount: t.mentionCount,
      avgSentiment,
      firstMentionedAt: t.firstMentionedAt.toISOString(),
      lastMentionedAt: t.lastMentionedAt.toISOString(),
      recentEntries: Array.from(perEntry.values()),
    };
  });

  return NextResponse.json(
    {
      themes,
      coOccurrences,
      meta: {
        windowStart: windowStart?.toISOString() ?? null,
        windowEnd: effectiveEnd.toISOString(),
        totalEntries: entryIdSet.size,
        snapshotAt: snapshot ?? null,
      },
    },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
