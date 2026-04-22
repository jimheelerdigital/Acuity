/**
 * GET /api/lifemap/dimension/[key]
 *
 * Rich drill-down for a single Life Matrix dimension. Returns score,
 * trajectory sparkline data, Claude-synthesized "what's driving this",
 * top themes, recent entries, related goals, and a reflection prompt.
 *
 * [key] is the lowercase dimension key from DEFAULT_LIFE_AREAS ("career",
 * "health", "relationships", "finances", "personal", "other"). The
 * enum form ("CAREER", etc.) is used internally for DB lookups against
 * LifeMapArea.area and Goal.lifeArea.
 *
 * Cached per-user per-dimension for 1 hour via the in-memory
 * `getCached` helper. Claude calls are the expensive part — at ~2
 * calls per uncached request, the cache pays for itself quickly.
 *
 * Rate-limited per-user using the `expensiveAi` bucket (10/hour) since
 * the uncached path fires a Claude call. The 1-hour cache means most
 * requests don't touch Claude and don't count against this budget in
 * practice — the limiter is there to prevent cache-busting abuse.
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { CLAUDE_MAX_TOKENS, CLAUDE_MODEL, DEFAULT_LIFE_AREAS } from "@acuity/shared";

import { getCached } from "@/lib/admin-cache";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type LifeAreaMention = {
  mentioned?: boolean;
  score?: number;
};

type RawAnalysis = {
  lifeAreaMentions?: Record<string, LifeAreaMention>;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { key: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const areaConfig = DEFAULT_LIFE_AREAS.find((a) => a.key === params.key);
  if (!areaConfig) {
    return NextResponse.json(
      { error: "Unknown dimension" },
      { status: 404 }
    );
  }

  // Rate limit is `expensiveAi` (10/hour) since the uncached path
  // fires a Claude call. Cached hits still count against the bucket —
  // 10 opens per hour per user is a high ceiling for a drill-down view
  // and keeps the guard simple.
  const limited = await enforceUserRateLimit("expensiveAi", userId);
  if (limited) return limited;

  const cacheKey = `lifemap:dim:${userId}:${areaConfig.key}`;

  const { data, cached, computedAt } = await getCached(
    cacheKey,
    CACHE_TTL_MS,
    () => computeDimensionDetail(userId, areaConfig)
  );

  return NextResponse.json({
    ...data,
    _meta: { cached, computedAt },
  });
}

async function computeDimensionDetail(
  userId: string,
  areaConfig: (typeof DEFAULT_LIFE_AREAS)[number]
) {
  const { prisma } = await import("@/lib/prisma");

  // LifeMapArea (pre-computed score, baseline, top themes)
  const areaRow = await prisma.lifeMapArea.findFirst({
    where: { userId, area: areaConfig.enum },
  });

  const score = areaRow ? areaRow.score * 10 : 0;
  const baseline = areaRow?.baselineScore ?? 50;
  const change = score - baseline;

  // Last 30 days of entries that mention this dimension — used for
  // trajectory sparkline, recent entries, and Claude context.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const allEntries = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      entryDate: { gte: thirtyDaysAgo },
    },
    orderBy: { entryDate: "asc" },
    select: {
      id: true,
      createdAt: true,
      entryDate: true,
      mood: true,
      transcript: true,
      summary: true,
      themes: true,
      rawAnalysis: true,
    },
  });

  const dimensionEntries = allEntries.filter((e) => {
    const raw = e.rawAnalysis as RawAnalysis | null;
    return raw?.lifeAreaMentions?.[areaConfig.key]?.mentioned === true;
  });

  // Trajectory — one { date, score } point per day the dimension was
  // mentioned, averaged if multiple entries land on the same day.
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const e of dimensionEntries) {
    const raw = e.rawAnalysis as RawAnalysis | null;
    const s = raw?.lifeAreaMentions?.[areaConfig.key]?.score;
    if (typeof s !== "number") continue;
    const day = e.entryDate.toISOString().split("T")[0];
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += s * 10; // convert 0-10 to 0-100 scale
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  const trajectory = Array.from(byDay.entries())
    .map(([date, { sum, count }]) => ({
      date,
      score: Math.round(sum / count),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top themes — use the pre-computed LifeMapArea.topThemes for speed.
  // Sentiment comes from recent ThemeMention rows for entries that
  // mention this dimension. If a theme has multiple sentiments across
  // mentions, pick the most recent.
  const topThemeLabels = (areaRow?.topThemes ?? []).slice(0, 5);
  // Theme model's human-readable label field is `name` (schema.prisma:752).
  const themeMentionRows =
    topThemeLabels.length > 0
      ? await prisma.themeMention.findMany({
          where: {
            entry: { userId },
            theme: { name: { in: topThemeLabels } },
          },
          orderBy: { createdAt: "desc" },
          take: 60,
          select: {
            sentiment: true,
            theme: { select: { name: true } },
          },
        })
      : [];
  const sentimentByTheme = new Map<string, string>();
  const countByTheme = new Map<string, number>();
  for (const m of themeMentionRows) {
    const label = m.theme.name;
    if (!sentimentByTheme.has(label)) sentimentByTheme.set(label, m.sentiment);
    countByTheme.set(label, (countByTheme.get(label) ?? 0) + 1);
  }
  const topThemes = topThemeLabels.map((label) => ({
    theme: label,
    count: countByTheme.get(label) ?? 0,
    sentiment: sentimentByTheme.get(label) ?? "NEUTRAL",
  }));

  // Recent entries mentioning this dimension — top 5 most recent.
  const recentEntries = dimensionEntries
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      createdAt: e.createdAt.toISOString(),
      mood: e.mood,
      excerpt: excerptFor(e.transcript, e.summary),
    }));

  // Related goals — Goal.lifeArea matches this dimension's enum.
  const relatedGoals = await prisma.goal.findMany({
    where: {
      userId,
      lifeArea: areaConfig.enum,
      status: { not: "ARCHIVED" },
    },
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // Claude synthesis — single call returning both drivingSummary and
  // reflectionPrompt in one JSON payload to avoid paying for two
  // round-trips. Only runs when we have enough signal (>= 2 recent
  // entries for this dimension); otherwise we return deterministic
  // fallback copy so an empty-dimension view still loads cleanly.
  let whatsDriving: string;
  let reflectionPrompt: string;

  if (recentEntries.length >= 2) {
    const synthesis = await synthesizeWithClaude(
      areaConfig,
      score,
      change,
      dimensionEntries.slice(-6) // last 6 most-recent mentions
    );
    whatsDriving = synthesis.whatsDriving;
    reflectionPrompt = synthesis.reflectionPrompt;
  } else {
    whatsDriving =
      recentEntries.length === 0
        ? `Not much ${areaConfig.name} signal in your recent entries yet — record a session that touches on this area and we'll have more to say.`
        : `You've mentioned ${areaConfig.name} recently, but we need a couple more data points to spot a real pattern.`;
    reflectionPrompt = defaultPromptFor(areaConfig);
  }

  return {
    dimension: {
      key: areaConfig.key,
      name: areaConfig.name,
      enum: areaConfig.enum,
      icon: areaConfig.icon,
      color: areaConfig.color,
    },
    score,
    baseline,
    change,
    trajectory,
    whatsDriving,
    topThemes,
    recentEntries,
    relatedGoals,
    reflectionPrompt,
  };
}

/**
 * Pull the first ~80 chars of an entry's transcript, preferring the
 * AI-generated `summary` when available since it's already compacted.
 */
function excerptFor(transcript: string | null, summary: string | null) {
  const src = summary && summary.length > 0 ? summary : (transcript ?? "");
  if (src.length <= 80) return src;
  return src.slice(0, 80).trimEnd() + "…";
}

/**
 * Fallback reflection prompts when there isn't enough signal to ask
 * Claude for a personalized one. Keeps the "Worth reflecting on" card
 * from rendering empty on brand-new dimension views.
 */
function defaultPromptFor(areaConfig: (typeof DEFAULT_LIFE_AREAS)[number]) {
  const prompts: Record<string, string> = {
    career: "What does a good day at work look like for you right now?",
    health:
      "How has your body been talking to you this week — energy, sleep, appetite?",
    relationships:
      "Who's been on your mind the most this week, and what's driving that?",
    finances:
      "What's one financial decision you've been putting off, and what's the hesitation?",
    personal:
      "What's one small thing that made you feel more like yourself recently?",
    other: "What's something you've been curious about but haven't named yet?",
  };
  return prompts[areaConfig.key] ?? prompts.other;
}

async function synthesizeWithClaude(
  areaConfig: (typeof DEFAULT_LIFE_AREAS)[number],
  score: number,
  change: number,
  entries: Array<{
    entryDate: Date;
    summary: string | null;
    transcript: string | null;
  }>
) {
  // Compact excerpts — Claude doesn't need full transcripts, just
  // enough signal to spot the pattern. Hard-cap each entry to 400
  // chars, full call to ~2.5k chars of entry content.
  const corpus = entries
    .map((e) => {
      const src = e.summary ?? e.transcript ?? "";
      const snippet = src.length > 400 ? src.slice(0, 400) + "…" : src;
      const d = e.entryDate.toISOString().split("T")[0];
      return `[${d}] ${snippet}`;
    })
    .join("\n\n");

  const trendWord =
    change > 5 ? "rising" : change < -5 ? "falling" : "steady";

  const systemPrompt = `You are reflecting back to a user about ONE specific area of their life based on their recent journaling. Tone: warm, observational, non-prescriptive. You're a thoughtful friend who's read their entries, not a coach with advice. Never use therapeutic jargon. Never use the word "journey". Never promise outcomes. Return JSON only — no prose wrapper.`;

  const userPrompt = `Life area: ${areaConfig.name}
Current score: ${score}/100 (${trendWord} vs baseline)

Recent entries mentioning ${areaConfig.name}:

${corpus}

Return JSON with two fields:
- "whatsDriving": 2-3 sentences naming the specific pattern you see in these entries that's shaping the ${areaConfig.name} score. Reference concrete details from the entries. Observational, not prescriptive.
- "reflectionPrompt": 1 sentence. A specific, open question this user could record about ${areaConfig.name} tomorrow — anchored to the pattern you just named. Not generic advice.

Return only the JSON object, no markdown fences.`;

  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: Math.min(CLAUDE_MAX_TOKENS, 800),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = res.content[0].type === "text" ? res.content[0].text : "";
  const jsonText = raw
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  try {
    const parsed = JSON.parse(jsonText) as {
      whatsDriving?: unknown;
      reflectionPrompt?: unknown;
    };
    return {
      whatsDriving:
        typeof parsed.whatsDriving === "string"
          ? parsed.whatsDriving
          : defaultDrivingFor(areaConfig, trendWord),
      reflectionPrompt:
        typeof parsed.reflectionPrompt === "string"
          ? parsed.reflectionPrompt
          : defaultPromptFor(areaConfig),
    };
  } catch {
    return {
      whatsDriving: defaultDrivingFor(areaConfig, trendWord),
      reflectionPrompt: defaultPromptFor(areaConfig),
    };
  }
}

function defaultDrivingFor(
  areaConfig: (typeof DEFAULT_LIFE_AREAS)[number],
  trendWord: string
) {
  return `${areaConfig.name} has been ${trendWord} across your recent entries. Record another session about it and we'll have a sharper read next time.`;
}
