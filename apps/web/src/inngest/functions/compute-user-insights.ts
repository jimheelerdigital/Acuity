/**
 * Weekly cron: compute user-level observations for the Insights page.
 *
 * Two-layer pipeline:
 *   1. Heuristic scanner gathers signals from the user's last 2 weeks
 *      of entries, Life Matrix history, themes, and streak data:
 *        • Life Matrix area deltas > 2 points week-over-week
 *        • Theme frequency changes > 2x week-over-week
 *        • Streak milestones (7 / 30 / 100)
 *        • Mood drift ≥ 1 band on the 5-band scale
 *   2. Claude Opus 4.7 transforms those numeric signals + a 14-day
 *      summary digest into 2-3 warm, specific observations in second
 *      person. Robotic inputs → human language.
 *
 * Claude failure mode: we fall back to the heuristic text with
 * generationModel="heuristic" so the user still gets SOMETHING in
 * the card. The UI doesn't need to distinguish — that's an
 * observability-only tag.
 *
 * Schedule: Sundays at 01:00 UTC — runs after the 00:05 Life Matrix
 * snapshot so week-over-week math has fresh history. Idempotent: the
 * (text, recent-cutoff) dedup prevents a retry from double-writing.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  CLAUDE_FLAGSHIP_MAX_TOKENS,
  CLAUDE_FLAGSHIP_MODEL,
} from "@acuity/shared";

import { inngest } from "@/inngest/client";
import { isEnabledForAnon } from "@/lib/feature-flags";
import { evidenceReceiptsEnabled } from "@/lib/evidence/flags";
import { selectExcerpt } from "@/lib/evidence/excerpt";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MOOD_ORDER: Record<string, number> = {
  ROUGH: 1,
  LOW: 2,
  NEUTRAL: 3,
  GOOD: 4,
  GREAT: 5,
};

// Phase D (2026-05-21): 10-axis canonical labels. Legacy V1 keys
// included for backward-compat reads of historical LifeMapArea rows
// that haven't yet been migrated by the SQL backfill.
const AREA_LABELS: Record<string, string> = {
  CAREER: "Career",
  MONEY: "Money",
  ROMANCE: "Romance",
  FAMILY: "Family",
  FRIENDS: "Friends & Community",
  PHYSICAL_HEALTH: "Physical Health",
  MENTAL_HEALTH: "Mental Health",
  GROWTH: "Growth & Learning",
  FUN: "Fun",
  PURPOSE: "Purpose & Meaning",
  // Legacy V1 fallback labels
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

type Severity = "POSITIVE" | "NEUTRAL" | "CONCERNING";

type Signal = {
  kind: "area_delta" | "theme_spike" | "streak_milestone" | "mood_drift";
  severity: Severity;
  heuristicText: string;
  linkedAreaId?: string | null;
  /** Short machine-readable facts Claude can reference. */
  context: Record<string, unknown>;
};

export function weekStartOf(d: Date): Date {
  const base = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  );
  base.setUTCDate(base.getUTCDate() - base.getUTCDay());
  return base;
}

const OBSERVATION_SYSTEM_PROMPT = `You are Ripple's weekly observer. Read the user's 14-day journaling context + the numeric signals below and return 2-3 observations as JSON.

Tone:
- Second person ("you"), warm, non-judgmental.
- Specific to this user's content. Never generic.
- Point to a pattern the user might not have noticed.
- Each observation ≤ 140 characters.
- DO NOT output diagnoses, prescriptions, or anything that reads like a therapist.

Shape:
{
  "observations": [
    { "text": "...", "severity": "POSITIVE" | "NEUTRAL" | "CONCERNING", "linkedAreaId": "CAREER" | "HEALTH" | "RELATIONSHIPS" | "FINANCES" | "PERSONAL" | "OTHER" | null }
  ]
}

Examples of good:
  "You mention your partner more in positive entries — worth noticing."
  "Your energy climbs on days you write about exercise. The link is real."
  "Three times this week you said 'I should' about the same thing. What would 'I want to' look like?"

Examples of bad (do not produce):
  "Your Health score dropped 2 points this week" — too mechanical
  "You need to prioritize self-care" — prescriptive
  "You seem depressed" — diagnostic

Return ONLY valid JSON — no markdown, no prose.`;

/**
 * Evidence-mode prompt (EVIDENCE_RECEIPTS). Same voice rules as above, plus
 * two hard requirements: every observation must cite the entries it came
 * from, and must self-report a confidence.
 *
 * The citation is by REFERENCE LABEL ([E1], [E2]) rather than by quote. The
 * model never sees transcripts — only the same summaries it sees today — so
 * asking it to quote would invite invention. It says WHICH entries support
 * the claim; the server then pulls the actual sentence out of stored text
 * (lib/evidence/excerpt.ts). Verbatim by construction, and no change to what
 * leaves our servers.
 *
 * An observation that cites nothing is not rejected here — it is written
 * with zero evidence rows and THE RULE suppresses it downstream. Rejecting
 * at generation time would hide how often the model reaches beyond its
 * evidence, which is exactly what we want to measure in observer mode.
 */
const EVIDENCE_SYSTEM_PROMPT = `You are Ripple's weekly observer. Read the user's 14-day journaling context + the numeric signals below and return 2-3 observations as JSON.

Tone:
- Second person ("you"), warm, non-judgmental.
- Specific to this user's content. Never generic.
- Point to a pattern the user might not have noticed.
- Each observation ≤ 140 characters.
- DO NOT output diagnoses, prescriptions, or anything that reads like a therapist.

EVIDENCE REQUIREMENTS (these are not optional):
- Each entry in the context is labelled [E1], [E2], … Cite the labels of the
  entries that directly support your observation in "sourceRefs".
- Only cite an entry if its content genuinely supports the claim. Citing an
  unrelated entry is worse than citing none.
- If you cannot point to at least one entry, return an empty "sourceRefs"
  array. Do NOT invent support. An uncited observation is expected and fine.
- "confidence" is your honest 0-1 estimate that this pattern is real, based
  only on what you can see.

Shape:
{
  "observations": [
    {
      "text": "...",
      "severity": "POSITIVE" | "NEUTRAL" | "CONCERNING",
      "linkedAreaId": "CAREER" | "HEALTH" | "RELATIONSHIPS" | "FINANCES" | "PERSONAL" | "OTHER" | null,
      "sourceRefs": ["E1", "E4"],
      "confidence": 0.0
    }
  ]
}

Return ONLY valid JSON — no markdown, no prose.`;

export const computeUserInsightsFn = inngest.createFunction(
  {
    id: "compute-user-insights",
    name: "Compute user insights (weekly)",
    triggers: [{ cron: "0 1 * * 0" }],
    retries: 2,
  },
  async ({ logger }) => {
    if (!(await isEnabledForAnon("claude_ai_observations"))) {
      logger.info("compute-user-insights.disabled_by_flag");
      return { skipped: "feature-flag-disabled" };
    }

    const { prisma } = await import("@/lib/prisma");

    const users = await prisma.user.findMany({
      where: { subscriptionStatus: { in: ["TRIAL", "ACTIVE", "PRO"] } },
      select: { id: true, timezone: true },
    });

    logger.info(`computing insights for ${users.length} users`);

    const now = new Date();
    const thisWeekStart = weekStartOf(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    const twoWeeksAgo = new Date(lastWeekStart);
    twoWeeksAgo.setUTCDate(twoWeeksAgo.getUTCDate() - 7);
    const recencyCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    let totalWritten = 0;
    let totalEvidenceRows = 0;
    const evidenceOn = evidenceReceiptsEnabled();
    logger.info(`[compute-user-insights] evidenceReceipts=${evidenceOn}`);

    for (const { id: userId } of users) {
      const signals = await collectSignals(prisma, {
        userId,
        thisWeekStart,
        lastWeekStart,
        twoWeeksAgo,
      });

      // If there are no signals AND no recent entries, skip — the user
      // isn't active enough for Claude to have anything to observe.
      if (signals.length === 0) {
        const recentCount = await prisma.entry.count({
          where: { userId, status: "COMPLETE", createdAt: { gte: fourteenDaysAgo } },
        });
        if (recentCount === 0) continue;
      }

      // EVIDENCE_RECEIPTS. With the flag off, `sources` is empty, the
      // original prompt is used, and every branch below behaves exactly as
      // it did before this feature — no evidence rows, no confidence, and
      // the same createMany write.
      const sourced = evidenceOn
        ? await buildDigestWithSources(prisma, userId, fourteenDaysAgo)
        : null;
      const digest =
        sourced?.text ?? (await buildDigest(prisma, userId, fourteenDaysAgo));
      const sources = sourced?.sources ?? [];

      const claudeObs = await synthesizeWithClaude({
        signals,
        digest,
        evidenceMode: evidenceOn,
      }).catch((err) => {
        logger.warn(`[compute-user-insights] Claude failed for ${userId}: ${String(err)}`);
        return null;
      });

      let toWrite: Array<{
        observationText: string;
        severity: Severity;
        linkedAreaId: string | null;
        generationModel: string;
        confidence: number | null;
        sourceRefs: string[];
      }>;

      if (claudeObs && claudeObs.length > 0) {
        toWrite = claudeObs.map((o) => ({
          observationText: o.text,
          severity: o.severity,
          linkedAreaId: o.linkedAreaId,
          generationModel: CLAUDE_FLAGSHIP_MODEL,
          confidence: o.confidence,
          sourceRefs: o.sourceRefs,
        }));
      } else {
        // Heuristic fallback — better something than nothing when Claude
        // is unavailable. Uses the raw signal text from the scanner.
        // Heuristic fallback. These are computed from real aggregates, but
        // the detectors don't currently retain the entry ids behind them
        // (see docs/INSIGHT_GENERATION_AUDIT.md §2) — so they carry no
        // sourceRefs and land as UNSOURCED. That is the honest reading:
        // "Your mood dipped this week" is a real computation, but we cannot
        // yet quote the recordings it came from.
        toWrite = signals.slice(0, 3).map((s) => ({
          observationText: s.heuristicText,
          severity: s.severity,
          linkedAreaId: s.linkedAreaId ?? null,
          generationModel: "heuristic",
          confidence: null,
          sourceRefs: [],
        }));
      }

      if (toWrite.length === 0) continue;

      // Dedupe against recent rows so a cron retry doesn't double-post.
      const recent = await prisma.userInsight.findMany({
        where: { userId, createdAt: { gte: recencyCutoff } },
        select: { observationText: true },
      });
      const recentTexts = new Set(recent.map((r) => r.observationText));
      const fresh = toWrite.filter((o) => !recentTexts.has(o.observationText));
      if (fresh.length === 0) continue;

      if (!evidenceOn) {
        // UNCHANGED PATH — identical to pre-EVIDENCE_RECEIPTS behavior.
        await prisma.userInsight.createMany({
          data: fresh.map((o) => ({
            userId,
            observationText: o.observationText,
            severity: o.severity,
            linkedAreaId: o.linkedAreaId,
            generationModel: o.generationModel,
          })),
        });
        totalWritten += fresh.length;
        continue;
      }

      // Evidence path: create one at a time because createMany does not
      // return ids, and we need each insight's id to attach its receipts.
      for (const o of fresh) {
        const evidence = resolveEvidence(o.observationText, o.sourceRefs, sources);

        const insight = await prisma.userInsight.create({
          data: {
            userId,
            observationText: o.observationText,
            severity: o.severity,
            linkedAreaId: o.linkedAreaId,
            generationModel: o.generationModel,
            confidence: o.confidence,
          },
          select: { id: true },
        });

        if (evidence.length > 0) {
          await prisma.insightEvidence.createMany({
            data: evidence.map((e) => ({ insightId: insight.id, ...e })),
            skipDuplicates: true,
          });
        } else {
          // Not an error — it is the signal we most want to see in observer
          // mode. An observation the model could not (or would not) ground
          // is written and then suppressed by THE RULE at read time. Logging
          // it is how we measure how often the generator over-reaches.
          logger.info(
            `[compute-user-insights] unsourced observation for ${userId} (refs=${o.sourceRefs.length}, model=${o.generationModel})`
          );
        }
        totalEvidenceRows += evidence.length;
        totalWritten += 1;
      }
    }

    return {
      usersProcessed: users.length,
      insightsWritten: totalWritten,
      evidenceRowsWritten: totalEvidenceRows,
      evidenceReceipts: evidenceOn,
    };
  }
);

// ─── Signal collection (heuristic scanner) ───────────────────────────────

export async function collectSignals(
  prisma: typeof import("@prisma/client").PrismaClient.prototype,
  params: {
    userId: string;
    thisWeekStart: Date;
    lastWeekStart: Date;
    twoWeeksAgo: Date;
  }
): Promise<Signal[]> {
  const { userId, thisWeekStart, lastWeekStart, twoWeeksAgo } = params;
  const signals: Signal[] = [];

  // 1. Area deltas
  const [currentAreas, lastWeekSnapshots] = await Promise.all([
    prisma.lifeMapArea.findMany({
      where: { userId },
      select: { area: true, score: true },
    }),
    prisma.lifeMapAreaHistory.findMany({
      where: { userId, weekStart: { gte: lastWeekStart, lt: thisWeekStart } },
      select: { area: true, score: true },
    }),
  ]);
  const byAreaLast: Record<string, number> = {};
  for (const s of lastWeekSnapshots) byAreaLast[s.area] = s.score;
  for (const c of currentAreas) {
    const prev = byAreaLast[c.area];
    if (prev === undefined) continue;
    const delta = c.score - prev;
    const label = AREA_LABELS[c.area] ?? c.area;
    if (delta <= -20) {
      signals.push({
        kind: "area_delta",
        severity: "CONCERNING",
        heuristicText: `Your ${label} score dropped ${Math.round(-delta / 10)} points this week`,
        linkedAreaId: c.area,
        context: { area: c.area, delta, current: c.score, previous: prev },
      });
    } else if (delta >= 20) {
      signals.push({
        kind: "area_delta",
        severity: "POSITIVE",
        heuristicText: `Your ${label} score climbed ${Math.round(delta / 10)} points this week`,
        linkedAreaId: c.area,
        context: { area: c.area, delta, current: c.score, previous: prev },
      });
    }
  }

  // 2. Theme frequency week-over-week
  const [thisWeekEntries, prevWeekEntries] = await Promise.all([
    prisma.entry.findMany({
      where: {
        userId,
        entryDate: { gte: lastWeekStart, lt: thisWeekStart },
        status: "COMPLETE",
      },
      select: { themes: true },
    }),
    prisma.entry.findMany({
      where: {
        userId,
        entryDate: { gte: twoWeeksAgo, lt: lastWeekStart },
        status: "COMPLETE",
      },
      select: { themes: true },
    }),
  ]);
  const freq = (entries: { themes: string[] }[]): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const e of entries) {
      for (const t of e.themes ?? []) {
        const k = t.toLowerCase();
        m[k] = (m[k] ?? 0) + 1;
      }
    }
    return m;
  };
  const thisFreq = freq(thisWeekEntries);
  const prevFreq = freq(prevWeekEntries);
  for (const [theme, thisCount] of Object.entries(thisFreq)) {
    if (thisCount < 2) continue;
    const prevCount = prevFreq[theme] ?? 0;
    if (prevCount === 0) continue;
    if (thisCount >= prevCount * 2) {
      signals.push({
        kind: "theme_spike",
        severity: "NEUTRAL",
        heuristicText: `You mentioned "${theme}" ${Math.round(thisCount / prevCount)}x more than last week`,
        context: { theme, thisCount, prevCount },
      });
    }
  }

  // 3. Streak milestones
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentStreak: true, lastStreakMilestone: true },
  });
  if (user?.currentStreak) {
    for (const milestone of [7, 30, 100]) {
      if (
        user.currentStreak >= milestone &&
        (user.lastStreakMilestone ?? 0) < milestone
      ) {
        signals.push({
          kind: "streak_milestone",
          severity: "POSITIVE",
          heuristicText: `${milestone}-day streak — consistency is compounding`,
          context: { milestone, currentStreak: user.currentStreak },
        });
      }
    }
  }

  // 4. Mood drift
  const [thisMoodEntries, prevMoodEntries] = await Promise.all([
    prisma.entry.findMany({
      where: {
        userId,
        entryDate: { gte: lastWeekStart, lt: thisWeekStart },
        status: "COMPLETE",
      },
      select: { mood: true },
    }),
    prisma.entry.findMany({
      where: {
        userId,
        entryDate: { gte: twoWeeksAgo, lt: lastWeekStart },
        status: "COMPLETE",
      },
      select: { mood: true },
    }),
  ]);
  const moodAvg = (e: { mood: string | null }[]): number | null => {
    const ranks = e
      .map((x) => (x.mood ? MOOD_ORDER[x.mood] : null))
      .filter((r): r is number => r !== null);
    if (ranks.length === 0) return null;
    return ranks.reduce((a, b) => a + b, 0) / ranks.length;
  };
  const thisMood = moodAvg(thisMoodEntries);
  const prevMood = moodAvg(prevMoodEntries);
  if (thisMood !== null && prevMood !== null) {
    const drift = thisMood - prevMood;
    if (drift <= -1) {
      signals.push({
        kind: "mood_drift",
        severity: "CONCERNING",
        heuristicText: "Your mood has dipped noticeably this week",
        context: { thisMood, prevMood, drift },
      });
    } else if (drift >= 1) {
      signals.push({
        kind: "mood_drift",
        severity: "POSITIVE",
        heuristicText: "Your mood has lifted compared to last week",
        context: { thisMood, prevMood, drift },
      });
    }
  }

  return signals;
}

// ─── 14-day digest for Claude ────────────────────────────────────────────

/**
 * Build a compact context block describing the user's last 14 days
 * that Claude can reference when writing observations. No
 * transcripts (privacy + token cost) — just summaries, themes,
 * moods, and aggregate stats.
 */
export async function buildDigest(
  prisma: typeof import("@prisma/client").PrismaClient.prototype,
  userId: string,
  fourteenDaysAgo: Date
): Promise<string> {
  const entries = await prisma.entry.findMany({
    where: {
      userId,
      status: "COMPLETE",
      createdAt: { gte: fourteenDaysAgo },
    },
    select: {
      createdAt: true,
      summary: true,
      mood: true,
      moodScore: true,
      energy: true,
      themes: true,
      wins: true,
      blockers: true,
    },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  if (entries.length === 0) return "No entries in the last 14 days.";

  const lines = entries.map((e) => {
    const date = e.createdAt.toISOString().slice(0, 10);
    const bits = [
      `[${date}]`,
      `mood=${e.mood ?? "?"}/${e.moodScore ?? "?"}`,
      `energy=${e.energy ?? "?"}`,
    ];
    if (e.themes && e.themes.length > 0) {
      bits.push(`themes=${e.themes.slice(0, 5).join(",")}`);
    }
    if (e.summary) bits.push(`"${e.summary.slice(0, 120)}"`);
    return bits.join(" ");
  });

  return `Entries (last 14 days):\n${lines.join("\n")}`;
}

// ─── Evidence-mode digest (EVIDENCE_RECEIPTS) ────────────────────────────

export interface DigestSource {
  /** Stable label the model cites: "E1", "E2", … */
  ref: string;
  entryId: string;
  transcript: string | null;
  summary: string | null;
}

/**
 * Same digest as `buildDigest`, but each line carries a [E<n>] label and we
 * keep the entry id + source text behind it.
 *
 * The ONLY difference in what the model sees is the label prefix — the same
 * summaries, moods and themes, no transcripts. Everything needed to turn a
 * citation into a verbatim excerpt is retained server-side.
 *
 * This is the fix for the traceability gap documented in
 * docs/INSIGHT_GENERATION_AUDIT.md §2: today's digest selects entries and
 * then throws their ids away, which makes receipts impossible in principle.
 */
export async function buildDigestWithSources(
  prisma: typeof import("@prisma/client").PrismaClient.prototype,
  userId: string,
  fourteenDaysAgo: Date
): Promise<{ text: string; sources: DigestSource[] }> {
  const entries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE", createdAt: { gte: fourteenDaysAgo } },
    select: {
      id: true,
      createdAt: true,
      summary: true,
      transcript: true,
      mood: true,
      moodScore: true,
      energy: true,
      themes: true,
      wins: true,
      blockers: true,
    },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  if (entries.length === 0) {
    return { text: "No entries in the last 14 days.", sources: [] };
  }

  const sources: DigestSource[] = [];
  const lines = entries.map((e, i) => {
    const ref = `E${i + 1}`;
    sources.push({
      ref,
      entryId: e.id,
      transcript: e.transcript ?? null,
      summary: e.summary ?? null,
    });
    const date = e.createdAt.toISOString().slice(0, 10);
    const bits = [
      `[${ref}]`,
      `[${date}]`,
      `mood=${e.mood ?? "?"}/${e.moodScore ?? "?"}`,
      `energy=${e.energy ?? "?"}`,
    ];
    if (e.themes && e.themes.length > 0) {
      bits.push(`themes=${e.themes.slice(0, 5).join(",")}`);
    }
    if (e.summary) bits.push(`"${e.summary.slice(0, 120)}"`);
    return bits.join(" ");
  });

  return { text: `Entries (last 14 days):\n${lines.join("\n")}`, sources };
}

/**
 * Turn the model's cited refs into persistable evidence rows.
 *
 * Two independent guards against a bogus receipt:
 *   1. An unknown ref (model invented "E99") is dropped — we only resolve
 *      labels we actually issued.
 *   2. `selectExcerpt` returns null when nothing in the entry's text
 *      overlaps the observation, and we drop that citation too. So a model
 *      citing a real-but-irrelevant entry still yields no evidence.
 *
 * The result is that evidence count reflects entries we can genuinely quote,
 * which is precisely what THE RULE then gates on.
 */
export function resolveEvidence(
  observationText: string,
  sourceRefs: string[],
  sources: DigestSource[]
): Array<{ entryId: string; excerpt: string; startIndex: number | null; endIndex: number | null }> {
  const byRef = new Map(sources.map((s) => [s.ref.toUpperCase(), s]));
  const seenEntryIds = new Set<string>();
  const out: Array<{
    entryId: string;
    excerpt: string;
    startIndex: number | null;
    endIndex: number | null;
  }> = [];

  for (const raw of sourceRefs) {
    if (typeof raw !== "string") continue;
    const src = byRef.get(raw.trim().toUpperCase());
    if (!src) continue; // guard 1: ref we never issued
    if (seenEntryIds.has(src.entryId)) continue; // @@unique([insightId, entryId])

    const picked = selectExcerpt(observationText, {
      transcript: src.transcript,
      summary: src.summary,
    });
    if (!picked) continue; // guard 2: nothing quotable supports the claim

    seenEntryIds.add(src.entryId);
    out.push({
      entryId: src.entryId,
      excerpt: picked.excerpt,
      startIndex: picked.startIndex,
      endIndex: picked.endIndex,
    });
  }

  return out;
}

// ─── Claude synthesis ────────────────────────────────────────────────────

export async function synthesizeWithClaude(params: {
  signals: Signal[];
  digest: string;
  /**
   * EVIDENCE_RECEIPTS. When true, uses the citation-requiring prompt and
   * parses `sourceRefs` + `confidence` off each observation. When false the
   * request is byte-identical to what it was before this feature existed.
   */
  evidenceMode?: boolean;
}): Promise<Array<{
  text: string;
  severity: Severity;
  linkedAreaId: string | null;
  sourceRefs: string[];
  confidence: number | null;
}> | null> {
  const signalBlock =
    params.signals.length === 0
      ? "No strong mechanical signals this week — surface whatever pattern reads as meaningful from the digest alone."
      : params.signals
          .map(
            (s) =>
              `- [${s.kind}:${s.severity}] ${s.heuristicText} (${JSON.stringify(s.context)})`
          )
          .join("\n");

  const userMessage = `${params.digest}\n\nNumeric signals from this week:\n${signalBlock}`;

  const res = await anthropic.messages.create({
    model: CLAUDE_FLAGSHIP_MODEL,
    max_tokens: CLAUDE_FLAGSHIP_MAX_TOKENS,
    system: params.evidenceMode
      ? EVIDENCE_SYSTEM_PROMPT
      : OBSERVATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = res.content[0]?.type === "text" ? res.content[0].text : "";
  const jsonText = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  const parsed = JSON.parse(jsonText) as {
    observations?: Array<{
      text?: unknown;
      severity?: unknown;
      linkedAreaId?: unknown;
      sourceRefs?: unknown;
      confidence?: unknown;
    }>;
  };
  if (!parsed.observations || !Array.isArray(parsed.observations)) return null;

  const VALID_SEV: ReadonlySet<string> = new Set([
    "POSITIVE",
    "NEUTRAL",
    "CONCERNING",
  ]);
  const VALID_AREAS: ReadonlySet<string> = new Set([
    "CAREER",
    "HEALTH",
    "RELATIONSHIPS",
    "FINANCES",
    "PERSONAL",
    "OTHER",
  ]);

  return parsed.observations
    .map((o) => {
      if (typeof o.text !== "string") return null;
      const text = o.text.trim().slice(0, 200);
      if (text.length < 10) return null;
      const severity = VALID_SEV.has(String(o.severity ?? "").toUpperCase())
        ? (String(o.severity).toUpperCase() as Severity)
        : "NEUTRAL";
      const linkedAreaId =
        typeof o.linkedAreaId === "string" &&
        VALID_AREAS.has(o.linkedAreaId.toUpperCase())
          ? o.linkedAreaId.toUpperCase()
          : null;
      // Both default to "nothing claimed" so a non-evidence-mode response,
      // or a model that ignored the citation instructions, yields zero
      // evidence rather than a silently-unverified assertion.
      const sourceRefs = Array.isArray(o.sourceRefs)
        ? o.sourceRefs.filter((r): r is string => typeof r === "string").slice(0, 10)
        : [];
      const confidence =
        typeof o.confidence === "number" && Number.isFinite(o.confidence)
          ? Math.min(1, Math.max(0, o.confidence))
          : null;
      return { text, severity, linkedAreaId, sourceRefs, confidence };
    })
    .filter(
      (
        x
      ): x is {
        text: string;
        severity: Severity;
        linkedAreaId: string | null;
        sourceRefs: string[];
        confidence: number | null;
      } => x !== null
    )
    .slice(0, 3);
}
