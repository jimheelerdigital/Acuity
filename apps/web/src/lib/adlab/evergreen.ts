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

/** Daily budget per group, cents. Total = $100/day. */
export const GROUP_DAILY_BUDGET_CENTS: Record<BatchGroupKey, number> = {
  women: 6000,
  men: 4000,
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
 * Pause the weakest live ads in the ad set so `incoming` new ads fit under
 * MAX_ACTIVE_ADS.
 *
 * 2026-09-28 fix (per Keenan: "nothing has been cut yet"). The 09-27 rotation
 * retired the proven winners ("Two years of noticing": 8 signups on $107;
 * two BWK ads that each produced a PAID trial) because it ranked by raw
 * Meta signups per dollar, where 1 signup on $10 beats 8 on $107. Now:
 *   - PROTECTED, never retired: an ad that produced a paid trial in our own
 *     funnel data, or has >=3 signups at <= $25 each (Meta-reported or ours,
 *     whichever is higher).
 *   - The rest rank by a smoothed rate, (signups + 0.5) / (spend + $15), so
 *     a lucky tiny spend can't outrank a proven one.
 *   - If there aren't enough unprotected ads to make room, the ad set runs
 *     over the cap rather than losing a winner.
 * Ads still inside their first 72h are only retired if nothing older is
 * left. Status is written to the DB only after Meta confirms the pause.
 */
const PROTECT_MIN_SIGNUPS = 3;
const PROTECT_MAX_CPL_CENTS = 2500;

export async function makeRoomInAdSet(
  adsetId: string,
  incoming: number
): Promise<{ retired: Array<{ adId: string; reason: string }>; failed: string[]; protectedCount: number }> {
  const live = await prisma.adLabAd.findMany({
    where: { metaAdsetId: adsetId, status: { in: ["live", "scaled"] } },
    include: { metrics: true },
  });
  const excess = live.length + incoming - MAX_ACTIVE_ADS;
  if (excess <= 0) return { retired: [], failed: [], protectedCount: 0 };

  // Our own funnel outcomes per creative (utm_content = creative id).
  const creativeIds = live.map((a) => a.creativeId);
  const ev = await prisma.onboardingEvent.findMany({
    where: { utmContent: { in: creativeIds }, isBot: false, event: { in: ["funnel_account_created", "funnel_payment_completed"] } },
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
  const scored = live.map((ad) => {
    const spend = ad.metrics.reduce((n, m) => n + m.spendCents, 0);
    const metaConv = ad.metrics.reduce((n, m) => n + m.conversions, 0);
    const o = ours.get(ad.creativeId);
    const signups = Math.max(metaConv, o?.accounts.size ?? 0);
    const trials = o?.trials.size ?? 0;
    const young = !!ad.launchedAt && now - ad.launchedAt.getTime() < MIN_HOURS_BEFORE_RETIRE * 3_600_000;
    const isWinner = trials > 0 || (signups >= PROTECT_MIN_SIGNUPS && spend / signups <= PROTECT_MAX_CPL_CENTS);
    return { ad, spend, conv: signups, trials, young, isWinner, rate: (signups + 0.5) / (spend + 1500) };
  });
  const protectedCount = scored.filter((r) => r.isWinner).length;
  const ranked = scored
    .filter((r) => !r.isWinner)
    .sort((a, b) => Number(a.young) - Number(b.young) || a.rate - b.rate || b.spend - a.spend);

  const retired: Array<{ adId: string; reason: string }> = [];
  const failed: string[] = [];
  for (const r of ranked.slice(0, excess)) {
    const reason = `ROTATE: retired to make room for this week's ads — ${r.conv} signups, ${r.trials} trials on $${(r.spend / 100).toFixed(2)} lifetime.`;
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
  if (ranked.length < excess) {
    console.warn(`[adlab-evergreen] ${adsetId}: ${protectedCount} protected winners — running ${excess - ranked.length} over MAX_ACTIVE_ADS rather than retiring one`);
  }
  return { retired, failed, protectedCount };
}

/** All evergreen ad set ids — the engine must never raise their budgets. */
export async function evergreenAdsetIds(): Promise<Set<string>> {
  const rows = await prisma.adLabProject.findMany({
    where: { evergreenAdsetId: { not: null } },
    select: { evergreenAdsetId: true },
  });
  return new Set(rows.map((r) => r.evergreenAdsetId!));
}
