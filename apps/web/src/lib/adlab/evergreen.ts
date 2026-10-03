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

/** MAIN ad set daily budget per group, cents. 2026-09-30, per Keenan:
 *  "trim main ad sets to be $100 total again, with test ads at $30/day …
 *  $40 BWK $60 Ripple". Plus TEST_DAILY_BUDGET_CENTS ($15) per lane's test
 *  ad set = $130/day total. */
export const GROUP_DAILY_BUDGET_CENTS: Record<BatchGroupKey, number> = {
  // 2026-10-02, per Keenan: "raise [men] by 20 and lower womens by 20".
  // Men's lane ~$35/paid trial vs women ~$75 since 09-30 ("Fourth planner.
  // Still stuck." = 4 of the last 9 paid trials). Total stays $100 + $30 test.
  women: 4000,
  men: 6000,
};

/** 2026-09-30, per Keenan: "start to optimize for purchase". Was
 *  COMPLETE_REGISTRATION — Meta found signups (25 in 14 days) but only 5 of
 *  them paid. Purchase = the Stripe trial-start event (CAPI, with fbclid). */
export const GROUP_OPTIMIZATION_EVENT = "PURCHASE";

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

/**
 * Push the code's daily budget onto both live evergreen ad sets (2026-09-30)
 * and report what Meta now shows. Per-group results; one lane failing (e.g. Meta refusing
 * Purchase optimization) doesn't stop the other.
 */
export async function applyEvergreenSettings(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [groupKey, slug] of [["women", "ripple-women"], ["men", "ripple-men"]] as const) {
    const project = await prisma.adLabProject.findUnique({ where: { slug } });
    if (!project?.evergreenAdsetId || !project.metaPixelId) {
      out[groupKey] = { error: "no evergreen ad set / pixel" };
      continue;
    }
    const r: Record<string, unknown> = {};
    try {
      await meta.updateAdSetBudget(project.evergreenAdsetId, GROUP_DAILY_BUDGET_CENTS[groupKey]);
      r.budget = "ok";
    } catch (err) {
      r.budget = err instanceof Error ? err.message : String(err);
    }
    // The optimization event can't be edited on a published ad set (Meta
    // 100/3260011) — changing it is migrateEvergreenOptimization's job.
    r.now = await meta.getAdSetSettings(project.evergreenAdsetId).catch((err) => String(err));
    out[groupKey] = r;
  }
  return out;
}

/**
 * Move a lane onto a Purchase-optimized ad set (2026-09-30, per Keenan:
 * "start to optimize for purchase"). Meta refuses to change a published ad
 * set's conversion event ("create a new ad set"), so this:
 *   1. copies the old ad set's exact targeting/attribution into a new ad set
 *      in the same campaign, optimizing for GROUP_OPTIMIZATION_EVENT;
 *   2. re-creates every ad Meta shows as ACTIVE in the old ad set inside the
 *      new one, reusing the same Meta creative (same asset, copy and
 *      utm_content link, so attribution by creative is unchanged);
 *   3. activates the new ad set, THEN pauses the old one (never both off);
 *   4. points the project + AdLabAd rows at the new ad set (old rows paused
 *      with a reason, so their history stays).
 * Idempotent: a lane already on the target event is skipped.
 */
export async function migrateEvergreenOptimization(groupKey: BatchGroupKey): Promise<Record<string, unknown>> {
  const slug = groupKey === "women" ? "ripple-women" : "ripple-men";
  const project = await prisma.adLabProject.findUniqueOrThrow({ where: { slug } });
  const oldId = project.evergreenAdsetId;
  if (!oldId || !project.metaPixelId) return { error: "no evergreen ad set / pixel" };
  const old = await meta.metaGraph(oldId, "GET", {
    fields: "name,campaign_id,targeting,promoted_object,attribution_spec,effective_status",
  });
  const promoted = old.promoted_object as { custom_event_type?: string } | undefined;
  if (promoted?.custom_event_type === GROUP_OPTIMIZATION_EVENT) return { skipped: `already ${GROUP_OPTIMIZATION_EVENT}`, adsetId: oldId };

  // 1. New ad set, same targeting, Purchase optimization, paused for now.
  const created = await meta.metaGraph(`${meta.adAccountPath()}/adsets`, "POST", {
    name: `${GROUP_NAMES[groupKey].replace("(signups)", "(purchase)")} | ad set`,
    campaign_id: old.campaign_id as string,
    daily_budget: String(GROUP_DAILY_BUDGET_CENTS[groupKey]),
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: project.metaPixelId, custom_event_type: GROUP_OPTIMIZATION_EVENT },
    targeting: old.targeting,
    ...(old.attribution_spec ? { attribution_spec: old.attribution_spec } : {}),
    status: "PAUSED",
  });
  const newId = created.id as string;

  // 2. Copy every running ad.
  const list = await meta.metaGraph(`${oldId}/ads`, "GET", { fields: "id,name,effective_status,creative{id}", limit: "100" });
  const running = ((list.data as { id: string; name: string; effective_status: string; creative?: { id: string } }[]) ?? []).filter(
    (a) => a.effective_status === "ACTIVE" && a.creative?.id
  );
  const moved: { from: string; to: string }[] = [];
  const failed: { ad: string; error: string }[] = [];
  for (const a of running) {
    try {
      const ad = await meta.metaGraph(`${meta.adAccountPath()}/ads`, "POST", {
        name: a.name,
        adset_id: newId,
        creative: { creative_id: a.creative!.id },
        status: "ACTIVE",
      });
      const newAdId = ad.id as string;
      moved.push({ from: a.id, to: newAdId });
      const row = await prisma.adLabAd.findFirst({ where: { metaAdId: a.id } });
      if (row) {
        await prisma.adLabAd.create({
          data: {
            creativeId: row.creativeId,
            metaCampaignId: old.campaign_id as string,
            metaAdsetId: newId,
            metaAdId: newAdId,
            status: "live",
            launchedAt: new Date(),
            dailyBudgetCents: GROUP_DAILY_BUDGET_CENTS[groupKey],
          },
        });
        await prisma.adLabAd.update({
          where: { id: row.id },
          data: { status: "paused", decisionReason: `Moved to the ${GROUP_OPTIMIZATION_EVENT}-optimized ad set ${newId} as ad ${newAdId} (2026-09-30)` },
        });
      }
    } catch (err) {
      failed.push({ ad: a.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (moved.length === 0) {
    // Nothing made it across — leave the old ad set running untouched.
    return { error: "no ads could be copied; old ad set left running", newAdsetId: newId, failed };
  }

  // 3. New on, then old off.
  await meta.metaGraph(newId, "POST", { status: "ACTIVE" });
  await meta.metaGraph(oldId, "POST", { status: "PAUSED" });

  // 4. Point the lane at the new ad set.
  await prisma.adLabProject.update({ where: { id: project.id }, data: { evergreenAdsetId: newId } });
  return { oldAdsetId: oldId, newAdsetId: newId, moved: moved.length, of: running.length, failed };
}

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
 *   WINNER      >=1 paid trial at <= $50 per paid trial (2026-10-01; was
 *               "any paid trial or 3+ cheap signups"). Never paused.
 *   NOT WORKING >= $100 spent at > $100 per paid trial (or none), OR the
 *               early signals, judged after >= $15 spent AND >= 72h live:
 *               >= $20 spent with 0 signups, OR cost per signup > $40, OR
 *               link CTR < 0.5% over >= 1,500 impressions with 0 signups.
 *               Paused.
 *   KEEP        everything else, including ads too new to judge.
 * Signups = the higher of Meta-reported conversions and our own
 * funnel_account_created sessions for the ad (utm_content = creative id).
 * The ad set can run over MAX_ACTIVE_ADS; that's a signal to upload fewer.
 * Status is written to the DB only after Meta confirms the pause.
 */
/**
 * Winner = paying customers, not signups (2026-10-01, per Keenan: "paid
 * trials should be $50 or less"). "Two years of noticing" was a 'winner'
 * on 12 cheap signups while costing ~$200 per paid trial, and the old rule
 * made it unpausable.
 *   winner       ≥1 paid trial at ≤ $50 per paid trial
 *   not working  ≥ $100 spent at > $100 per paid trial (or no paid trial)
 * The early signals below (no signups, $40+ per signup, low CTR) still stop
 * obvious duds before they reach $100.
 */
const WINNER_MAX_COST_PER_TRIAL_CENTS = 5000;
const EXPENSIVE_MIN_SPEND_CENTS = 10000;
const EXPENSIVE_COST_PER_TRIAL_CENTS = 10000;
const JUDGE_MIN_SPEND_CENTS = 1500;
const JUDGE_MIN_HOURS = 72;
const DEAD_SPEND_CENTS = 2000;
const BAD_CPL_CENTS = 4000;
const LOW_CTR_PCT = 0.5;
const LOW_CTR_MIN_IMPRESSIONS = 1500;

export type AdVerdict = "winner" | "not_working" | "keep";

export interface CreativeJudgement {
  verdict: AdVerdict;
  reason: string;
  spendCents: number;
  signups: number;
  trials: number;
  impressions: number;
}

/**
 * Verdict per creative (2026-09-30: aggregated across ALL of a creative's
 * AdLabAd rows — the Purchase migration and test→main graduation give one
 * creative several Meta ads, and judging only the newest row would wipe its
 * history). Signups = the higher of Meta-reported conversions and our own
 * funnel_account_created sessions; trials = our funnel_payment_completed
 * (first payments, not renewals), matched on utm_content = creative id.
 */
export async function judgeCreatives(creativeIds: string[]): Promise<Map<string, CreativeJudgement>> {
  const out = new Map<string, CreativeJudgement>();
  if (creativeIds.length === 0) return out;
  const rows = await prisma.adLabAd.findMany({
    where: { creativeId: { in: creativeIds } },
    select: { creativeId: true, launchedAt: true, metrics: { select: { spendCents: true, impressions: true, clicks: true, conversions: true } } },
  });
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
  const $ = (c: number) => `$${(c / 100).toFixed(2)}`;
  for (const id of creativeIds) {
    const mine = rows.filter((r) => r.creativeId === id);
    const ms = mine.flatMap((r) => r.metrics);
    const spend = ms.reduce((n, m) => n + m.spendCents, 0);
    const imps = ms.reduce((n, m) => n + m.impressions, 0);
    const clicks = ms.reduce((n, m) => n + m.clicks, 0);
    const metaConv = ms.reduce((n, m) => n + m.conversions, 0);
    const o = ours.get(id);
    const signups = Math.max(metaConv, o?.accounts.size ?? 0);
    const trials = o?.trials.size ?? 0;
    const first = mine.map((r) => r.launchedAt?.getTime() ?? now).reduce((a, b) => Math.min(a, b), now);
    const hours = (now - first) / 3_600_000;
    const ctr = imps > 0 ? (clicks / imps) * 100 : 0;
    const summary = `${signups} signups, ${trials} trials, ${$(spend)} spent, ${ctr.toFixed(2)}% CTR over ${imps} impressions`;
    let verdict: AdVerdict = "keep";
    let why = "not enough evidence yet";
    const perTrial = trials > 0 ? spend / trials : Infinity;
    if (trials > 0 && perTrial <= WINNER_MAX_COST_PER_TRIAL_CENTS) {
      verdict = "winner";
      why = `${trials} paid trial${trials > 1 ? "s" : ""} at ${$(perTrial)} each`;
    } else if (spend >= EXPENSIVE_MIN_SPEND_CENTS && perTrial > EXPENSIVE_COST_PER_TRIAL_CENTS) {
      verdict = "not_working";
      why = trials > 0 ? `${$(perTrial)} per paid trial (over $100)` : `${$(spend)} spent with no paid trial`;
    } else if (spend >= JUDGE_MIN_SPEND_CENTS && hours >= JUDGE_MIN_HOURS) {
      if (signups === 0 && spend >= DEAD_SPEND_CENTS) { verdict = "not_working"; why = `${$(spend)} spent with no signups`; }
      else if (signups > 0 && spend / signups > BAD_CPL_CENTS) { verdict = "not_working"; why = `${$(spend / signups)} per signup (over $40)`; }
      else if (signups === 0 && imps >= LOW_CTR_MIN_IMPRESSIONS && ctr < LOW_CTR_PCT) { verdict = "not_working"; why = `${ctr.toFixed(2)}% click rate, no signups`; }
      else why = "working well enough to keep";
    }
    out.set(id, { verdict, reason: `${why} (${summary})`, spendCents: spend, signups, trials, impressions: imps });
  }
  return out;
}

async function pauseAd(ad: { id: string; metaAdId: string | null }, status: "paused" | "killed", reason: string, decision: "kill" | "maintain" = "kill") {
  if (ad.metaAdId) await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
  await prisma.adLabAd.update({ where: { id: ad.id }, data: { status, decisionReason: reason } });
  await prisma.adLabDecision.create({ data: { adId: ad.id, decisionType: decision, rationale: reason } }).catch(() => {});
}

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
    select: { id: true, metaAdId: true, creativeId: true },
  });
  if (live.length === 0) return { retired: [], failed: [], audit: [] };
  const judged = await judgeCreatives([...new Set(live.map((a) => a.creativeId))]);
  const audit = live.map((ad) => ({ ad, ...judged.get(ad.creativeId)! }));

  const retired: Array<{ adId: string; reason: string }> = [];
  const failed: string[] = [];
  for (const r of audit.filter((x) => x.verdict === "not_working")) {
    const reason = `AUDIT on new upload: not working — ${r.reason}.`;
    try {
      await pauseAd(r.ad, "killed", reason);
      retired.push({ adId: r.ad.id, reason });
    } catch (err) {
      console.error(`[adlab-evergreen] failed to pause ${r.ad.metaAdId}:`, err);
      failed.push(r.ad.id);
    }
  }
  return { retired, failed, audit: audit.map((r) => ({ adId: r.ad.id, verdict: r.verdict, reason: r.reason })) };
}

// ─── Test ad set + graduation (2026-09-30, per Keenan: "add a $15/day test
// ad set per lane and for the week leading up to it, which caps the main ad
// set to 8 live ads and then tests from the micro ad set") ─────────────────
//
// Each lane's campaign has two ad sets:
//   MAIN  the proven ads, capped at MAX_ACTIVE_ADS (8) live. Winners are
//         never paused for room; only non-winners give way.
//   TEST  $15/day. Each week's approved ads launch HERE, so a new idea gets
//         spend of its own instead of starving next to the current favourite.
// After TEST_DAYS in test (checked daily by the cron): a winner is copied
// into MAIN (same Meta creative) and stopped in test; anything else is
// stopped ("didn't prove itself"). Ads clearly not working stop earlier via
// the normal audit. Both ad sets optimize for GROUP_OPTIMIZATION_EVENT.
// The test ad set is found by name inside the lane's campaign (no schema
// column), created on first use with the main ad set's exact targeting.

/** Per lane: $15 × 2 lanes = the $30/day test budget. */
export const TEST_DAILY_BUDGET_CENTS = 1500;
export const TEST_DAYS = 7;
const TEST_SUFFIX = "| test ad set";

async function laneProject(groupKey: BatchGroupKey) {
  return prisma.adLabProject.findUniqueOrThrow({ where: { slug: groupKey === "women" ? "ripple-women" : "ripple-men" } });
}

/** The lane's test ad set id, created (ACTIVE, $15/day) if missing. */
export async function ensureTestAdSet(groupKey: BatchGroupKey): Promise<{ campaignId: string; adsetId: string; created: boolean }> {
  const project = await laneProject(groupKey);
  if (!project.evergreenCampaignId || !project.evergreenAdsetId || !project.metaPixelId) {
    throw new Error(`${groupKey}: no evergreen campaign/ad set yet`);
  }
  const list = await meta.metaGraph(`${project.evergreenCampaignId}/adsets`, "GET", { fields: "id,name,effective_status", limit: "50" });
  const found = ((list.data as { id: string; name: string; effective_status: string }[]) ?? []).find(
    (a) => a.name.endsWith(TEST_SUFFIX) && !["DELETED", "ARCHIVED"].includes(a.effective_status)
  );
  if (found) {
    if (found.effective_status !== "ACTIVE") await meta.metaGraph(found.id, "POST", { status: "ACTIVE" });
    return { campaignId: project.evergreenCampaignId, adsetId: found.id, created: false };
  }
  const main = await meta.metaGraph(project.evergreenAdsetId, "GET", { fields: "targeting,attribution_spec" });
  const created = await meta.metaGraph(`${meta.adAccountPath()}/adsets`, "POST", {
    name: `${GROUP_NAMES[groupKey].replace("(signups)", "(purchase)")} ${TEST_SUFFIX}`,
    campaign_id: project.evergreenCampaignId,
    daily_budget: String(TEST_DAILY_BUDGET_CENTS),
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: project.metaPixelId, custom_event_type: GROUP_OPTIMIZATION_EVENT },
    targeting: main.targeting,
    ...(main.attribution_spec ? { attribution_spec: main.attribution_spec } : {}),
    status: "ACTIVE",
  });
  return { campaignId: project.evergreenCampaignId, adsetId: created.id as string, created: true };
}

/**
 * Bring MAIN down to MAX_ACTIVE_ADS: pause non-winners, weakest first —
 * not-working, then repeated headlines (Meta treats near-copies as one ad),
 * then the ones Meta gives the least spend. Winners are never paused.
 */
export async function trimMainAdSet(groupKey: BatchGroupKey): Promise<{ paused: { headline: string; reason: string }[]; live: number }> {
  const project = await laneProject(groupKey);
  if (!project.evergreenAdsetId) return { paused: [], live: 0 };
  const live = await prisma.adLabAd.findMany({
    where: { metaAdsetId: project.evergreenAdsetId, status: { in: ["live", "scaled"] } },
    select: { id: true, metaAdId: true, creativeId: true, creative: { select: { headline: true } } },
  });
  if (live.length <= MAX_ACTIVE_ADS) return { paused: [], live: live.length };
  const judged = await judgeCreatives([...new Set(live.map((a) => a.creativeId))]);
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const seen = new Map<string, number>();
  const ranked = live
    .map((a) => ({ a, j: judged.get(a.creativeId)! }))
    .sort((x, y) => (y.j.trials - x.j.trials) || (y.j.signups - x.j.signups) || (y.j.spendCents - x.j.spendCents));
  const order = ranked.map(({ a, j }) => {
    const k = norm(a.creative.headline);
    const dup = (seen.get(k) ?? 0) > 0;
    seen.set(k, (seen.get(k) ?? 0) + 1);
    const weakness = j.verdict === "winner" ? -1 : j.verdict === "not_working" ? 3 : dup ? 2 : 1;
    return { a, j, dup, weakness };
  });
  // Weakest first; within a tier, least spend (Meta's own vote) first.
  const candidates = order
    .filter((x) => x.weakness >= 1)
    .sort((x, y) => (y.weakness - x.weakness) || (x.j.spendCents - y.j.spendCents));
  const paused: { headline: string; reason: string }[] = [];
  let count = live.length;
  for (const c of candidates) {
    if (count <= MAX_ACTIVE_ADS) break;
    const why = c.j.verdict === "not_working" ? `not working — ${c.j.reason}` : c.dup ? `duplicate of a live ad with the same headline (${c.j.reason})` : `main ad set capped at ${MAX_ACTIVE_ADS}; lowest spend share (${c.j.reason})`;
    try {
      await pauseAd(c.a, "paused", `MAIN CAP (2026-09-30): ${why}`, "maintain");
      paused.push({ headline: c.a.creative.headline, reason: why });
      count--;
    } catch (err) {
      console.error(`[adlab-evergreen] trim pause failed ${c.a.metaAdId}:`, err);
    }
  }
  return { paused, live: count };
}

/**
 * Put an existing creative into its lane's test ad set for a fresh test week
 * (2026-09-30: two video ads launched straight into MAIN were capped out
 * after ~12h with almost no spend — they deserve a fair week in TEST).
 * Reuses the creative's Meta creative from its most recent ad.
 */
export async function sendToTest(groupKey: BatchGroupKey, creativeId: string): Promise<string> {
  const test = await ensureTestAdSet(groupKey);
  const last = await prisma.adLabAd.findFirst({ where: { creativeId, metaAdId: { not: null } }, orderBy: { launchedAt: "desc" } });
  if (!last?.metaAdId) throw new Error(`no Meta ad for creative ${creativeId}`);
  const src = await meta.metaGraph(last.metaAdId, "GET", { fields: "name,creative{id}" });
  const metaCreative = (src.creative as { id?: string } | undefined)?.id;
  if (!metaCreative) throw new Error("no Meta creative");
  const made = await meta.metaGraph(`${meta.adAccountPath()}/ads`, "POST", {
    name: String(src.name ?? creativeId),
    adset_id: test.adsetId,
    creative: { creative_id: metaCreative },
    status: "ACTIVE",
  });
  await prisma.adLabAd.create({
    data: { creativeId, metaCampaignId: test.campaignId, metaAdsetId: test.adsetId, metaAdId: made.id as string, status: "live", launchedAt: new Date(), dailyBudgetCents: TEST_DAILY_BUDGET_CENTS },
  });
  return made.id as string;
}

/**
 * Daily: finish test weeks. Winners move from TEST to MAIN (same Meta
 * creative), everything else that has had its week stops. Then MAIN is
 * re-capped. Ads still inside their week are left alone (the normal audit
 * still stops ones clearly not working).
 */
export async function graduateTestAds(groupKey: BatchGroupKey): Promise<Record<string, unknown>> {
  const project = await laneProject(groupKey);
  if (!project.evergreenAdsetId || !project.evergreenCampaignId) return { skipped: "no evergreen ad set" };
  const test = await ensureTestAdSet(groupKey).catch((err) => ({ error: String(err) }));
  if ("error" in test) return { error: test.error };
  const inTest = await prisma.adLabAd.findMany({
    where: { metaAdsetId: test.adsetId, status: { in: ["live", "scaled"] } },
    select: { id: true, metaAdId: true, creativeId: true, launchedAt: true, creative: { select: { headline: true } } },
  });
  const due = inTest.filter((a) => a.launchedAt && Date.now() - a.launchedAt.getTime() >= TEST_DAYS * 86_400_000);
  const judged = await judgeCreatives([...new Set(due.map((a) => a.creativeId))]);
  const graduated: string[] = [];
  const stopped: string[] = [];
  for (const a of due) {
    const j = judged.get(a.creativeId)!;
    try {
      if (j.verdict === "winner" && a.metaAdId) {
        const src = await meta.metaGraph(a.metaAdId, "GET", { fields: "name,creative{id}" });
        const creativeId = (src.creative as { id?: string } | undefined)?.id;
        if (!creativeId) throw new Error("no Meta creative on test ad");
        const made = await meta.metaGraph(`${meta.adAccountPath()}/ads`, "POST", {
          name: String(src.name ?? a.creative.headline),
          adset_id: project.evergreenAdsetId,
          creative: { creative_id: creativeId },
          status: "ACTIVE",
        });
        await prisma.adLabAd.create({
          data: {
            creativeId: a.creativeId,
            metaCampaignId: project.evergreenCampaignId,
            metaAdsetId: project.evergreenAdsetId,
            metaAdId: made.id as string,
            status: "live",
            launchedAt: new Date(),
            dailyBudgetCents: GROUP_DAILY_BUDGET_CENTS[groupKey],
          },
        });
        await pauseAd(a, "paused", `GRADUATED to main ad set after its test week: ${j.reason}`, "maintain");
        graduated.push(`${a.creative.headline} — ${j.reason}`);
      } else {
        await pauseAd(a, "killed", `TEST WEEK over, didn't prove itself: ${j.reason}`);
        stopped.push(`${a.creative.headline} — ${j.reason}`);
      }
    } catch (err) {
      console.error(`[adlab-evergreen] graduation failed for ${a.metaAdId}:`, err);
    }
  }
  const trim = await trimMainAdSet(groupKey);
  return { testAdsetId: test.adsetId, inTest: inTest.length - due.length, graduated, stopped, mainTrim: trim };
}

/** All evergreen ad set ids — the engine must never raise their budgets. */
export async function evergreenAdsetIds(): Promise<Set<string>> {
  const rows = await prisma.adLabProject.findMany({
    where: { evergreenAdsetId: { not: null } },
    select: { evergreenAdsetId: true },
  });
  return new Set(rows.map((r) => r.evergreenAdsetId!));
}
