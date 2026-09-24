/**
 * AdLab learning loop (2026-09-24, per Keenan).
 *
 * Before this, the Sunday weekly batch wrote 20 new ads with zero memory of
 * what had worked — week 10 was no smarter than week 1. This module closes
 * the loop, judged on TRIAL STARTS (the business goal), not clicks:
 *
 *   Meta spend/clicks (AdLabDailyMetric)
 *     → funnel landings  (OnboardingEvent.utmContent = creative id)
 *     → signups          (User.signupUtmContent, or any attributed event's userId)
 *     → trial starts     (Stripe checkout completed: funnel_payment_completed
 *                         event or a stripeSubscriptionId)
 *     → paid             (subscriptionStatus PRO)
 *
 * The join is first-party (utm_content = AdLabCreative.id is set at launch),
 * so it doesn't depend on Meta's pixel attribution at all.
 *
 * Trial starts are rare (~17 on ~$2k of history), so ranking a creative on
 * raw trials alone is noise. Each creative is scored on "trial-equivalents":
 * actual trials + still-open recent signups × the group's signup→trial rate, then
 * shrunk toward the group average by clicks (empirical-Bayes style). An ad
 * with 3 clicks and 1 lucky trial does NOT outrank an ad with 400 clicks.
 *
 * buildLearningStats() is deterministic (DB only) — safe to run anywhere.
 * runWeeklyLearning() adds one Claude distill call — prod only (local
 * ANTHROPIC key is dead).
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJsonObject } from "@/lib/adlab/claude";
import type { BatchGroupKey } from "@/lib/adlab/weekly-batch";

// ─── Tunables ─────────────────────────────────────────────────────────────

/** How far back to look. History starts 2026-05 (validation tests). */
const LOOKBACK_DAYS = 180;
/**
 * A creative needs at least this much spend to be judged at all — ~1.5×
 * the historical cost per signup, so a zero-signup ad has had a real chance.
 */
const MIN_SPEND_CENTS = 1500; // $15
/** Shrinkage strength, in clicks. Higher = trust the group average longer. */
const PRIOR_CLICKS = 150;
/** Signups younger than this with no trial yet still count as maybe-trials. */
const PENDING_SIGNUP_DAYS = 10;
/** Brief is reused by the weekly batch for this long. */
export const LEARNING_MAX_AGE_DAYS = 14;

const TEST_EMAIL_PATTERNS = [
  /@heelerdigital\.com$/i,
  /cloudtestlabaccounts\.com$/i,
  /jcunningham|jimmy\.cunningham/i,
];

// ─── Group mapping ────────────────────────────────────────────────────────

/**
 * ripple-men → men. Everything else (ripple-women + the May–July "acuity" /
 * "journal" validation projects, which targeted the women's audience) → women.
 */
export function projectSlugToGroup(slug: string): BatchGroupKey {
  return slug === "ripple-men" ? "men" : "women";
}

/**
 * Format key for creatives created before formatKey was stored. Matches the
 * distinctive opening of each AD_FORMATS prompt builder; anything older than
 * the 2026-09-23 format system is "legacy".
 */
export function inferFormatKey(generationPrompt: string | null): string {
  const p = generationPrompt ?? "";
  if (p.includes("minimal phone notes app")) return "notes-app";
  if (p.startsWith("Typographic direct-response")) return "statement-card";
  if (p.includes("heavily darkened/softened so text dominates")) return "checklist-photo";
  if (p.includes("voice journaling app") && p.includes("smartphone rests")) return "app-in-scene";
  if (p.includes("Large bold headline across the upper third")) return "hook-overlay";
  return "legacy";
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface CreativePerf {
  creativeId: string;
  projectSlug: string;
  launchedAt: string | null;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  valueSurface: string;
  hypothesis: string;
  theme: string;
  formatKey: string;
  strategy: string; // "exploit" | "explore" | "unknown"
  spendCents: number;
  impressions: number;
  clicks: number;
  landings: number;
  signups: number;
  trials: number;
  paid: number;
  /** Shrunk trial-equivalents per click. */
  estTrialRate: number;
  /** spend / (clicks × estTrialRate), cents. Null when no clicks. */
  estCostPerTrialCents: number | null;
}

export interface DimensionRow {
  value: string;
  creatives: number;
  spendCents: number;
  clicks: number;
  signups: number;
  trials: number;
  ctr: number;
  costPerSignupCents: number | null;
  costPerTrialCents: number | null;
}

export interface LearningStats {
  groupKey: BatchGroupKey;
  generatedAt: string;
  totals: {
    creatives: number;
    spendCents: number;
    impressions: number;
    clicks: number;
    landings: number;
    signups: number;
    trials: number;
    paid: number;
    signupToTrialRate: number;
    costPerSignupCents: number | null;
    costPerTrialCents: number | null;
  };
  /** Rough read on how much to trust the rankings. */
  confidence: "low" | "medium" | "high";
  top: CreativePerf[];
  bottom: CreativePerf[];
  byValueSurface: DimensionRow[];
  byFormat: DimensionRow[];
  byCta: DimensionRow[];
  byStrategy: DimensionRow[];
}

export interface LearningBrief {
  summary: string;
  winningPatterns: Array<{ pattern: string; evidence: string }>;
  losingPatterns: Array<{ pattern: string; evidence: string }>;
  doubleDown: string[];
  avoid: string[];
  exploreNext: string[];
  preferredFormats: string[];
}

// ─── Deterministic stats ──────────────────────────────────────────────────

function isTestEmail(email: string | null): boolean {
  return !!email && TEST_EMAIL_PATTERNS.some((p) => p.test(email));
}

function themeFromNotes(notes: string): string {
  // Weekly-batch notes: "Reddit theme (2026-09-19): <theme>[ | strategy: …]"
  const m = notes.match(/Reddit theme \([^)]*\):\s*([^|\n]+)/);
  return (m ? m[1] : notes.split("\n")[0]).trim().slice(0, 160);
}

function strategyFromNotes(notes: string): string {
  const m = notes.match(/strategy:\s*(exploit|explore)/);
  return m ? m[1] : "unknown";
}

/**
 * Per-creative funnel for every launched creative in the group, plus
 * dimension roll-ups. Pure DB reads.
 */
export async function buildLearningStats(groupKey: BatchGroupKey): Promise<LearningStats> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // 1. Launched creatives + their ads' metrics
  const creatives = await prisma.adLabCreative.findMany({
    where: { ads: { some: { launchedAt: { gte: since } } } },
    select: {
      id: true,
      headline: true,
      primaryText: true,
      description: true,
      cta: true,
      formatKey: true,
      generationPrompt: true,
      angle: {
        select: {
          hypothesis: true,
          valueSurface: true,
          researchNotes: true,
          experiment: { select: { project: { select: { slug: true } } } },
        },
      },
      ads: { select: { id: true, launchedAt: true } },
    },
  });
  const groupCreatives = creatives.filter(
    (c) => projectSlugToGroup(c.angle.experiment.project.slug) === groupKey
  );
  const creativeIds = groupCreatives.map((c) => c.id);
  const adToCreative = new Map<string, string>();
  for (const c of groupCreatives) for (const a of c.ads) adToCreative.set(a.id, c.id);

  const metricSums = await prisma.adLabDailyMetric.groupBy({
    by: ["adId"],
    where: { adId: { in: [...adToCreative.keys()] } },
    _sum: { spendCents: true, impressions: true, clicks: true },
  });
  const media = new Map<string, { spendCents: number; impressions: number; clicks: number }>();
  for (const m of metricSums) {
    const cid = adToCreative.get(m.adId)!;
    const cur = media.get(cid) ?? { spendCents: 0, impressions: 0, clicks: 0 };
    cur.spendCents += m._sum.spendCents ?? 0;
    cur.impressions += m._sum.impressions ?? 0;
    cur.clicks += m._sum.clicks ?? 0;
    media.set(cid, cur);
  }

  // 2. Funnel landings per creative (first funnel screen, bots excluded)
  const landingRows = await prisma.onboardingEvent.groupBy({
    by: ["utmContent"],
    where: { utmContent: { in: creativeIds }, event: "funnel_entry_viewed", isBot: false },
    _count: true,
  });
  const landings = new Map(landingRows.map((r) => [r.utmContent!, r._count]));

  // 3. Users per creative: signup UTM OR any attributed funnel event that
  //    carries a userId (covers OAuth paths that drop the signup cookie).
  const creativeUsers = new Map<string, Set<string>>();
  const addUser = (cid: string, uid: string) => {
    if (!creativeUsers.has(cid)) creativeUsers.set(cid, new Set());
    creativeUsers.get(cid)!.add(uid);
  };
  const utmUsers = await prisma.user.findMany({
    where: { signupUtmContent: { in: creativeIds } },
    select: { id: true, signupUtmContent: true },
  });
  for (const u of utmUsers) addUser(u.signupUtmContent!, u.id);
  const eventUsers = await prisma.onboardingEvent.findMany({
    where: { utmContent: { in: creativeIds }, userId: { not: null }, isBot: false },
    distinct: ["utmContent", "userId"],
    select: { utmContent: true, userId: true },
  });
  for (const e of eventUsers) addUser(e.utmContent!, e.userId!);

  const allUserIds = [...new Set([...creativeUsers.values()].flatMap((s) => [...s]))];
  const users = await prisma.user.findMany({
    where: { id: { in: allUserIds } },
    select: { id: true, email: true, createdAt: true, stripeSubscriptionId: true, subscriptionStatus: true },
  });
  const userById = new Map(users.filter((u) => !isTestEmail(u.email)).map((u) => [u.id, u]));
  // Trial start = Stripe checkout completed. The webhook logs it as a
  // funnel_payment_completed event; stripeSubscriptionId covers rows from
  // before that event existed.
  const paymentEvents = await prisma.onboardingEvent.findMany({
    where: { userId: { in: allUserIds }, event: "funnel_payment_completed" },
    distinct: ["userId"],
    select: { userId: true },
  });
  const startedTrial = new Set(paymentEvents.map((e) => e.userId!));

  // A user attributed to several creatives counts once, for the FIRST
  // creative that claims them via signup UTM (first touch); event-only
  // users go to their first attributed creative in iteration order.
  const claimed = new Set<string>();
  // A signup younger than this without a trial may still start one (the
  // funnel's trial-lock-in and day-7 upsell happen within the first week).
  const pendingCutoff = Date.now() - PENDING_SIGNUP_DAYS * 24 * 60 * 60 * 1000;
  const funnel = new Map<string, { signups: number; trials: number; paid: number; pending: number }>();
  const orderedCids = [
    ...utmUsers.map((u) => u.signupUtmContent!),
    ...creativeIds,
  ];
  for (const cid of new Set(orderedCids)) {
    const f = { signups: 0, trials: 0, paid: 0, pending: 0 };
    for (const uid of creativeUsers.get(cid) ?? []) {
      if (claimed.has(uid)) continue;
      const u = userById.get(uid);
      if (!u) continue;
      claimed.add(uid);
      f.signups++;
      if (u.stripeSubscriptionId || startedTrial.has(uid)) f.trials++;
      else if (u.createdAt.getTime() >= pendingCutoff) f.pending++;
      if (u.subscriptionStatus === "PRO") f.paid++;
    }
    funnel.set(cid, f);
  }

  // 4. Assemble rows
  type Raw = Omit<CreativePerf, "estTrialRate" | "estCostPerTrialCents"> & { pending: number };
  const raws: Raw[] = groupCreatives.map((c) => {
    const m = media.get(c.id) ?? { spendCents: 0, impressions: 0, clicks: 0 };
    const f = funnel.get(c.id) ?? { signups: 0, trials: 0, paid: 0, pending: 0 };
    const launched = c.ads
      .map((a) => a.launchedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return {
      creativeId: c.id,
      projectSlug: c.angle.experiment.project.slug,
      launchedAt: launched ? launched.toISOString().slice(0, 10) : null,
      headline: c.headline,
      primaryText: c.primaryText,
      description: c.description,
      cta: c.cta,
      valueSurface: c.angle.valueSurface,
      hypothesis: c.angle.hypothesis,
      theme: themeFromNotes(c.angle.researchNotes),
      formatKey: c.formatKey ?? inferFormatKey(c.generationPrompt),
      strategy: strategyFromNotes(c.angle.researchNotes),
      ...m,
      landings: landings.get(c.id) ?? 0,
      ...f,
    };
  });

  const sum = (k: keyof Raw) => raws.reduce((n, r) => n + (r[k] as number), 0);
  const tot = {
    spendCents: sum("spendCents"),
    impressions: sum("impressions"),
    clicks: sum("clicks"),
    landings: sum("landings"),
    signups: sum("signups"),
    trials: sum("trials"),
    paid: sum("paid"),
  };
  const signupToTrial = tot.signups > 0 ? tot.trials / tot.signups : 0;
  // Trial-equivalents: real trials, plus RECENT signups (outcome still
  // open) at the group's signup→trial rate. Older signups that never
  // trialed count as zero — their outcome is known.
  const trialEq = (r: { trials: number; pending: number }) => r.trials + r.pending * signupToTrial;
  const priorRate = tot.clicks > 0 ? raws.reduce((n, r) => n + trialEq(r), 0) / tot.clicks : 0;

  const scored: CreativePerf[] = raws.map(({ pending: _pending, ...r }) => {
    const estTrialRate = (trialEq({ trials: r.trials, pending: _pending }) + PRIOR_CLICKS * priorRate) / (r.clicks + PRIOR_CLICKS);
    const estCostPerTrialCents =
      r.clicks > 0 && estTrialRate > 0 ? Math.round(r.spendCents / (r.clicks * estTrialRate)) : null;
    return { ...r, estTrialRate, estCostPerTrialCents };
  });

  const judged = scored
    .filter((r) => r.spendCents >= MIN_SPEND_CENTS && r.estCostPerTrialCents !== null)
    .sort((a, b) => a.estCostPerTrialCents! - b.estCostPerTrialCents!);
  // Winners must have converted someone. Without this, low-data ads with
  // cheap clicks and zero signups float to the top (their shrunk rate ≈ the
  // group prior, so the ranking collapses to CPC) — caught on the first run
  // against real history.
  const winners = judged.filter((r) => r.signups > 0);
  const n = Math.min(8, Math.floor(judged.length / 2));
  const top = winners.slice(0, n);
  const topIds = new Set(top.map((r) => r.creativeId));
  const bottom = judged
    .filter((r) => !topIds.has(r.creativeId))
    .slice(-n)
    .reverse();

  const confidence: LearningStats["confidence"] =
    tot.trials >= 30 ? "high" : tot.trials >= 10 || tot.signups >= 100 ? "medium" : "low";

  return {
    groupKey,
    generatedAt: new Date().toISOString(),
    totals: {
      creatives: judged.length,
      ...tot,
      signupToTrialRate: Number(signupToTrial.toFixed(4)),
      costPerSignupCents: tot.signups > 0 ? Math.round(tot.spendCents / tot.signups) : null,
      costPerTrialCents: tot.trials > 0 ? Math.round(tot.spendCents / tot.trials) : null,
    },
    confidence,
    top,
    bottom,
    byValueSurface: rollup(judged, (r) => r.valueSurface),
    byFormat: rollup(judged, (r) => r.formatKey),
    byCta: rollup(judged, (r) => r.cta),
    byStrategy: rollup(judged, (r) => r.strategy),
  };
}

function rollup(rows: CreativePerf[], key: (r: CreativePerf) => string): DimensionRow[] {
  const groups = new Map<string, CreativePerf[]>();
  for (const r of rows) {
    const k = key(r) || "unknown";
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([value, rs]) => {
      const spendCents = rs.reduce((n, r) => n + r.spendCents, 0);
      const clicks = rs.reduce((n, r) => n + r.clicks, 0);
      const impressions = rs.reduce((n, r) => n + r.impressions, 0);
      const signups = rs.reduce((n, r) => n + r.signups, 0);
      const trials = rs.reduce((n, r) => n + r.trials, 0);
      return {
        value,
        creatives: rs.length,
        spendCents,
        clicks,
        signups,
        trials,
        ctr: impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0,
        costPerSignupCents: signups > 0 ? Math.round(spendCents / signups) : null,
        costPerTrialCents: trials > 0 ? Math.round(spendCents / trials) : null,
      };
    })
    .sort((a, b) => b.spendCents - a.spendCents);
}

// ─── Claude distill ───────────────────────────────────────────────────────

const $ = (cents: number | null) => (cents === null ? "—" : `$${(cents / 100).toFixed(2)}`);

function creativeLine(r: CreativePerf): string {
  return `- [${r.formatKey} | ${r.valueSurface} | CTA ${r.cta} | launched ${r.launchedAt ?? "?"}] spend ${$(r.spendCents)}, ${r.clicks} clicks, ${r.landings} landings, ${r.signups} signups, ${r.trials} trials, ${r.paid} paid → est. cost/trial ${$(r.estCostPerTrialCents)}
  HEADLINE: ${r.headline}
  TEXT: ${r.primaryText}
  THEME: ${r.theme}`;
}

function dimTable(title: string, rows: DimensionRow[]): string {
  if (rows.length === 0) return "";
  return `${title}:\n${rows
    .map(
      (d) =>
        `- ${d.value}: ${d.creatives} ads, spend ${$(d.spendCents)}, CTR ${d.ctr}%, ${d.signups} signups (${$(d.costPerSignupCents)}/signup), ${d.trials} trials (${$(d.costPerTrialCents)}/trial)`
    )
    .join("\n")}`;
}

/** Stats rendered as prompt text — shared by the distill call and the batch. */
export function renderStatsForPrompt(stats: LearningStats): string {
  const t = stats.totals;
  return `TOTALS (${stats.groupKey}, last ${LOOKBACK_DAYS} days, ${t.creatives} judged ads): spend ${$(t.spendCents)}, ${t.clicks} clicks, ${t.signups} signups (${$(t.costPerSignupCents)}/signup), ${t.trials} trial starts (${$(t.costPerTrialCents)}/trial), ${t.paid} paid. Signup→trial rate ${(t.signupToTrialRate * 100).toFixed(1)}%. Data confidence: ${stats.confidence.toUpperCase()}.

BEST ADS (lowest estimated cost per trial):
${stats.top.map(creativeLine).join("\n") || "(none yet)"}

WORST ADS (highest estimated cost per trial):
${stats.bottom.map(creativeLine).join("\n") || "(none yet)"}

${dimTable("BY VALUE SURFACE", stats.byValueSurface)}

${dimTable("BY IMAGE FORMAT", stats.byFormat)}

${dimTable("BY CTA", stats.byCta)}

${dimTable("EXPLOIT vs EXPLORE (weekly-batch ads only)", stats.byStrategy.filter((d) => d.value !== "unknown"))}`.trim();
}

/**
 * Deterministic stats + one Claude call → stored AdLabLearning row.
 * Soft on the Claude step: if it fails the row still lands with brief=null
 * and the batch falls back to the raw stats.
 */
export async function runWeeklyLearning(groupKey: BatchGroupKey): Promise<{
  learningId: string;
  confidence: LearningStats["confidence"];
  trials: number;
  signups: number;
  briefOk: boolean;
}> {
  const stats = await buildLearningStats(groupKey);

  let brief: LearningBrief | null = null;
  if (stats.top.length > 0) {
    try {
      const raw = await callAdLabClaude({
        purpose: `learning-${groupKey}`,
        systemPrompt: `You are a senior performance-marketing analyst for Ripple, a voice-journaling / habit-tracking app sold on a 7-day free trial. You study our OWN Meta ad results and extract what drives TRIAL STARTS (not clicks — cheap clicks that never start a trial are a failure).

Rules:
- Ground every claim in the numbers given. Cite the evidence (spend, signups, trials) in each pattern.
- Respect sample size. With LOW confidence, frame patterns as directional hypotheses, not laws; never over-read a single trial.
- Compare winners vs losers on: hook/headline style, emotional register, specificity, value surface, image format, CTA, what the ad promises, and which pain it names.
- Old ads (May–July) ran under the former brand name "Acuity", against an older funnel and a $4.99 price; weight recent ads more when they disagree. Judge their STRUCTURE and angle, not surface details — never recommend the old name, recording-duration claims ("one minute", "60 seconds"), or fixed-time framing ("nightly", "9pm"); those are now banned.
- "doubleDown" and "avoid" must be concrete, copywriter-actionable instructions (e.g. "Open with a specific household moment in her words, not an abstract feeling"), not metrics.
- preferredFormats: rank the image format keys that performed best, best first (only keys that appear in the data; omit "legacy").

Return ONLY JSON: {"summary": string (3-5 sentences), "winningPatterns": [{"pattern": string, "evidence": string}], "losingPatterns": [{"pattern": string, "evidence": string}], "doubleDown": string[] (3-6), "avoid": string[] (3-6), "exploreNext": string[] (2-4 untested hypotheses worth a test), "preferredFormats": string[]}`,
        userPrompt: renderStatsForPrompt(stats),
        maxTokens: 6000,
      });
      brief = JSON.parse(extractJsonObject(raw)) as LearningBrief;
    } catch (err) {
      console.error(`[adlab-learning] ${groupKey} distill failed:`, err instanceof Error ? err.message : err);
    }
  }

  const row = await prisma.adLabLearning.create({
    data: {
      groupKey,
      creativeCount: stats.totals.creatives,
      spendCents: stats.totals.spendCents,
      signups: stats.totals.signups,
      trials: stats.totals.trials,
      stats: stats as unknown as Prisma.InputJsonValue,
      brief: (brief ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  return {
    learningId: row.id,
    confidence: stats.confidence,
    trials: stats.totals.trials,
    signups: stats.totals.signups,
    briefOk: !!brief,
  };
}

/** Freshest learning for the weekly batch, or null. */
export async function getLatestLearning(
  groupKey: BatchGroupKey
): Promise<{ stats: LearningStats; brief: LearningBrief | null; date: Date } | null> {
  const row = await prisma.adLabLearning.findFirst({
    where: {
      groupKey,
      date: { gte: new Date(Date.now() - LEARNING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: "desc" },
  });
  if (!row) return null;
  return {
    stats: row.stats as unknown as LearningStats,
    brief: (row.brief as unknown as LearningBrief | null) ?? null,
    date: row.date,
  };
}

/**
 * Prompt section injected into the weekly batch. Returns "" when there's no
 * usable history (first weeks) so the batch runs exactly as before.
 */
export function renderLearningForBatch(
  learning: { stats: LearningStats; brief: LearningBrief | null } | null
): { section: string; exploitCount: number } {
  if (!learning || learning.stats.top.length === 0) return { section: "", exploitCount: 0 };
  const { stats, brief } = learning;
  // Exploit share scales with confidence — never 100%: exploration is how
  // the next winner gets found.
  const exploitCount = stats.confidence === "high" ? 7 : stats.confidence === "medium" ? 6 : 4;

  const briefText = brief
    ? `ANALYST SUMMARY: ${brief.summary}

WHAT WON (with evidence):
${brief.winningPatterns.map((p) => `- ${p.pattern} (${p.evidence})`).join("\n")}

WHAT LOST (with evidence):
${brief.losingPatterns.map((p) => `- ${p.pattern} (${p.evidence})`).join("\n")}

DOUBLE DOWN ON:
${brief.doubleDown.map((d) => `- ${d}`).join("\n")}

AVOID:
${brief.avoid.map((d) => `- ${d}`).join("\n")}

WORTH TESTING NEXT:
${brief.exploreNext.map((d) => `- ${d}`).join("\n")}`
    : "";

  const section = `OUR OWN PERFORMANCE DATA — THE MOST IMPORTANT INPUT. The goal is TRIAL STARTS, not clicks. This is what our past ads actually produced:

${renderStatsForPrompt(stats)}

${briefText}

EXPLOIT / EXPLORE SPLIT (data confidence: ${stats.confidence.toUpperCase()}):
- Exactly ${exploitCount} ads are "exploit": apply the winning patterns above to this week's Reddit themes — same hook style / register / structure that won, new pain and new words. Never copy a past headline verbatim.
- The other ${10 - exploitCount} are "explore": deliberately test something the data hasn't proven yet (a new value surface, emotional register, format, or one of WORTH TESTING NEXT).
- No ad may use a pattern listed under AVOID / WHAT LOST.`;

  return { section, exploitCount };
}
