import "server-only";

import { classifyInsightConfidence, type ConfidenceTier } from "@acuity/shared";

/**
 * The Memory Ledger — "what Ripple knows about you", assembled read-only
 * from tables that already exist.
 *
 * ── The organizing idea ──────────────────────────────────────────────
 * Every claim in this payload falls into exactly one of three buckets, and
 * the bucketing is the product:
 *
 *   `patterns`   — things we will assert. CONFIRMED only: ≥2 citable source
 *                  entries. Each ships with its receipts attached.
 *   `uncertain`  — things we noticed but will NOT assert, each with a plain
 *                  reason why. This is the honesty surface. A mirror that
 *                  says "I think I see something here but can't show you
 *                  where" is more trustworthy than one that quietly upgrades
 *                  a hunch into a finding.
 *   `corrections`— things the user has told us we got right or wrong.
 *
 * Nothing that fails `classifyInsightConfidence` can reach `patterns`. The
 * gate is applied once, here, rather than left to each caller.
 *
 * ── Read-only, and deliberately so ───────────────────────────────────
 * No writes, no generation, no model calls. It reflects state that other
 * pipelines produced. That keeps it cheap enough to serve on demand and
 * means it can never itself become a source of unevidenced claims.
 */

export interface LedgerPerson {
  id: string;
  displayName: string;
  aliases: string[];
  mentionCount: number;
  firstMentionedAt: string;
  /** Distinct entries this person is actually quotable from. */
  evidenceEntryCount: number;
}

export interface LedgerGoal {
  id: string;
  title: string;
  status: string;
  lifeArea: string;
  progress: number;
  targetDate: string | null;
  lastMentionedAt: string | null;
  /** Entries the extraction pipeline linked to this goal. */
  sourceEntryCount: number;
  editedByUser: boolean;
}

export interface LedgerTheme {
  id: string;
  name: string;
  mentionCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  sentiment: { positive: number; neutral: number; negative: number };
}

export interface LedgerReceipt {
  entryId: string;
  excerpt: string;
  entryDate: string | null;
  startIndex: number | null;
  endIndex: number | null;
}

export interface LedgerPattern {
  id: string;
  text: string;
  severity: string;
  linkedAreaId: string | null;
  confidence: number;
  tier: ConfidenceTier;
  createdAt: string;
  receipts: LedgerReceipt[];
}

export interface LedgerUncertainty {
  id: string;
  text: string;
  tier: ConfidenceTier;
  confidence: number;
  /** Plain-language why-we're-not-asserting-this. */
  reasons: string[];
  evidenceCount: number;
  createdAt: string;
}

export interface LedgerCorrection {
  id: string;
  text: string;
  state: string;
  note: string | null;
  correctedAt: string | null;
}

export interface LedgerKeyFact {
  area: string;
  summary: string;
  mentions: number;
}

export interface MemoryLedger {
  generatedAt: string;
  people: LedgerPerson[];
  goals: LedgerGoal[];
  recurringThemes: LedgerTheme[];
  keyFacts: LedgerKeyFact[];
  patterns: LedgerPattern[];
  uncertain: LedgerUncertainty[];
  corrections: LedgerCorrection[];
  summary: {
    peopleCount: number;
    goalCount: number;
    themeCount: number;
    patternCount: number;
    uncertainCount: number;
    correctionCount: number;
    /**
     * Insights we hold but will not assert, as a share of all live insights.
     * Worth watching: a high value means the generator is out-running its
     * evidence.
     */
    unassertedShare: number;
  };
}

/** A theme needs at least this many mentions to count as "recurring". */
export const RECURRING_THEME_MIN_MENTIONS = 2;

const AREA_SUMMARY_FIELDS: Array<[string, string, string]> = [
  ["CAREER", "careerSummary", "careerMentions"],
  ["MONEY", "moneySummary", "moneyMentions"],
  ["ROMANCE", "romanceSummary", "romanceMentions"],
  ["FAMILY", "familySummary", "familyMentions"],
  ["FRIENDS", "friendsSummary", "friendsMentions"],
  ["PHYSICAL_HEALTH", "physicalHealthSummary", "physicalHealthMentions"],
  ["MENTAL_HEALTH", "mentalHealthSummary", "mentalHealthMentions"],
  ["GROWTH", "growthSummary", "growthMentions"],
  ["FUN", "funSummary", "funMentions"],
  ["PURPOSE", "purposeSummary", "purposeMentions"],
];

export async function buildMemoryLedger(userId: string): Promise<MemoryLedger> {
  const { prisma } = await import("@/lib/prisma");

  const [people, goals, themes, memory, insights] = await Promise.all([
    prisma.person.findMany({
      where: { userId, archived: false },
      orderBy: { mentionCount: "desc" },
      take: 100,
      select: {
        id: true,
        displayName: true,
        aliases: true,
        mentionCount: true,
        firstMentionedAt: true,
        _count: { select: { mentions: true } },
      },
    }),
    prisma.goal.findMany({
      where: { userId, status: { not: "ARCHIVED" } },
      orderBy: { lastMentionedAt: "desc" },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        lifeArea: true,
        progress: true,
        targetDate: true,
        lastMentionedAt: true,
        entryRefs: true,
        editedByUser: true,
      },
    }),
    prisma.theme.findMany({
      where: { userId },
      take: 200,
      select: {
        id: true,
        name: true,
        mentions: {
          select: { sentiment: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.userMemory.findUnique({ where: { userId } }),
    // Live insights only — a dismissed insight is one the user has already
    // pushed away, and re-surfacing it in the ledger would undo that.
    prisma.userInsight.findMany({
      where: { userId, dismissedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        observationText: true,
        severity: true,
        linkedAreaId: true,
        confidence: true,
        correctionState: true,
        correctionNote: true,
        correctedAt: true,
        createdAt: true,
        evidence: {
          select: {
            entryId: true,
            excerpt: true,
            startIndex: true,
            endIndex: true,
            entry: { select: { entryDate: true } },
          },
        },
      },
    }),
  ]);

  // ── People ────────────────────────────────────────────────────────
  const ledgerPeople: LedgerPerson[] = people.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    aliases: p.aliases ?? [],
    mentionCount: p.mentionCount,
    firstMentionedAt: p.firstMentionedAt.toISOString(),
    evidenceEntryCount: p._count.mentions,
  }));

  // ── Goals ─────────────────────────────────────────────────────────
  const ledgerGoals: LedgerGoal[] = goals.map((g) => ({
    id: g.id,
    title: g.title,
    status: g.status,
    lifeArea: g.lifeArea,
    progress: g.progress,
    targetDate: g.targetDate?.toISOString() ?? null,
    lastMentionedAt: g.lastMentionedAt?.toISOString() ?? null,
    // entryRefs is the extraction pipeline's own provenance for goals.
    sourceEntryCount: new Set(g.entryRefs ?? []).size,
    editedByUser: g.editedByUser,
  }));

  // ── Recurring themes ──────────────────────────────────────────────
  const ledgerThemes: LedgerTheme[] = themes
    .map((t) => {
      const sentiment = { positive: 0, neutral: 0, negative: 0 };
      for (const m of t.mentions) {
        const s = (m.sentiment ?? "NEUTRAL").toUpperCase();
        if (s === "POSITIVE") sentiment.positive++;
        else if (s === "NEGATIVE") sentiment.negative++;
        else sentiment.neutral++;
      }
      return {
        id: t.id,
        name: t.name,
        mentionCount: t.mentions.length,
        firstSeenAt: t.mentions[0]?.createdAt.toISOString() ?? null,
        lastSeenAt:
          t.mentions[t.mentions.length - 1]?.createdAt.toISOString() ?? null,
        sentiment,
      };
    })
    // "Recurring" has to mean something — a theme seen once is not a pattern,
    // the same standard the insight rule applies.
    .filter((t) => t.mentionCount >= RECURRING_THEME_MIN_MENTIONS)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 50);

  // ── Key facts ─────────────────────────────────────────────────────
  const keyFacts: LedgerKeyFact[] = [];
  if (memory) {
    const m = memory as unknown as Record<string, unknown>;
    for (const [area, summaryField, mentionsField] of AREA_SUMMARY_FIELDS) {
      const summary = m[summaryField];
      if (typeof summary === "string" && summary.trim().length > 0) {
        keyFacts.push({
          area,
          summary: summary.trim(),
          mentions: typeof m[mentionsField] === "number" ? (m[mentionsField] as number) : 0,
        });
      }
    }
    keyFacts.sort((a, b) => b.mentions - a.mentions);
  }

  // ── Patterns vs uncertainty — THE RULE applied once, here ─────────
  const patterns: LedgerPattern[] = [];
  const uncertain: LedgerUncertainty[] = [];
  const corrections: LedgerCorrection[] = [];

  for (const i of insights) {
    const verdict = classifyInsightConfidence({
      evidenceCount: i.evidence.length,
      modelConfidence: i.confidence,
      correctionState: i.correctionState,
    });

    if (i.correctionState) {
      corrections.push({
        id: i.id,
        text: i.observationText,
        state: i.correctionState,
        note: i.correctionNote,
        correctedAt: i.correctedAt?.toISOString() ?? null,
      });
    }

    if (verdict.surfaceAsPattern) {
      patterns.push({
        id: i.id,
        text: i.observationText,
        severity: i.severity,
        linkedAreaId: i.linkedAreaId,
        confidence: verdict.effectiveConfidence,
        tier: verdict.tier,
        createdAt: i.createdAt.toISOString(),
        receipts: i.evidence.map((e) => ({
          entryId: e.entryId,
          excerpt: e.excerpt,
          entryDate: e.entry?.entryDate?.toISOString() ?? null,
          startIndex: e.startIndex,
          endIndex: e.endIndex,
        })),
      });
    } else {
      uncertain.push({
        id: i.id,
        text: i.observationText,
        tier: verdict.tier,
        confidence: verdict.effectiveConfidence,
        reasons: verdict.reasons,
        evidenceCount: i.evidence.length,
        createdAt: i.createdAt.toISOString(),
      });
    }
  }

  const liveInsightCount = patterns.length + uncertain.length;

  return {
    generatedAt: new Date().toISOString(),
    people: ledgerPeople,
    goals: ledgerGoals,
    recurringThemes: ledgerThemes,
    keyFacts,
    patterns,
    uncertain,
    corrections,
    summary: {
      peopleCount: ledgerPeople.length,
      goalCount: ledgerGoals.length,
      themeCount: ledgerThemes.length,
      patternCount: patterns.length,
      uncertainCount: uncertain.length,
      correctionCount: corrections.length,
      unassertedShare:
        liveInsightCount === 0
          ? 0
          : Math.round((uncertain.length / liveInsightCount) * 100) / 100,
    },
  };
}
