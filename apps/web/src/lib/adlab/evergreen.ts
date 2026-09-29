/**
 * Evergreen campaign structure for the weekly batch (2026-09-24, per Keenan).
 *
 * Before: every weekly batch launched a NEW traffic campaign optimizing for
 * link clicks, with its own budget. Nothing retired last week's, so spend
 * silently stacked, and Meta's learning reset every week.
 *
 * Now, one permanent campaign + ad set per audience group:
 *   - optimizes for signups (OFFSITE_CONVERSIONS on the pixel's
 *     CompleteRegistration). Trial starts are the real goal, but Meta needs
 *     ~50 events/week per ad set to optimize on one; at current volume
 *     that's only reachable for signups. Switch GROUP_OPTIMIZATION_EVENT to
 *     START_TRIAL once the server-side trial signal ships and volume allows
 *     (a new ad set is needed — Meta locks promoted_object after launch).
 *   - fixed daily budget per group → total spend is capped by construction.
 *   - each week's approved ads are ADDED to the ad set; when that would push
 *     it past MAX_ACTIVE_ADS, the weakest live ads are paused first.
 *
 * Budgets live here (code) on purpose: a spend change is a reviewed commit.
 */

import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import type { BatchGroupKey } from "@/lib/adlab/weekly-batch";

/** Daily budget per group, cents. Total = $140/day (2026-09-29, per Keenan:
 *  "let's up our spend an extra 20 for each" — women $60→$80, men $40→$60). */
export const GROUP_DAILY_BUDGET_CENTS: Record<BatchGroupKey, number> = {
  women: 8000,
  men: 6000,
};

export const GROUP_OPTIMIZATION_EVENT = "COMPLETE_REGISTRATION";

/**
 * Live ads allowed in one ad set. More than this splits $40–60/day too thin
 * for any ad to reach a decision.
 */
export const MAX_ACTIVE_ADS = 8;

/** Ads younger than this aren't retired to make room (still in learning). */
const MIN_HOURS_BEFORE_RETIRE = 72;

const GROUP_NAMES: Record<BatchGroupKey, string> = {
  women: "Ripple — Women | Evergreen (signups)",
  men: "Ripple — Men | Evergreen (signups)",
};

/** Weekly-batch experiments carry their group as a campaign tag. */
export function weeklyBatchGroup(campaignTags: string[]): BatchGroupKey | null {
  if (!campaignTags.includes("weekly-reddit-batch")) return null;
  if (campaignTags.includes("women")) return "women";
  if (campaignTags.includes("men")) return "men";
  return null;
}

/**
 * Return the group's evergreen campaign + ad set, creating them (PAUSED) if
 * missing or gone from Meta. Re-asserts the ad set's budget to the code
 * value every launch, so a manual Ads Manager change can't silently stick.
 */
export async function ensureEvergreenAdSet(
  groupKey: BatchGroupKey,
  projectId: string
): Promise<{ campaignId: string; adsetId: string; created: boolean }> {
  const project = await prisma.adLabProject.findUniqueOrThrow({ where: { id: projectId } });
  const budget = GROUP_DAILY_BUDGET_CENTS[groupKey];

  if (project.evergreenCampaignId && project.evergreenAdsetId) {
    const check = await meta.verifyObjectOnMeta(project.evergreenAdsetId, "adset");
    if (check.exists && check.status !== "DELETED" && check.status !== "ARCHIVED") {
      await meta.updateAdSetBudget(project.evergreenAdsetId, budget);
      return { campaignId: project.evergreenCampaignId, adsetId: project.evergreenAdsetId, created: false };
    }
    console.warn(
      `[adlab-evergreen] ${groupKey} ad set ${project.evergreenAdsetId} unusable (${check.status ?? check.error}) — recreating`
    );
  }

  if (!project.metaPixelId) throw new Error(`Project ${project.slug} has no metaPixelId`);
  const audience = project.targetAudience as Record<string, unknown>;

  const campaignId = await meta.createCampaign({ name: GROUP_NAMES[groupKey], objective: "OUTCOME_SALES" });
  let adsetId: string;
  try {
    adsetId = await meta.createAdSet({
      campaignId,
      name: `${GROUP_NAMES[groupKey]} | ad set`,
      dailyBudgetCents: budget,
      optimizationGoal: "OFFSITE_CONVERSIONS",
      pixelId: project.metaPixelId,
      conversionEvent: GROUP_OPTIMIZATION_EVENT,
      targetAudience: {
        ageMin: (audience.ageMin as number) || 25,
        ageMax: (audience.ageMax as number) || 55,
        geo: (audience.geo as string[]) || ["US"],
      },
    });
  } catch (err) {
    try {
      await meta.deleteCampaign(campaignId);
    } catch {}
    throw err;
  }

  await prisma.adLabProject.update({
    where: { id: projectId },
    data: { evergreenCampaignId: campaignId, evergreenAdsetId: adsetId },
  });
  return { campaignId, adsetId, created: true };
}

/**
 * Audit the ad set's live ads when a new batch is uploaded (2026-09-28, per
 * Keenan: "when we upload new ads we should never pause old winning ads ...
 * audit the other ads to see which were working versus not and pause the
 * ones that weren't working").
 *
 * No ad is paused just to make room. Each live ad gets a verdict:
 *   WINNER      a paid trial in our funnel data, or >=3 signups at <= $25
 *               each. Never paused.
 *   NOT WORKING judged only with evidence (>= $15 spent AND >= 72h live):
 *               >= $20 spent with 0 signups, OR cost per signup > $40, OR
 *               link CTR < 0.5% over >= 1,500 impressions with 0 signups.
 *               Paused.
 *   KEEP        everything else, including ads too new to judge.
 * Signups = the higher of Meta-reported conversions and our own
 * funnel_account_created sessions for the ad (utm_content = creative id).
 * The ad set can run over MAX_ACTIVE_ADS; that's a signal to upload fewer.
 * Status is written to the DB only after Meta confirms the pause.
 */
const WINNER_MIN_SIGNUPS = 3;
const WINNER_MAX_CPL_CENTS = 2500;
const JUDGE_MIN_SPEND_CENTS = 1500;
const JUDGE_MIN_HOURS = 72;
const DEAD_SPEND_CENTS = 2000;
const BAD_CPL_CENTS = 4000;
const LOW_CTR_PCT = 0.5;
const LOW_CTR_MIN_IMPRESSIONS = 1500;

export type AdVerdict = "winner" | "not_working" | "keep";

export async function makeRoomInAdSet(
  adsetId: string,
  _incoming: number
): Promise<{
  retired: Array<{ adId: string; reason: string }>;
  failed: string[];
  audit: Array<{ adId: string; verdict: AdVerdict; reason: string }>;
}> {
  const live = await prisma.adLabAd.findMany({
    where: { metaAdsetId: adsetId, status: { in: ["live", "scaled"] } },
    include: { metrics: true },
  });
  if (live.length === 0) return { retired: [], failed: [], audit: [] };

  const ev = await prisma.onboardingEvent.findMany({
    where: { utmContent: { in: live.map((a) => a.creativeId) }, isBot: false, event: { in: ["funnel_account_created", "funnel_payment_completed"] } },
    select: { utmContent: true, event: true, sessionToken: true, value: true },
  });
  const ours = new Map<string, { accounts: Set<string>; trials: Set<string> }>();
  for (const e of ev) {
    const o = ours.get(e.utmContent!) ?? { accounts: new Set(), trials: new Set() };
    const key = e.sessionToken ?? "";
    if (e.event === "funnel_account_created") o.accounts.add(key);
    if (e.event === "funnel_payment_completed" && !(e.value ?? "").endsWith(":renewal")) o.trials.add(key);
    ours.set(e.utmContent!, o);
  }

  const now = Date.now();
  const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
  const audit = live.map((ad) => {
    const spend = ad.metrics.reduce((n, m) => n + m.spendCents, 0);
    const imps = ad.metrics.reduce((n, m) => n + m.impressions, 0);
    const clicks = ad.metrics.reduce((n, m) => n + m.clicks, 0);
    const metaConv = ad.metrics.reduce((n, m) => n + m.conversions, 0);
    const o = ours.get(ad.creativeId);
    const signups = Math.max(metaConv, o?.accounts.size ?? 0);
    const trials = o?.trials.size ?? 0;
    const hours = ad.launchedAt ? (now - ad.launchedAt.getTime()) / 3_600_000 : 0;
    const ctr = imps > 0 ? (clicks / imps) * 100 : 0;
    const summary = `${signups} signups, ${trials} trials, ${$(spend)} spent, ${ctr.toFixed(2)}% CTR over ${imps} impressions`;

    let verdict: AdVerdict = "keep";
    let why = "not enough evidence yet";
    if (trials > 0 || (signups >= WINNER_MIN_SIGNUPS && spend / signups <= WINNER_MAX_CPL_CENTS)) {
      verdict = "winner";
      why = trials > 0 ? "produced a paid trial" : `${signups} signups at ${$(spend / signups)} each`;
    } else if (spend >= JUDGE_MIN_SPEND_CENTS && hours >= JUDGE_MIN_HOURS) {
      if (signups === 0 && spend >= DEAD_SPEND_CENTS) { verdict = "not_working"; why = `${$(spend)} spent with no signups`; }
      else if (signups > 0 && spend / signups > BAD_CPL_CENTS) { verdict = "not_working"; why = `${$(spend / signups)} per signup (over $40)`; }
      else if (signups === 0 && imps >= LOW_CTR_MIN_IMPRESSIONS && ctr < LOW_CTR_PCT) { verdict = "not_working"; why = `${ctr.toFixed(2)}% click rate, no signups`; }
      else why = "working well enough to keep";
    }
    return { ad, verdict, reason: `${why} (${summary})` };
  });

  const retired: Array<{ adId: string; reason: string }> = [];
  const failed: string[] = [];
  for (const r of audit.filter((x) => x.verdict === "not_working")) {
    const reason = `AUDIT on new upload: not working — ${r.reason}.`;
    try {
      if (r.ad.metaAdId) await meta.setStatus(r.ad.metaAdId, "ad", "PAUSED");
      await prisma.adLabAd.update({ where: { id: r.ad.id }, data: { status: "killed", decisionReason: reason } });
      await prisma.adLabDecision.create({ data: { adId: r.ad.id, decisionType: "kill", rationale: reason } });
      retired.push({ adId: r.ad.id, reason });
    } catch (err) {
      console.error(`[adlab-evergreen] failed to pause ${r.ad.metaAdId}:`, err);
      failed.push(r.ad.id);
    }
  }
  const stillLive = live.length - retired.length;
  if (stillLive + _incoming > MAX_ACTIVE_ADS) {
    console.warn(`[adlab-evergreen] ${adsetId}: ${stillLive + _incoming} live ads after upload (cap ${MAX_ACTIVE_ADS}) — nothing else was paused because the rest are winners or still being judged`);
  }
  return { retired, failed, audit: audit.map((r) => ({ adId: r.ad.id, verdict: r.verdict, reason: r.reason })) };
}

/** All evergreen ad set ids — the engine must never raise their budgets. */
export async function evergreenAdsetIds(): Promise<Set<string>> {
  const rows = await prisma.adLabProject.findMany({
    where: { evergreenAdsetId: { not: null } },
    select: { evergreenAdsetId: true },
  });
  return new Set(rows.map((r) => r.evergreenAdsetId!));
}
