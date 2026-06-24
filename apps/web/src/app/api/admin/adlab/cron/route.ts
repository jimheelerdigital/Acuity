/**
 * GET /api/admin/adlab/cron — daily metrics sync + decision engine.
 * Protected by CRON_SECRET. Runs at 09:00 UTC daily.
 *
 * 1. Sync yesterday's metrics from Meta Insights API
 * 2. Run creative-level kill/scale/maintain decisions
 * 3. Run experiment-level conclusions
 * 4. Send daily summary email via Resend
 *
 * VALIDATION PHASE thresholds — tuned for low-volume Traffic campaigns.
 * Flip VALIDATION_PHASE to false when switching to Conversions objective.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── Validation-phase thresholds (all in cents where applicable) ─────
const VALIDATION_PHASE = true;

// ── KILL/SCALE DECISIONS DISABLED (2026-05-23) ─────────────────────
// Cron still syncs metrics and sends daily summary email, but takes
// ZERO automated actions — no pausing, killing, scaling, or budget
// changes. Set to true to re-enable.
const DECISIONS_ENABLED = false;

// Safety rails
const MIN_SPEND_FOR_DECISION = 1000;     // $10 — no decisions below this spend
const MIN_IMPRESSIONS_FOR_DECISION = 500; // AND this many impressions
const MAX_KILLS_PER_RUN = 3;             // daily cap to prevent wipeouts

// Rule 1 — Dead creative (no clicks)
const R1_SPEND_FLOOR = 1500;             // $15
const R1_CLICKS_CEIL = 0;

// Rule 2 — Low CTR
const R2_IMPRESSIONS_FLOOR = 1000;
const R2_CTR_CEIL = 0.8;                 // 0.8%

// Rule 3 — Spending with no conversions
const R3_SPEND_FLOOR = 3000;             // $30
const R3_CONVERSIONS_CEIL = 0;

// Rule 4 — Expensive conversions
const R4_SPEND_FLOOR = 4500;             // $45
const R4_CPL_CEIL = 3000;               // $30

// Rule 5 — Scale winner
const R5_CONVERSIONS_FLOOR = 3;
const R5_CPL_CEIL = 1000;               // $10
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

  // ── Migration kill-switch ──────────────────────────────────────────
  // ADLAB_CRON_ENABLED=false makes this endpoint exit immediately — no
  // Meta API calls, no metric sync, no decisions, no email. The cron
  // stays registered in vercel.json so this is fully reversible: flip
  // the env var back to true (or unset it) to resume. Default is enabled.
  // Used to freeze the engine during the AdLab → standalone extraction.
  if (process.env.ADLAB_CRON_ENABLED === "false") {
    console.log("[adlab-cron] ADLAB_CRON_ENABLED=false — engine paused, exiting early.");
    return NextResponse.json({
      message: "AdLab cron disabled via ADLAB_CRON_ENABLED",
      disabled: true,
    });
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

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
  const warnings: string[] = [];

  // ── Step 1: Sync metrics ──────────────────────────────────────────
  for (const ad of ads) {
    if (!ad.metaAdId) continue;

    try {
      const insights = await meta.getAdInsights(ad.metaAdId, dateStr, dateStr);
      const data = insights?.[0] || {};

      const impressions = parseInt(data.impressions || "0");
      const clicks = parseInt(data.clicks || "0");
      const ctr = parseFloat(data.ctr || "0");
      const spendCents = Math.round(parseFloat(data.spend || "0") * 100);
      const frequency = parseFloat(data.frequency || "0");
      const cpcCents = data.cpc ? Math.round(parseFloat(data.cpc) * 100) : null;

      const projectEvent = ad.creative.angle.experiment.project.conversionEvent;
      const conversionTypes = [
        projectEvent,
        "offsite_conversion.fb_pixel_complete_registration",
        "complete_registration",
      ].filter(Boolean) as string[];

      const actions = data.actions || [];
      const conversions = actions
        .filter((a: { action_type: string }) => conversionTypes.includes(a.action_type))
        .reduce((sum: number, a: { value: string }) => sum + parseInt(a.value || "0"), 0);

      const linkClicks = actions
        .filter((a: { action_type: string }) => a.action_type === "link_click")
        .reduce((sum: number, a: { value: string }) => sum + parseInt(a.value || "0"), 0);

      if (actions.length > 0) {
        const actionTypes = actions.map((a: { action_type: string; value: string }) => `${a.action_type}:${a.value}`);
        console.log(`[adlab-cron] Ad ${ad.id} actions: ${actionTypes.join(", ")}`);
      }

      const finalClicks = clicks > 0 ? clicks : linkClicks;
      const cplCents = conversions > 0 ? Math.round(spendCents / conversions) : null;

      await prisma.adLabDailyMetric.upsert({
        where: { adId_date: { adId: ad.id, date: new Date(dateStr) } },
        create: {
          adId: ad.id, date: new Date(dateStr),
          impressions, clicks: finalClicks, ctr, spendCents, conversions, cplCents, frequency, cpcCents,
        },
        update: { impressions, clicks: finalClicks, ctr, spendCents, conversions, cplCents, frequency, cpcCents },
      });

      syncResults.push({ adId: ad.id, success: true });
    } catch (err) {
      console.error(`[adlab-cron] Metric sync failed for ad ${ad.id}:`, err);
      syncResults.push({ adId: ad.id, success: false });
    }
  }

  // ── Step 2: Creative-level decisions ──────────────────────────────
  if (!DECISIONS_ENABLED) {
    console.log("[adlab-cron] Decisions disabled — skipping kill/scale/experiment rules. Metrics synced.");
  }

  // Count live ads per experiment for "last active ad" safety rail
  const liveAdsByExp = new Map<string, string[]>();
  for (const ad of ads) {
    const expId = ad.creative.angle.experiment.id;
    const list = liveAdsByExp.get(expId) ?? [];
    list.push(ad.id);
    liveAdsByExp.set(expId, list);
  }

  let killCount = 0;

  for (const ad of ads) {
    const project = ad.creative.angle.experiment.project;
    const expId = ad.creative.angle.experiment.id;

    const metrics = await prisma.adLabDailyMetric.aggregate({
      where: { adId: ad.id },
      _sum: { spendCents: true, conversions: true, impressions: true, clicks: true },
      _avg: { ctr: true, frequency: true },
    });

    const totalSpend = metrics._sum.spendCents || 0;
    const totalConversions = metrics._sum.conversions || 0;
    const totalImpressions = metrics._sum.impressions || 0;
    const totalClicks = metrics._sum.clicks || 0;
    const avgCtr = metrics._avg.ctr || 0;
    const avgFrequency = metrics._avg.frequency || 0;
    const cumulativeCpl = totalConversions > 0 ? Math.round(totalSpend / totalConversions) : null;

    let decisionType: "kill" | "scale" | "maintain" | "flag" = "maintain";
    let rationale = "";
    let ruleId = "";

    // ── Safety rail: minimum data ──
    const hasMinData = totalSpend >= MIN_SPEND_FOR_DECISION && totalImpressions >= MIN_IMPRESSIONS_FOR_DECISION;

    if (DECISIONS_ENABLED && hasMinData) {
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
        rationale = `R2: Low CTR — ${avgCtr.toFixed(2)}% CTR (threshold: ${R2_CTR_CEIL}%) over ${totalImpressions.toLocaleString()} impressions. Spent ${$(totalSpend)}.`;
      }
      // Rule 3 — Spending with no conversions
      else if (totalSpend >= R3_SPEND_FLOOR && totalConversions <= R3_CONVERSIONS_CEIL) {
        decisionType = "kill";
        ruleId = "R3";
        rationale = `R3: No conversions — spent ${$(totalSpend)} (threshold: ${$(R3_SPEND_FLOOR)}) with ${totalClicks} clicks but 0 conversions.`;
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
    if (decisionType === "kill") {
      if (ad.metaAdId) {
        try {
          await meta.setStatus(ad.metaAdId, "ad", "PAUSED");
        } catch (err) {
          console.error(`[adlab-cron] Failed to pause ad ${ad.metaAdId}:`, err);
        }
      }
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

    } else if (decisionType === "scale") {
      const currentBudget = ad.dailyBudgetCents || project.dailyBudgetCentsPerVariant;
      const maxBudget = R5_MAX_BUDGET_MULTIPLE * project.dailyBudgetCentsPerVariant;
      const newBudget = Math.min(Math.round(currentBudget * R5_BUDGET_MULTIPLIER), maxBudget);

      if (ad.metaAdsetId) {
        try {
          await meta.updateAdSetBudget(ad.metaAdsetId, newBudget);
        } catch (err) {
          console.error(`[adlab-cron] Failed to update budget for adset ${ad.metaAdsetId}:`, err);
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
    if (!DECISIONS_ENABLED) continue;

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
          try { await meta.setStatus(ad.metaAdId, "ad", "PAUSED"); } catch {}
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
        const baseUrl = process.env.NEXTAUTH_URL || "https://getacuity.io";
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
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const sections: string[] = [
      `# AdLab Daily Report — ${dateStr}`,
      `Metrics synced: ${syncResults.filter((r) => r.success).length}/${syncResults.length} ads`,
      `Phase: ${VALIDATION_PHASE ? "VALIDATION" : "SCALE"}`,
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
    for (const ad of ads) {
      const m = await prisma.adLabDailyMetric.aggregate({
        where: { adId: ad.id },
        _sum: { spendCents: true, conversions: true, impressions: true, clicks: true },
        _avg: { ctr: true },
      });
      const sp = m._sum.spendCents || 0;
      const conv = m._sum.conversions || 0;
      const clk = m._sum.clicks || 0;
      const ctr = m._avg.ctr || 0;

      if (sp >= R1_SPEND_FLOOR * 0.8 && sp < R1_SPEND_FLOOR && clk === 0)
        approaching.push(`ad ${ad.id.slice(0, 8)}: ${$(sp)} spent, 0 clicks — approaching R1 kill at ${$(R1_SPEND_FLOOR)}`);
      if (sp >= R3_SPEND_FLOOR * 0.8 && sp < R3_SPEND_FLOOR && conv === 0)
        approaching.push(`ad ${ad.id.slice(0, 8)}: ${$(sp)} spent, 0 conv — approaching R3 kill at ${$(R3_SPEND_FLOOR)}`);
    }

    if (approaching.length > 0) {
      sections.push(`\n## 🔜 Approaching Kill Thresholds`);
      approaching.forEach((a) => sections.push(`- ${a}`));
    }

    // Summary line
    sections.push(`\n---\nTotal: ${kills.length} kills, ${scales.length} scales, ${flags.length} flagged, ${concluded.length} experiments concluded`);

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "AdLab <noreply@getacuity.io>",
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
