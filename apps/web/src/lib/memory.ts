/**
 * Acuity Memory Architecture
 *
 * Manages the compressed longitudinal memory store that powers the Life Matrix.
 * Each user has a UserMemory record that accumulates with every debrief,
 * giving Claude full context about the user's life patterns over time.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Entry, UserMemory } from "@prisma/client";
import {
  CLAUDE_MODEL,
  CLAUDE_MAX_TOKENS,
  DEFAULT_LIFE_AREAS,
  type ExtractionResult,
  type LifeAreaMentions,
  type LifeAreaKey,
} from "@acuity/shared";

import {
  buildCompressionPrompt,
  buildInsightPrompt,
} from "./prompts/lifemap";

// ─── Type helpers ────────────────────────────────────────────────────────────

type RecurringTheme = {
  area: string;
  theme: string;
  firstSeen: string;
  count: number;
  lastSeen: string;
};

type RecurringPerson = {
  name: string;
  area: string;
  sentiment: string;
  mentionCount: number;
};

type RecurringGoal = {
  goal: string;
  area: string;
  firstMentioned: string;
  status: string;
  mentionCount: number;
};

const AREA_KEYS: LifeAreaKey[] = [
  "career",
  "health",
  "relationships",
  "finances",
  "personal",
  "other",
];

// ─── Get or Create ───────────────────────────────────────────────────────────

export async function getOrCreateUserMemory(
  userId: string
): Promise<UserMemory> {
  const { prisma } = await import("@/lib/prisma");

  const existing = await prisma.userMemory.findUnique({ where: { userId } });
  if (existing) return existing;

  return prisma.userMemory.create({
    data: { userId },
  });
}

// ─── Update Memory After Each Entry ──────────────────────────────────────────

export async function updateUserMemory(
  userId: string,
  entry: Pick<Entry, "id" | "entryDate" | "themes">,
  extraction: ExtractionResult
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const memory = await getOrCreateUserMemory(userId);
  const mentions = extraction.lifeAreaMentions;
  const todayISO = new Date().toISOString();

  // Build incremental updates
  const mentionIncrements: Record<string, number> = {};
  const baselineUpdates: Record<string, number> = {};

  if (mentions) {
    for (const key of AREA_KEYS) {
      const m = mentions[key];
      if (m.mentioned) {
        mentionIncrements[`${key}Mentions`] = 1;
        // Slowly drift baseline toward current score (scaled to 0-100)
        const currentBaseline =
          memory[`${key}Baseline` as keyof UserMemory] as number;
        const newScore = m.score * 10; // 1-10 → 10-100
        const driftedBaseline = Math.round(
          currentBaseline * 0.95 + newScore * 0.05
        );
        baselineUpdates[`${key}Baseline`] = driftedBaseline;
      }
    }
  }

  // Update recurring themes
  const updatedThemes = updateRecurringThemes(
    memory.recurringThemes as unknown as RecurringTheme[],
    extraction.themes,
    mentions,
    todayISO
  );

  // Update recurring people
  const updatedPeople = updateRecurringPeople(
    memory.recurringPeople as unknown as RecurringPerson[],
    mentions,
    todayISO
  );

  // Update recurring goals
  const updatedGoals = updateRecurringGoals(
    memory.recurringGoals as unknown as RecurringGoal[],
    extraction.goals.map((g) => g.title),
    mentions,
    todayISO
  );

  await prisma.userMemory.update({
    where: { userId },
    data: {
      totalEntries: { increment: 1 },
      firstEntryDate: memory.firstEntryDate ?? entry.entryDate,
      recurringThemes: updatedThemes as any[],
      recurringPeople: updatedPeople as any[],
      recurringGoals: updatedGoals as any[],
      ...mentionIncrements,
      ...baselineUpdates,
    },
  });

  // Compress memory every 10 entries — dispatched via Inngest so the
  // Claude synthesis call doesn't block the recording-completion
  // response. Pre-2026-04-28 this awaited compressMemory inline and
  // added 5-20s to every 10th recording's response time. Audit item
  // #1 from the perf+polish pass.
  const newTotal = memory.totalEntries + 1;
  if (newTotal % 10 === 0) {
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "memory/compress",
        data: { userId },
      });
    } catch (err) {
      // Dispatch failure is non-fatal; the compression will run on
      // the next 10-multiple. Log so we notice if every dispatch is
      // failing (would suggest a broken Inngest config).
      console.error(
        "[memory] inngest dispatch for memory/compress failed (non-fatal):",
        err
      );
    }
  }
}

// ─── Compress Memory (AI-powered summarization) ─────────────────────────────

export async function compressMemory(userId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");

  const memory = await getOrCreateUserMemory(userId);

  const recentEntries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    orderBy: { entryDate: "desc" },
    take: 20,
    select: { summary: true, themes: true, mood: true, entryDate: true },
  });

  if (recentEntries.length === 0) return;

  const existingSummaries: Record<string, string | null> = {
    career: memory.careerSummary,
    health: memory.healthSummary,
    relationships: memory.relationshipsSummary,
    finances: memory.financesSummary,
    personal: memory.personalSummary,
    other: memory.otherSummary,
  };

  const { system, user } = buildCompressionPrompt(
    existingSummaries,
    recentEntries.map((e) => ({
      summary: e.summary ?? "",
      themes: e.themes,
      mood: e.mood ?? "NEUTRAL",
      entryDate: e.entryDate,
    }))
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonText) as Record<string, string>;

  await prisma.userMemory.update({
    where: { userId },
    data: {
      careerSummary: parsed.career || memory.careerSummary,
      healthSummary: parsed.health || memory.healthSummary,
      relationshipsSummary: parsed.relationships || memory.relationshipsSummary,
      financesSummary: parsed.finances || memory.financesSummary,
      personalSummary: parsed.personal || memory.personalSummary,
      otherSummary: parsed.other || memory.otherSummary,
      lastCompressed: new Date(),
    },
  });
}

// ─── Build Memory Context (for Claude prompts) ──────────────────────────────

export async function buildMemoryContext(userId: string): Promise<string> {
  const memory = await getOrCreateUserMemory(userId);

  if (memory.totalEntries === 0) return "";

  const summaries = AREA_KEYS.map((key) => {
    const summary =
      memory[`${key}Summary` as keyof UserMemory] as string | null;
    const mentions =
      memory[`${key}Mentions` as keyof UserMemory] as number;
    const baseline =
      memory[`${key}Baseline` as keyof UserMemory] as number;
    return `${key}: ${summary ?? "No data yet"} (${mentions} mentions, baseline ${baseline}/100)`;
  }).join("\n");

  const themes = (memory.recurringThemes as unknown as RecurringTheme[])
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((t) => `"${t.theme}" (${t.area}, ${t.count}x)`)
    .join(", ");

  const people = (memory.recurringPeople as unknown as RecurringPerson[])
    .filter((p) => p.mentionCount >= 2)
    .slice(0, 8)
    .map((p) => `${p.name} (${p.area}, ${p.sentiment}, ${p.mentionCount}x)`)
    .join(", ");

  const goals = (memory.recurringGoals as unknown as RecurringGoal[])
    .filter((g) => g.mentionCount >= 2)
    .slice(0, 8)
    .map((g) => `"${g.goal}" (${g.area}, ${g.status}, ${g.mentionCount}x)`)
    .join(", ");

  const daysSinceFirst = memory.firstEntryDate
    ? Math.floor(
        (Date.now() - memory.firstEntryDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  return [
    `User has ${memory.totalEntries} entries over ${daysSinceFirst} days.`,
    `\nArea summaries:\n${summaries}`,
    themes ? `\nRecurring themes: ${themes}` : "",
    people ? `\nKey people: ${people}` : "",
    goals ? `\nRecurring goals: ${goals}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Update Life Matrix Areas ───────────────────────────────────────────────────

export async function updateLifeMap(
  userId: string,
  mentions: LifeAreaMentions | undefined
): Promise<void> {
  if (!mentions) return;

  const { prisma } = await import("@/lib/prisma");
  const memory = await getOrCreateUserMemory(userId);

  // Get scores from 7 days ago for trend calculation
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  for (const areaConfig of DEFAULT_LIFE_AREAS) {
    const key = areaConfig.key as LifeAreaKey;
    const mention = mentions[key];
    if (!mention.mentioned) continue;

    const area = await prisma.lifeMapArea.findFirst({
      where: { userId, area: areaConfig.enum },
    });
    if (!area) continue;

    const newScore10 = mention.score; // 1-10
    const newScore100 = newScore10 * 10;
    const baseline = memory[`${key}Baseline` as keyof UserMemory] as number;

    // Weighted blend: 20% new, 50% recent (current score as proxy), 30% baseline
    const blended = Math.round(
      newScore100 * 0.2 + (area.score * 10) * 0.5 + baseline * 0.3
    );
    const finalScore = Math.max(1, Math.min(10, Math.round(blended / 10)));

    // Trend calculation
    const previousScore = area.score;
    const delta = finalScore - previousScore;
    const trend =
      delta > 0 ? "up" : delta < 0 ? "down" : "stable";

    // Update themes (merge, keep top 5)
    const existingThemes = area.topThemes ?? [];
    const mergedThemes = [...new Set([...mention.themes, ...existingThemes])].slice(0, 5);

    await prisma.lifeMapArea.update({
      where: { id: area.id },
      data: {
        score: finalScore,
        trend,
        weeklyDelta: delta,
        mentionCount: { increment: 1 },
        topThemes: mergedThemes,
        lastMentioned: new Date(),
        historicalHigh: Math.max(area.historicalHigh, finalScore * 10),
        historicalLow: Math.min(area.historicalLow, finalScore * 10),
      },
    });
  }
}

// ─── Generate Life Matrix Insights ──────────────────────────────────────────────

export async function generateLifeMapInsights(
  userId: string
): Promise<void> {
  const { prisma } = await import("@/lib/prisma");

  const memoryContext = await buildMemoryContext(userId);
  if (!memoryContext) return;

  const memory = await getOrCreateUserMemory(userId);
  const areas = await prisma.lifeMapArea.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  const daysSinceFirst = memory.firstEntryDate
    ? Math.floor(
        (Date.now() - memory.firstEntryDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;

  const { system, user } = buildInsightPrompt(
    memoryContext,
    areas.map((a) => ({
      area: a.area,
      score: a.score * 10,
      trend: a.trend,
      mentionCount: a.mentionCount,
    })),
    daysSinceFirst
  );

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: CLAUDE_MAX_TOKENS,
    system,
    messages: [{ role: "user", content: user }],
  });

  const rawText =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonText) as Record<string, string>;

  // Map insight keys to area names
  const keyToName: Record<string, string> = {};
  // Map prompt-key (lowercase, returned by Claude) → canonical enum
  // ("CAREER", "FINANCES", …) which is what LifeMapArea.area stores.
  const keyToEnum: Record<string, string> = {};
  for (const a of DEFAULT_LIFE_AREAS) {
    keyToEnum[a.key] = a.enum;
  }

  for (const [key, insight] of Object.entries(parsed)) {
    const areaEnum = keyToEnum[key];
    if (!areaEnum) continue;
    await prisma.lifeMapArea.updateMany({
      where: { userId, area: areaEnum },
      data: { insightSummary: insight },
    });
  }
}

// ─── Recurring pattern helpers ───────────────────────────────────────────────

function updateRecurringThemes(
  existing: RecurringTheme[],
  newThemes: string[],
  mentions: LifeAreaMentions | undefined,
  todayISO: string
): RecurringTheme[] {
  const map = new Map<string, RecurringTheme>();
  for (const t of existing) map.set(t.theme.toLowerCase(), t);

  for (const theme of newThemes) {
    const key = theme.toLowerCase();
    const area = mentions
      ? findAreaForTheme(theme, mentions)
      : "general";

    if (map.has(key)) {
      const entry = map.get(key)!;
      entry.count++;
      entry.lastSeen = todayISO;
    } else {
      map.set(key, {
        area,
        theme,
        firstSeen: todayISO,
        count: 1,
        lastSeen: todayISO,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

function updateRecurringPeople(
  existing: RecurringPerson[],
  mentions: LifeAreaMentions | undefined,
  _todayISO: string
): RecurringPerson[] {
  if (!mentions) return existing;

  const map = new Map<string, RecurringPerson>();
  for (const p of existing) map.set(p.name.toLowerCase(), p);

  for (const key of AREA_KEYS) {
    const m = mentions[key];
    if (!m.mentioned) continue;
    for (const name of m.people) {
      const lower = name.toLowerCase();
      if (map.has(lower)) {
        const entry = map.get(lower)!;
        entry.mentionCount++;
        entry.sentiment = m.sentiment;
      } else {
        map.set(lower, {
          name,
          area: key,
          sentiment: m.sentiment,
          mentionCount: 1,
        });
      }
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 30);
}

function updateRecurringGoals(
  existing: RecurringGoal[],
  newGoals: string[],
  mentions: LifeAreaMentions | undefined,
  todayISO: string
): RecurringGoal[] {
  const map = new Map<string, RecurringGoal>();
  for (const g of existing) map.set(g.goal.toLowerCase(), g);

  for (const goal of newGoals) {
    const key = goal.toLowerCase();
    const area = mentions
      ? findAreaForGoal(goal, mentions)
      : "general";

    if (map.has(key)) {
      const entry = map.get(key)!;
      entry.mentionCount++;
    } else {
      map.set(key, {
        goal,
        area,
        firstMentioned: todayISO,
        status: "active",
        mentionCount: 1,
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 30);
}

function findAreaForTheme(
  theme: string,
  mentions: LifeAreaMentions
): string {
  for (const key of AREA_KEYS) {
    if (
      mentions[key].mentioned &&
      mentions[key].themes.some(
        (t) => t.toLowerCase() === theme.toLowerCase()
      )
    ) {
      return key;
    }
  }
  return "general";
}

function findAreaForGoal(
  goal: string,
  mentions: LifeAreaMentions
): string {
  for (const key of AREA_KEYS) {
    if (
      mentions[key].mentioned &&
      mentions[key].goals.some(
        (g) => g.toLowerCase().includes(goal.toLowerCase().slice(0, 20))
      )
    ) {
      return key;
    }
  }
  return "general";
}
