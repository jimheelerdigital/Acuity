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

import { gateFeatureFlag } from "@/lib/feature-flags";
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
  const gated = await gateFeatureFlag(userId, "theme_evolution_map");
  if (gated) return gated;

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

  // Pull EVERY entry across the window (not just recentEntryIds) so we
  // can build per-theme entries-with-mood for the v2 wave shape. Bounded
  // by the active window, capped client-side at 30 per theme below.
  const entryRows = await prisma.entry.findMany({
    where: {
      id: { in: Array.from(entryIdSet) },
      userId,
    },
    select: {
      id: true,
      createdAt: true,
      transcript: true,
      summary: true,
      moodScore: true,
    },
  });
  const entryMap = new Map(entryRows.map((e) => [e.id, e]));

  // ── Per-theme sparkline (last 30 days, daily buckets) ────────────
  // Even when the window filter is shorter or longer, we render the
  // card sparkline over a fixed 30-day window so visual comparison
  // across themes stays meaningful.
  const SPARKLINE_DAYS = 30;
  const sparklineStart = new Date(
    now.getTime() - SPARKLINE_DAYS * 24 * 60 * 60 * 1000
  );
  sparklineStart.setHours(0, 0, 0, 0);

  const sparklineByTheme = new Map<string, number[]>();
  for (const theme of topThemes) {
    sparklineByTheme.set(theme.id, new Array(SPARKLINE_DAYS).fill(0));
  }
  for (const m of mentions) {
    if (!topThemeIds.has(m.themeId)) continue;
    if (m.createdAt < sparklineStart) continue;
    const dayIdx = Math.floor(
      (m.createdAt.getTime() - sparklineStart.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    if (dayIdx < 0 || dayIdx >= SPARKLINE_DAYS) continue;
    const bucket = sparklineByTheme.get(m.themeId);
    if (bucket) bucket[dayIdx] += 1;
  }

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

    // Sentiment band for the redesigned cards. Threshold picked so
    // mostly-neutral themes don't drift positive/challenging on a
    // single stray mention. ≥ +0.33 positive / ≤ -0.33 challenging.
    const sentimentBand: "positive" | "neutral" | "challenging" =
      avgSentiment >= 0.33
        ? "positive"
        : avgSentiment <= -0.33
          ? "challenging"
          : "neutral";

    const sparkline = sparklineByTheme.get(t.id) ?? [];
    const firstMentionedDaysAgo = Math.max(
      0,
      Math.floor(
        (now.getTime() - t.firstMentionedAt.getTime()) /
          (24 * 60 * 60 * 1000)
      )
    );
    const trendDescription = deriveTrendDescription(
      sparkline,
      sentimentBand,
      t.mentionCount,
      firstMentionedDaysAgo
    );

    // ── v2 — per-theme entries-with-mood for ThemeMoodWaveRow ────────
    // Last 30 entries (within the active window) ordered ascending by
    // timestamp. Mood is Entry.moodScore (1-10); null gets coerced to 5
    // (neutral baseline) so every entry has a defined y-position.
    const themeEntriesAsc: { id: string; timestamp: string; mood: number }[] = [];
    for (const m of mentions) {
      if (m.themeId !== t.id) continue;
      if (themeEntriesAsc.find((e) => e.id === m.entryId)) continue;
      const entry = entryMap.get(m.entryId);
      if (!entry) continue;
      themeEntriesAsc.push({
        id: entry.id,
        timestamp: entry.createdAt.toISOString(),
        mood: typeof entry.moodScore === "number" ? entry.moodScore : 5,
      });
      if (themeEntriesAsc.length >= 30) break;
    }
    // mentions came in desc order; flip to asc for the wave x-axis.
    themeEntriesAsc.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // ── meanMood across all entries-with-mood for this theme ─────────
    const moodSamples = themeEntriesAsc
      .map((e) => e.mood)
      .filter((m) => Number.isFinite(m));
    const meanMood =
      moodSamples.length > 0
        ? moodSamples.reduce((a, b) => a + b, 0) / moodSamples.length
        : 5;

    // ── per-theme coOccurrences (top 5) ──────────────────────────────
    const themeCoOcc: { themeName: string; count: number }[] = [];
    for (const pair of pairMap.values()) {
      if (pair.theme1Id !== t.id && pair.theme2Id !== t.id) continue;
      const otherId = pair.theme1Id === t.id ? pair.theme2Id : pair.theme1Id;
      const other = byTheme.get(otherId);
      if (!other) continue;
      themeCoOcc.push({ themeName: other.name, count: pair.count });
    }
    themeCoOcc.sort((a, b) => b.count - a.count);
    const coOccurrences = themeCoOcc.slice(0, 5);

    // ── category (heuristic from name keywords) ──────────────────────
    const category = categorizeTheme(t.name);

    // ── trend vs prior period ────────────────────────────────────────
    // Prior period count = mentions in [windowStart - span, windowStart).
    // For "all time" or no windowStart, use 0 (everything is current).
    let priorPeriodCount = 0;
    if (windowStart && windowSpan) {
      const priorStart = new Date(windowStart.getTime() - windowSpan);
      for (const m of mentions) {
        if (m.themeId !== t.id) continue;
        if (m.createdAt < priorStart) continue;
        if (m.createdAt >= windowStart) continue;
        priorPeriodCount += 1;
      }
    }
    const trendRatio =
      priorPeriodCount > 0 ? t.mentionCount / priorPeriodCount : null;

    return {
      id: t.id,
      name: t.name,
      category,
      mentionCount: t.mentionCount,
      meanMood,
      avgSentiment,
      sentimentBand,
      firstMentionedAt: t.firstMentionedAt.toISOString(),
      lastMentionedAt: t.lastMentionedAt.toISOString(),
      lastEntryAt: t.lastMentionedAt.toISOString(),
      firstMentionedDaysAgo,
      sparkline,
      trendDescription,
      trend: { priorPeriodCount, ratio: trendRatio },
      entries: themeEntriesAsc,
      coOccurrences,
      recentEntries: Array.from(perEntry.values()),
    };
  });

  const totalMentions = mentions.length;
  const topTheme = themes.length > 0 ? themes[0].name : null;
  const topThemeName = topTheme;

  // ── periods block for ThemeRings hero ──────────────────────────────
  // Three nested time windows on the TOP theme's mentions: today, week,
  // month. mood = mean Entry.moodScore across those entries.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now.getTime() - 7 * ONE_DAY_MS);
  const monthStart = new Date(now.getTime() - 30 * ONE_DAY_MS);

  function periodStats(start: Date): { count: number; mood: number } {
    if (themes.length === 0) return { count: 0, mood: 5 };
    const top = topThemes[0];
    let count = 0;
    const moods: number[] = [];
    const seenEntries = new Set<string>();
    for (const m of mentions) {
      if (m.themeId !== top.id) continue;
      if (m.createdAt < start) continue;
      if (m.createdAt > effectiveEnd) continue;
      if (seenEntries.has(m.entryId)) continue;
      seenEntries.add(m.entryId);
      count += 1;
      const entry = entryMap.get(m.entryId);
      if (entry?.moodScore != null) moods.push(entry.moodScore);
    }
    const mood =
      moods.length > 0 ? moods.reduce((a, b) => a + b, 0) / moods.length : 5;
    return { count, mood };
  }

  const periods = {
    today: periodStats(todayStart),
    week: periodStats(weekStart),
    month: periodStats(monthStart),
  };

  const periodLabel =
    windowKey === "week"
      ? "Last week"
      : windowKey === "month"
        ? "Last month"
        : windowKey === "3months"
          ? "3 months"
          : windowKey === "6months"
            ? "6 months"
            : windowKey === "year"
              ? "Last year"
              : "All time";

  return NextResponse.json(
    {
      themes,
      coOccurrences,
      totalMentions,
      topTheme,
      topThemeName,
      periodLabel,
      periods,
      meta: {
        windowStart: windowStart?.toISOString() ?? null,
        windowEnd: effectiveEnd.toISOString(),
        totalEntries: entryIdSet.size,
        snapshotAt: snapshot ?? null,
      },
    },
    { headers: { "Cache-Control": "private, max-age=60" } }
  );
}

/**
 * Heuristic categorisation of theme names into one of the four UI
 * vocabulary buckets. Pure keyword match — fragile but bounded.
 * Promotes to a real Theme.category column once the user manually
 * recategorises enough themes that the heuristic feels noisy.
 */
function categorizeTheme(
  name: string
): "activity" | "reflection" | "life" | "emotional" {
  const n = name.toLowerCase();
  const ACTIVITY = [
    "golf", "run", "running", "workout", "gym", "lift", "yoga", "swim",
    "bike", "cycling", "practice", "training", "mechanics", "exercise",
    "sport", "tennis", "ski", "climb", "hike",
  ];
  const REFLECTION = [
    "self", "patience", "reading", "writing", "journal", "meditate",
    "meditation", "reflection", "growth", "learning", "awareness",
    "mindful", "discipline", "focus", "purpose", "values",
  ];
  const LIFE = [
    "family", "sleep", "kids", "partner", "marriage", "spouse",
    "friend", "home", "house", "money", "finance", "career", "work",
    "job", "travel", "food", "diet", "weight", "health",
  ];
  const EMOTIONAL = [
    "stress", "anxiety", "frustration", "anger", "sad", "fear",
    "lonely", "overwhelm", "burnout", "tired", "exhausted", "worry",
    "doubt", "shame", "guilt", "grief",
  ];
  if (EMOTIONAL.some((k) => n.includes(k))) return "emotional";
  if (ACTIVITY.some((k) => n.includes(k))) return "activity";
  if (REFLECTION.some((k) => n.includes(k))) return "reflection";
  if (LIFE.some((k) => n.includes(k))) return "life";
  return "reflection";
}

/**
 * Short human-readable trend label for a theme card. Rules (in order):
 *   - First mention <7 days ago → "New theme"
 *   - <3 mentions with uptick in the last 7d bucket → "Emerging ↑"
 *   - Mostly positive sentiment and recent >= older → "Steadily positive"
 *   - Last-7 count > first-7 count by ≥50% → "Trending up"
 *   - Last-7 count < first-7 count → "Declining"
 *   - High variance across the 30 days → "Fluctuating"
 *   - Default → "Steady"
 */
function deriveTrendDescription(
  sparkline: number[],
  sentimentBand: "positive" | "neutral" | "challenging",
  mentionCount: number,
  firstMentionedDaysAgo: number
): string {
  if (firstMentionedDaysAgo < 7) return "New theme";

  const n = sparkline.length;
  if (n === 0) return "Steady";

  const firstHalf = sparkline.slice(0, Math.floor(n / 2));
  const lastHalf = sparkline.slice(Math.floor(n / 2));
  const firstSum = firstHalf.reduce((a, b) => a + b, 0);
  const lastSum = lastHalf.reduce((a, b) => a + b, 0);

  if (mentionCount < 3 && lastSum > 0 && lastSum >= firstSum) {
    return "Emerging ↑";
  }
  if (sentimentBand === "positive" && lastSum >= firstSum) {
    return "Steadily positive";
  }
  if (firstSum > 0 && lastSum >= firstSum * 1.5) return "Trending up";
  if (firstSum > 0 && lastSum < firstSum) return "Declining";

  // Fluctuating detection — std-dev > mean when mean > 0.
  const mean = sparkline.reduce((a, b) => a + b, 0) / n;
  if (mean > 0) {
    const variance =
      sparkline.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    if (Math.sqrt(variance) > mean) return "Fluctuating";
  }
  return "Steady";
}
