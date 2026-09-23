/**
 * GET /api/admin/adlab/cron — daily metrics sync + decision engine.
 * Protected by CRON_SECRET. Runs at 09:00 UTC daily.
 *
 * 1. Sync a trailing 3-day window of metrics from Meta Insights API
 * 2. Run creative-level kill/scale/maintain decisions
 * 3. Run experiment-level conclusions
 * 4. Send daily summary email via Resend
 *
 * Thresholds retuned 2026-09-24 for the evergreen structure: $100/day
 * total ($60 women / $40 men), ad sets optimizing for signups
 * (CompleteRegistration), ≤8 live ads per ad set. "Conversions" = Meta-
 * reported registrations; "clicks" = LINK clicks (not likes/expands).
 * Trial starts are judged at the angle/format level by the weekly learning
 * loop (lib/adlab/learning.ts) — too rare to judge single ads on.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";
import { evergreenAdsetIds } from "@/lib/adlab/evergreen";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Thresholds (all in cents where applicable) ──────────────────────

// ── Decision switches (2026-09-23, per Keenan: "get it going") ──────
// KILLS are ON unless explicitly disabled — a kill only ever PAUSES
// spend, so the worst case is pausing a would-be winner early.
// AUTO-SCALE is opt-in — it's the only rule that INCREASES spend, so
// winners are flagged in the daily email for manual approval until
// ADLAB_AUTOSCALE_ENABLED=1 is set.
const DECISIONS_ENABLED = process.env.ADLAB_DECISIONS_ENABLED !== "0";
const AUTOSCALE_ENABLED = process.env.ADLAB_AUTOSCALE_ENABLED === "1";

// Meta attributes conversions up to days after the click, so a single
// "yesterday" sync freezes undercounted numbers. Re-sync a trailing
// window every run so late attribution lands.
const SYNC_WINDOW_DAYS = 3;

// Flag (not kill) live ads with zero delivery after this long — stuck
// in review, rejected, or Learning Limited. They spend nothing, so
// they're invisible to spend-based kill rules.
const ZERO_DELIVERY_FLAG_HOURS = 48;

// Safety rails
const MIN_SPEND_FOR_DECISION = 1500;     // $15 — no decisions below this spend
const MIN_IMPRESSIONS_FOR_DECISION = 500; // AND this many impressions
const MIN_HOURS_LIVE_FOR_DECISION = 72;  // AND out of Meta's first-days learning
const MAX_KILLS_PER_RUN = 3;             // daily cap to prevent wipeouts
// If more than this share of ads fail to sync (expired token, API outage),
// skip ALL decisions this run — deciding on stale rows is worse than waiting.
const MAX_SYNC_FAILURE_RATE = 0.2;

// Meta reports one registration under several action types
// (offsite_conversion.fb_pixel_complete_registration, complete_registration,
// omni_complete_registration). Summing them double-counted every signup.
// Take the FIRST type present, in this order.
const CONVERSION_ACTION_PRIORITY = [
  "offsite_conversion.fb_pixel_complete_registration",
  "omni_complete_registration",
  "complete_registration",
];

// Rule 1 — Dead creative (no clicks)
const R1_SPEND_FLOOR = 1500;             // $15
const R1_CLICKS_CEIL = 0;

// Rule 2 — Low LINK CTR (was 0.8% on all-clicks CTR, which counts likes
// and "see more" taps). 3000 imps keeps the false-kill odds low.
const R2_IMPRESSIONS_FLOOR = 3000;
const R2_CTR_CEIL = 0.5;                 // 0.5% link CTR

// Rule 3 — Spending with no signups. Historical cost/signup ≈ $10, so
// $35 with zero is ~3.5 expected signups missing (≈3% false-kill odds).
const R3_SPEND_FLOOR = 3500;             // $35
const R3_CONVERSIONS_CEIL = 0;

// Rule 4 — Expensive signups (≈2.5× historical cost/signup)
const R4_SPEND_FLOOR = 5000;             // $50
const R4_CPL_CEIL = 2500;               // $25

// Rule 5 — Scale winner (flag-only on evergreen ad sets: fixed budget)
const R5_CONVERSIONS_FLOOR = 4;
const R5_CPL_CEIL = 900;                // $9
const R5_FREQUENCY_CEIL = 2.5;
const R5_BUDGET_MULTIPLIER = 1.2;       // +20%
const R5_MAX_BUDGET_MULTIPLE = 3;       // 3x initial (validation phase)
const R5_COOLDOWN_HOURS = 48;

// Rule 6 — Dead experiment
const R6_SPEND_FLOOR = 5000;            // $50
const R6_CONVERSIONS_CEIL = 0;

// Rule 7 — Expensive experiment
const R7_SPEND_FLOOR = 10000;           // $100
const R7_AVG_CPL_CEIL = 3000;           // $30

// Rule 8 — Winning experiment
const R8_CONVERSIONS_FLOOR = 10;
const R8_AVG_CPL_CEIL = 1000;           // $10

const $ = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  // Trailing window (oldest → newest) so late-attributed conversions
  // overwrite the frozen numbers from earlier runs.
  const syncDates: string[] = [];
  for (let i = SYNC_WINDOW_DAYS; i >= 1; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    syncDates.push(d.toISOString().slice(0, 10));
  }

  // Load all live/scaled ads with their projects
  const ads = await prisma.adLabAd.findMany({
    where: { status: { in: ["live", "scaled"] } },
    include: {
      creative: {
        include: {
          angle: {
            include: {
              experiment: {
                include: { project: true },
              },
            },
          },
        },
      },
    },
  });

  if (ads.length === 0) {
    return NextResponse.json({ message: "No live ads to sync" });
  }

  const syncResults: { adId: string; success: boolean }[] = [];
  const decisions: { adId: string; type: string; rule: string; rationale: string; creativeType: string }[] = [];
  const flags: { adId: string; rule: string; rationale: string }[] = [];
  const experimentFlags: { expId: string; type: string; rule: string; rationale: string }[] = [];
  // Lifetime stats per live ad, filled in Step 2, rendered in the email
  const adStats: {
    adId: string; spend: number; imps: number; clicks: number; ctr: number;
    conv: number; cpl: number | null; freq: number; outcome: string;
  }[] = [];

  // ── Step 1: Sync metrics (trailing window, one row per ad per day) ─
  for (const ad of ads) {
    if (!ad.metaAdId) continue;

    try {
      for (const syncDate of syncDates) {
        const insights = await meta.getAdInsights(ad.metaAdId, syncDate, syncDate);
        const data = insights?.[0] || {};

        const impressions = parseInt(data.impressions || "0");
        const allClicks = parseInt(data.clicks || "0");
        const spendCents = Math.round(parseFloat(data.spend || "0") * 100);
        const frequency = parseFloat(data.frequency || "0");
        const cpcCents = data.cpc ? Math.round(parseFloat(data.cpc) * 100) : null;

        const actions: { action_type: string; value: string }[] = data.actions || [];
        const convType = CONVERSION_ACTION_PRIORITY.find((t) => actions.some((a) => a.action_type === t));
        const conversions = convType
          ? parseInt(actions.find((a) => a.action_type === convType)!.value || "0")
          : 0;

        const linkClickAction = actions.find((a) => a.action_type === "link_click");
        const linkClicks = data.inline_link_clicks
          ? parseInt(data.inline_link_clicks)
          : linkClickAction
            ? parseInt(linkClickAction.value || "0")
            : allClicks;

        if (actions.length > 0) {
          const actionTypes = actions.map((a: { action_type: string; value: string }) => `${a.action_type}:${a.value}`);
          console.log(`[adlab-cron] Ad ${ad.id} ${syncDate} actions: ${actionTypes.join(", ")}`);
        }

        const finalClicks = linkClicks;
        const ctr = impressions > 0 ? (finalClicks / impressions) * 100 : 0;
        const cplCents = conversions > 0 ? Math.round(spendCents / conversions) : null;

        await prisma.adLabDailyMetric.upsert({
          where: { adId_date: { adId: ad.id, date: new Date(syncDate) } },
          create: {
            adId: ad.id, date: new Date(syncDate),
            impressions, clicks: finalClicks, ctr, spendCents, conversions, cplCents, frequency, cpcCents,
          },
          update: { impressions, clicks: finalClicks, ctr, spendCents, conversions, cplCents, frequency, cpcCents },
        });
      }

      syncResults.push({ adId: ad.id, success: true });
    } catch (err) {
      console.error(`[adlab-cron] Metric sync failed for ad ${ad.id}:`, err);
      syncResults.push({ adId: ad.id, success: false });
    }
  }

  // ── Step 2: Creative-level decisions ──────────────────────────────
  const syncFailures = syncResults.filter((r) => !r.success).length;
  const syncHealthy = syncResults.length === 0 || syncFailures / syncResults.length <= MAX_SYNC_FAILURE_RATE;
  const decisionsOn = DECISIONS_ENABLED && syncHealthy;
  if (!DECISIONS_ENABLED) {
    console.log("[adlab-cron] Decisions disabled — skipping kill/scale/experiment rules. Metrics synced.");
  } else if (!syncHealthy) {
    console.error(`[adlab-cron] ${syncFailures}/${syncResults.length} metric syncs failed — skipping ALL decisions this run`);
    flags.push({
      adId: "(all)",
      rule: "SYNC-FAILED",
      rationale: `${syncFailures} of ${syncResults.length} Meta metric syncs failed (token expired or API outage?). No kills or scales were made this run — decisions on stale data would be wrong. Check META_ACCESS_TOKEN.`,
    });
  }

  const evergreenAdsets = await evergreenAdsetIds();

  // Count live ads per ad set (falls back to experiment) for the "last
  // active ad" safety rail — evergreen ad sets span many experiments.
  const liveAdsByExp = new Map<string, string[]>();
  for (const ad of ads) {
    const expId = ad.metaAdsetId ?? ad.creative.angle.experiment.id;
    const list = liveAdsByExp.get(expId) ?? [];
    list.push(ad.id);
    liveAdsByExp.set(expId, list);
  }

  let killCount = 0;

  for (const ad of ads) {
    const project = ad.creative.angle.experiment.project;
    const expId = ad.metaAdsetId ?? ad.creative.angle.experiment.id;

    const metrics = await prisma.adLabDailyMetric.aggregate({
      where: { adId: ad.id },
      _sum: { spendCents: true, conversions: true, impressions: true, clicks: true },
      _max: { frequency: true },
    });

    const totalSpend = metrics._sum.spendCents || 0;
    const totalConversions = metrics._sum.conversions || 0;
    const totalImpressions = metrics._sum.impressions || 0;
    const totalClicks = metrics._sum.clicks || 0;
    // Weighted CTR: total clicks over total impressions. Averaging the
    // daily CTR column overweights low-volume days (a 10-imp day counts
    // the same as a 1000-imp day), which skews kill decisions.
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    // Meta frequency is cumulative-ish per day; max is the closest to
    // "how fatigued is this audience" — averaging dilutes it.
    const avgFrequency = metrics._max.frequency || 0;
    const cumulativeCpl = totalConversions > 0 ? Math.round(totalSpend / totalConversions) : null;

    let decisionType: "kill" | "scale" | "maintain" | "flag" = "maintain";
    let rationale = "";
    let ruleId = "";

    // ── Safety rail: minimum data ──
    const hoursLive = ad.launchedAt ? (Date.now() - ad.launchedAt.getTime()) / 3_600_000 : 0;
    const hasMinData =
      totalSpend >= MIN_SPEND_FOR_DECISION &&
      totalImpressions >= MIN_IMPRESSIONS_FOR_DECISION &&
      hoursLive >= MIN_HOURS_LIVE_FOR_DECISION;

    if (decisionsOn && hasMinData) {
      // ── KILL RULES (checked in order, first match wins) ──

      // Rule 1 — Dead creative (no clicks)
      if (totalSpend >= R1_SPEND_FLOOR && totalClicks <= R1_CLICKS_CEIL) {
        decisionType = "kill";
        ruleId = "R1";
        rationale = `R1: Dead creative — spent ${$(totalSpend)} with 0 clicks. ${totalImpressions} impressions, no engagement.`;
      }
      // Rule 2 — Low CTR
      else if (totalImpressions >= R2_IMPRESSIONS_FLOOR && avgCtr < R2_CTR_CEIL) {
        decisionType = "kill";
        ruleId = "R2";
        rationale = `R2: Low link CTR — ${avgCtr.toFixed(2)}% link CTR (threshold: ${R2_CTR_CEIL}%) over ${totalImpressions.toLocaleString()} impressions. Spent ${$(totalSpend)}.`;
      }
      // Rule 3 — Spending with no conversions
      else if (totalSpend >= R3_SPEND_FLOOR && totalConversions <= R3_CONVERSIONS_CEIL) {
        decisionType = "kill";
        ruleId = "R3";
        rationale = `R3: No signups — spent ${$(totalSpend)} (threshold: ${$(R3_SPEND_FLOOR)}) with ${totalClicks} clicks but 0 conversions.`;
      }
      // Rule 4 — Expensive conversions
      else if (totalSpend >= R4_SPEND_FLOOR && cumulativeCpl && cumulativeCpl > R4_CPL_CEIL) {
        decisionType = "kill";
        ruleId = "R4";
        rationale = `R4: Expensive conversions — CPL ${$(cumulativeCpl)} exceeds ${$(R4_CPL_CEIL)} ceiling. ${totalConversions} conversions on ${$(totalSpend)} spend.`;
      }

      // ── SCALE RULE (only if not killed) ──
      if (decisionType === "maintain") {
        // Rule 5 — Winner
        if (
          totalConversions >= R5_CONVERSIONS_FLOOR &&
          cumulativeCpl && cumulativeCpl < R5_CPL_CEIL &&
          avgFrequency < R5_FREQUENCY_CEIL
        ) {
          // Check cooldown (48h)
          const recentScale = await prisma.adLabDecision.findFirst({
            where: {
              adId: ad.id,
              decisionType: "scale",
              executedAt: { gte: new Date(Date.now() - R5_COOLDOWN_HOURS * 60 * 60 * 1000) },
            },
          });

          const currentBudget = ad.dailyBudgetCents || project.dailyBudgetCentsPerVariant;
          const maxBudget = R5_MAX_BUDGET_MULTIPLE * project.dailyBudgetCentsPerVariant;

          if (!recentScale && currentBudget < maxBudget) {
            decisionType = "scale";
            ruleId = "R5";
            const newBudget = Math.min(Math.round(currentBudget * R5_BUDGET_MULTIPLIER), maxBudget);
            rationale = `R5: Winner — CPL ${$(cumulativeCpl)}, ${totalConversions} conversions, frequency ${avgFrequency.toFixed(1)}. Budget ${$(currentBudget)} → ${$(newBudget)}.`;
          }
        }
      }
    }

    // ── Zero-delivery flag (never a kill) ──
    // Ads stuck in review / rejected / Learning Limited spend nothing,
    // so spend-based rules never see them. Surface them for a manual look.
    if (decisionType === "maintain" && totalImpressions === 0 && ad.launchedAt) {
      const hoursLive = (Date.now() - ad.launchedAt.getTime()) / (1000 * 60 * 60);
      if (hoursLive >= ZERO_DELIVERY_FLAG_HOURS) {
        decisionType = "flag";
        ruleId = "ZERO-DELIVERY";
        rationale = `Zero delivery — live ${Math.round(hoursLive)}h with 0 impressions. Likely stuck in review, rejected, or the adset isn't delivering. Check Ads Manager.`;
      }
    }

    // ── Safety rails before execution ──

    // Never kill the last active ad in an experiment
    if (decisionType === "kill") {
      const expAds = liveAdsByExp.get(expId) ?? [];
      if (expAds.length <= 1) {
        decisionType = "flag";
        ruleId = `${ruleId}-LAST`;
        rationale = `${rationale} FLAGGED: last active ad in experiment — needs manual review.`;
      }
    }

    // Daily kill cap
    if (decisionType === "kill" && killCount >= MAX_KILLS_PER_RUN) {
      decisionType = "flag";
      ruleId = `${ruleId}-CAP`;
      rationale = `${rationale} FLAGGED: daily kill cap (${MAX_KILLS_PER_RUN}) reached — queued for next run.`;
    }

    // ── Execute decision ──
    // A kill is only recorded once Meta confirms the pause. Previously a
    // failed pause was still marked "killed", which dropped the ad from
    // syncing while it kept spending.
    if (decisionType === "kill" && ad.metaAdId) {
      try {
        await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
      } catch (err) {
        console.error(`[adlab-cron] Failed to pause ad ${ad.metaAdId}:`, err);
        decisionType = "flag";
        ruleId = `${ruleId}-PAUSE-FAILED`;
        rationale = `${rationale} PAUSE FAILED on Meta — ad is STILL LIVE. Pause it manually in Ads Manager; will retry next run.`;
      }
    }

    if (decisionType === "kill") {
      await prisma.adLabAd.update({
        where: { id: ad.id },
        data: { status: "killed", decisionReason: rationale },
      });
      await prisma.adLabDecision.create({
        data: { adId: ad.id, decisionType: "kill", rationale },
      });
      decisions.push({ adId: ad.id, type: "kill", rule: ruleId, rationale, creativeType: (ad.creative as Record<string, unknown>).creativeType as string || "image" });
      killCount++;

      // Remove from live list so "last active ad" check updates mid-run
      const expAds = liveAdsByExp.get(expId);
      if (expAds) liveAdsByExp.set(expId, expAds.filter((id) => id !== ad.id));

    } else if (decisionType === "scale" && ad.metaAdsetId && evergreenAdsets.has(ad.metaAdsetId)) {
      // Evergreen ad sets have a fixed group budget (lib/adlab/evergreen.ts)
      // — Meta already shifts spend toward the winner inside the ad set.
      const winRationale = `${rationale.replace(/Budget .*$/, "")}Evergreen ad set — budget is fixed at the group level; Meta shifts spend to this ad automatically.`;
      await prisma.adLabDecision.create({
        data: { adId: ad.id, decisionType: "maintain", rationale: winRationale },
      });
      flags.push({ adId: ad.id, rule: `${ruleId}-WINNER`, rationale: winRationale });

    } else if (decisionType === "scale" && !AUTOSCALE_ENABLED) {
      // Winner found but auto-scale is off — flag for manual approval
      // instead of touching the budget. Set ADLAB_AUTOSCALE_ENABLED=1
      // to let the engine raise budgets itself.
      const approveRationale = `${rationale} AUTO-SCALE OFF — approve manually in Ads Manager or set ADLAB_AUTOSCALE_ENABLED=1.`;
      await prisma.adLabDecision.create({
        data: { adId: ad.id, decisionType: "maintain", rationale: approveRationale },
      });
      flags.push({ adId: ad.id, rule: `${ruleId}-APPROVE`, rationale: approveRationale });

    } else if (decisionType === "scale") {
      const currentBudget = ad.dailyBudgetCents || project.dailyBudgetCentsPerVariant;
      const maxBudget = R5_MAX_BUDGET_MULTIPLE * project.dailyBudgetCentsPerVariant;
      const newBudget = Math.min(Math.round(currentBudget * R5_BUDGET_MULTIPLIER), maxBudget);

      if (ad.metaAdsetId) {
        try {
          await meta.updateAdSetBudget(ad.metaAdsetId, newBudget);
        } catch (err) {
          console.error(`[adlab-cron] Failed to update budget for adset ${ad.metaAdsetId}:`, err);
          flags.push({ adId: ad.id, rule: "R5-FAILED", rationale: `${rationale} Budget update FAILED on Meta — nothing changed.` });
          adStats.push({
            adId: ad.id, spend: totalSpend, imps: totalImpressions, clicks: totalClicks,
            ctr: avgCtr, conv: totalConversions, cpl: cumulativeCpl, freq: avgFrequency, outcome: "flag",
          });
          continue;
        }
      }
      await prisma.adLabAd.update({
        where: { id: ad.id },
        data: { status: "scaled", dailyBudgetCents: newBudget, decisionReason: rationale },
      });
      await prisma.adLabDecision.create({
        data: { adId: ad.id, decisionType: "scale", rationale, priorBudgetCents: currentBudget, newBudgetCents: newBudget },
      });
      decisions.push({ adId: ad.id, type: "scale", rule: ruleId, rationale, creativeType: (ad.creative as Record<string, unknown>).creativeType as string || "image" });

    } else if (decisionType === "flag") {
      await prisma.adLabDecision.create({
        data: { adId: ad.id, decisionType: "maintain", rationale },
      });
      flags.push({ adId: ad.id, rule: ruleId, rationale });

    } else {
      // Maintain — log if no recent decision
      const recentDecision = await prisma.adLabDecision.findFirst({
        where: { adId: ad.id, executedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
      if (!recentDecision) {
        await prisma.adLabDecision.create({
          data: { adId: ad.id, decisionType: "maintain", rationale: "Within parameters" },
        });
      }
    }

    adStats.push({
      adId: ad.id, spend: totalSpend, imps: totalImpressions, clicks: totalClicks,
      ctr: avgCtr, conv: totalConversions, cpl: cumulativeCpl, freq: avgFrequency,
      outcome: decisionType,
    });
  }

  // ── Step 3: Experiment-level rules ────────────────────────────────
  const liveExperiments = await prisma.adLabExperiment.findMany({
    where: { status: "live" },
    include: {
      project: true,
      angles: {
        include: {
          creatives: {
            include: { ads: { include: { metrics: true } } },
          },
        },
      },
    },
  });

  const concluded: string[] = [];

  for (const exp of liveExperiments) {
    if (!decisionsOn) continue;

    const allAds = exp.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads));
    const allMetrics = allAds.flatMap((a) => a.metrics);

    const expSpend = allMetrics.reduce((s, m) => s + m.spendCents, 0);
    const expConversions = allMetrics.reduce((s, m) => s + m.conversions, 0);
    const expCpl = expConversions > 0 ? Math.round(expSpend / expConversions) : null;

    // Rule 6 — Dead experiment
    if (expSpend >= R6_SPEND_FLOOR && expConversions <= R6_CONVERSIONS_CEIL) {
      await prisma.adLabExperiment.update({
        where: { id: exp.id },
        data: { status: "concluded", concludedAt: new Date() },
      });
      concluded.push(exp.id);
      experimentFlags.push({
        expId: exp.id,
        type: "concluded_failed",
        rule: "R6",
        rationale: `R6: Dead experiment — ${$(expSpend)} total spend, 0 conversions. All ads paused.`,
      });

      // Pause remaining live ads
      for (const ad of allAds.filter((a) => a.status === "live" || a.status === "scaled")) {
        if (ad.metaAdId) {
          try {
            await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
          } catch (err) {
            console.error(`[adlab-cron] R6 pause failed for ${ad.metaAdId}:`, err);
            flags.push({ adId: ad.id, rule: "R6-PAUSE-FAILED", rationale: "R6 pause FAILED on Meta — ad is STILL LIVE. Pause manually." });
            continue;
          }
        }
        await prisma.adLabAd.update({ where: { id: ad.id }, data: { status: "killed", decisionReason: "R6: Experiment concluded as failed" } });
      }
      continue;
    }

    // Rule 7 — Expensive experiment
    if (expSpend >= R7_SPEND_FLOOR && expCpl && expCpl > R7_AVG_CPL_CEIL) {
      await prisma.adLabExperiment.update({
        where: { id: exp.id },
        data: { status: "concluded", concludedAt: new Date() },
      });
      concluded.push(exp.id);
      experimentFlags.push({
        expId: exp.id,
        type: "concluded_failed",
        rule: "R7",
        rationale: `R7: Expensive experiment — avg CPL ${$(expCpl)} exceeds ${$(R7_AVG_CPL_CEIL)}. ${expConversions} conversions on ${$(expSpend)}.`,
      });
      continue;
    }

    // Rule 8 — Winning experiment (flag only, don't auto-conclude)
    if (expConversions >= R8_CONVERSIONS_FLOOR && expCpl && expCpl < R8_AVG_CPL_CEIL) {
      experimentFlags.push({
        expId: exp.id,
        type: "winning",
        rule: "R8",
        rationale: `R8: WINNING — ${expConversions} conversions at ${$(expCpl)} avg CPL. Manual review recommended.`,
      });
      continue;
    }

    // Legacy: auto-conclude by duration (keep for safety)
    const daysSinceLaunch = exp.launchedAt
      ? Math.floor((Date.now() - exp.launchedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    if (daysSinceLaunch >= exp.project.testDurationDays) {
      await prisma.adLabExperiment.update({
        where: { id: exp.id },
        data: { status: "concluded", concludedAt: new Date() },
      });
      concluded.push(exp.id);

      try {
        const baseUrl = process.env.NEXTAUTH_URL || "https://goripple.io";
        await fetch(`${baseUrl}/api/admin/adlab/experiments/${exp.id}/learn`, {
          method: "POST",
          headers: { authorization: `Bearer ${cronSecret}` },
        });
      } catch (err) {
        console.error(`[adlab-cron] Learning loop failed for experiment ${exp.id}:`, err);
      }
    }
  }

  // ── Step 4: Build + send daily email ──────────────────────────────
  try {
    const { sendEmailOrThrow } = await import("@/lib/resend");

    const sections: string[] = [
      `# AdLab Daily Report — ${dateStr}`,
      `Metrics synced: ${syncResults.filter((r) => r.success).length}/${syncResults.length} ads`,
      `Optimizing: signups (evergreen $60 women / $40 men) · Kills: ${DECISIONS_ENABLED ? "ON" : "OFF"} · Auto-scale: ${AUTOSCALE_ENABLED ? "ON" : "OFF (winners flagged)"}`,
    ];

    // Kills
    const kills = decisions.filter((d) => d.type === "kill");
    if (kills.length > 0) {
      sections.push(`\n## ❌ Kills (${kills.length})`);
      kills.forEach((d) => sections.push(`- [${d.rule}] ad ${d.adId.slice(0, 8)}: ${d.rationale}`));
    }

    // Scales
    const scales = decisions.filter((d) => d.type === "scale");
    if (scales.length > 0) {
      sections.push(`\n## ⬆️ Scales (${scales.length})`);
      scales.forEach((d) => sections.push(`- [${d.rule}] ad ${d.adId.slice(0, 8)}: ${d.rationale}`));
    }

    // Flags for manual review
    if (flags.length > 0) {
      sections.push(`\n## ⚠️ Flagged for Manual Review (${flags.length})`);
      flags.forEach((f) => sections.push(`- [${f.rule}] ad ${f.adId.slice(0, 8)}: ${f.rationale}`));
    }

    // Experiment-level
    if (experimentFlags.length > 0) {
      sections.push(`\n## 🧪 Experiment Decisions`);
      experimentFlags.forEach((ef) => sections.push(`- [${ef.rule}] exp ${ef.expId.slice(0, 8)}: ${ef.rationale}`));
    }

    if (concluded.length > 0) {
      sections.push(`\n## Experiments Concluded: ${concluded.length}`);
    }

    // Approaching thresholds (within 20%)
    const approaching: string[] = [];
    for (const s of adStats) {
      if (s.spend >= R1_SPEND_FLOOR * 0.8 && s.spend < R1_SPEND_FLOOR && s.clicks === 0)
        approaching.push(`ad ${s.adId.slice(0, 8)}: ${$(s.spend)} spent, 0 clicks — approaching R1 kill at ${$(R1_SPEND_FLOOR)}`);
      if (s.spend >= R3_SPEND_FLOOR * 0.8 && s.spend < R3_SPEND_FLOOR && s.conv === 0)
        approaching.push(`ad ${s.adId.slice(0, 8)}: ${$(s.spend)} spent, 0 conv — approaching R3 kill at ${$(R3_SPEND_FLOOR)}`);
    }

    if (approaching.length > 0) {
      sections.push(`\n## 🔜 Approaching Kill Thresholds`);
      approaching.forEach((a) => sections.push(`- ${a}`));
    }

    // Lifetime stats for every live ad, biggest spenders first
    if (adStats.length > 0) {
      sections.push(`\n## 📊 Live Ads — Lifetime Stats`);
      sections.push(`ad | spend | imps | clicks | CTR | conv | CPL | freq | today`);
      [...adStats]
        .sort((a, b) => b.spend - a.spend)
        .forEach((s) => sections.push(
          `${s.adId.slice(0, 8)} | ${$(s.spend)} | ${s.imps.toLocaleString()} | ${s.clicks} | ${s.ctr.toFixed(2)}% | ${s.conv} | ${s.cpl ? $(s.cpl) : "—"} | ${s.freq.toFixed(1)} | ${s.outcome}`,
        ));
    }

    // Summary line
    sections.push(`\n---\nTotal: ${kills.length} kills, ${scales.length} scales, ${flags.length} flagged, ${concluded.length} experiments concluded`);

    await sendEmailOrThrow({
      from: process.env.EMAIL_FROM || "AdLab <noreply@goripple.io>",
      to: "keenan@heelerdigital.com",
      subject: `AdLab Daily: ${kills.length} kills, ${scales.length} scales${flags.length > 0 ? `, ${flags.length} flagged` : ""}${experimentFlags.some((e) => e.type === "winning") ? " 🏆 WINNER" : ""}`,
      text: sections.join("\n"),
    });
  } catch (err) {
    console.error("[adlab-cron] Email send failed:", err);
  }

  return NextResponse.json({
    synced: syncResults.length,
    decisions: decisions.length,
    flags: flags.length,
    concluded: concluded.length,
    experimentFlags: experimentFlags.length,
  });
}
