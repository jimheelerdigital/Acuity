/**
 * GET /api/admin/adlab/cron — daily metrics sync + decision engine.
 * Protected by CRON_SECRET. Runs at 09:00 UTC daily.
 *
 * 1. Sync yesterday's metrics from Meta Insights API
 * 2. Run kill/scale/maintain decisions per ad
 * 3. Check for experiment conclusions
 * 4. Send daily summary email via Resend
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import * as meta from "@/lib/adlab/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const decisions: { adId: string; type: string; rationale: string }[] = [];

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

      // Extract conversions from actions array
      const conversionEvent = ad.creative.angle.experiment.project.conversionEvent || "Lead";
      const conversions = (data.actions || [])
        .filter((a: { action_type: string }) => a.action_type === conversionEvent)
        .reduce((sum: number, a: { value: string }) => sum + parseInt(a.value || "0"), 0);

      const cplCents = conversions > 0 ? Math.round(spendCents / conversions) : null;

      await prisma.adLabDailyMetric.upsert({
        where: { adId_date: { adId: ad.id, date: new Date(dateStr) } },
        create: {
          adId: ad.id,
          date: new Date(dateStr),
          impressions,
          clicks,
          ctr,
          spendCents,
          conversions,
          cplCents,
          frequency,
          cpcCents,
        },
        update: { impressions, clicks, ctr, spendCents, conversions, cplCents, frequency, cpcCents },
      });

      syncResults.push({ adId: ad.id, success: true });
    } catch (err) {
      console.error(`[adlab-cron] Metric sync failed for ad ${ad.id}:`, err);
      syncResults.push({ adId: ad.id, success: false });
    }
  }

  // ── Step 2: Run decisions ─────────────────────────────────────────
  for (const ad of ads) {
    const project = ad.creative.angle.experiment.project;

    // Get cumulative metrics
    const metrics = await prisma.adLabDailyMetric.aggregate({
      where: { adId: ad.id },
      _sum: {
        spendCents: true,
        conversions: true,
        impressions: true,
        clicks: true,
      },
      _avg: {
        ctr: true,
        frequency: true,
      },
    });

    const totalSpend = metrics._sum.spendCents || 0;
    const totalConversions = metrics._sum.conversions || 0;
    const totalImpressions = metrics._sum.impressions || 0;
    const avgCtr = metrics._avg.ctr || 0;
    const avgFrequency = metrics._avg.frequency || 0;
    const cumulativeCpl = totalConversions > 0 ? Math.round(totalSpend / totalConversions) : null;

    let decisionType: "kill" | "scale" | "maintain" = "maintain";
    let rationale = "";

    // KILL rules
    if (totalSpend >= 1.5 * project.targetCplCents && totalConversions === 0) {
      decisionType = "kill";
      rationale = `Spent ${(totalSpend / 100).toFixed(2)} (1.5x target CPL) with zero conversions`;
    } else if (avgCtr < 0.5 && totalImpressions >= 2000) {
      decisionType = "kill";
      rationale = `CTR ${avgCtr.toFixed(2)}% below 0.5% threshold with ${totalImpressions} impressions`;
    } else if (
      cumulativeCpl &&
      cumulativeCpl > 2 * project.targetCplCents &&
      totalSpend >= 3 * project.targetCplCents
    ) {
      decisionType = "kill";
      rationale = `CPL $${(cumulativeCpl / 100).toFixed(2)} is 2x+ target with sufficient spend`;
    }

    // SCALE rules (only if not killed)
    if (decisionType === "maintain") {
      const maxBudget = 5 * project.dailyBudgetCentsPerVariant;
      const currentBudget = ad.dailyBudgetCents || project.dailyBudgetCentsPerVariant;

      // Check if scaled in last 24h
      const recentScale = await prisma.adLabDecision.findFirst({
        where: {
          adId: ad.id,
          decisionType: "scale",
          executedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });

      if (
        !recentScale &&
        totalSpend >= project.targetCplCents &&
        cumulativeCpl &&
        cumulativeCpl <= 0.8 * project.targetCplCents &&
        totalConversions >= 5 &&
        avgFrequency < 2.5 &&
        currentBudget < maxBudget
      ) {
        decisionType = "scale";
        const newBudget = Math.min(Math.round(currentBudget * 1.2), maxBudget);
        rationale = `CPL $${(cumulativeCpl / 100).toFixed(2)} is ≤80% of target, ${totalConversions} conversions, frequency ${avgFrequency.toFixed(1)}. Budget ${(currentBudget / 100).toFixed(2)} → ${(newBudget / 100).toFixed(2)}`;
      }
    }

    // Execute decision
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
      decisions.push({ adId: ad.id, type: "kill", rationale });
    } else if (decisionType === "scale") {
      const currentBudget = ad.dailyBudgetCents || project.dailyBudgetCentsPerVariant;
      const newBudget = Math.min(
        Math.round(currentBudget * 1.2),
        5 * project.dailyBudgetCentsPerVariant
      );

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
        data: {
          adId: ad.id,
          decisionType: "scale",
          rationale,
          priorBudgetCents: currentBudget,
          newBudgetCents: newBudget,
        },
      });
      decisions.push({ adId: ad.id, type: "scale", rationale });
    } else {
      // Only log maintain if no decision in last 24h
      const recentDecision = await prisma.adLabDecision.findFirst({
        where: {
          adId: ad.id,
          executedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (!recentDecision) {
        await prisma.adLabDecision.create({
          data: { adId: ad.id, decisionType: "maintain", rationale: "Within parameters" },
        });
      }
    }
  }

  // ── Step 3: Check experiment conclusions ──────────────────────────
  const liveExperiments = await prisma.adLabExperiment.findMany({
    where: { status: "live" },
    include: {
      project: true,
      angles: {
        include: {
          creatives: {
            include: { ads: true },
          },
        },
      },
    },
  });

  const concluded: string[] = [];

  for (const exp of liveExperiments) {
    const allAds = exp.angles.flatMap((a) => a.creatives.flatMap((c) => c.ads));
    const scaledCount = allAds.filter((a) => a.status === "scaled").length;
    const daysSinceLaunch = exp.launchedAt
      ? Math.floor((Date.now() - exp.launchedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceLaunch >= exp.project.testDurationDays || scaledCount >= 2) {
      await prisma.adLabExperiment.update({
        where: { id: exp.id },
        data: { status: "concluded", concludedAt: new Date() },
      });
      concluded.push(exp.id);

      // Trigger learning loop
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

  // ── Step 4: Send daily email ──────────────────────────────────────
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    const body = [
      `# AdLab Daily Report — ${dateStr}`,
      `\nMetrics synced: ${syncResults.filter((r) => r.success).length}/${syncResults.length}`,
      `Decisions made: ${decisions.length}`,
      decisions.length > 0
        ? `\n## Decisions\n${decisions.map((d) => `- **${d.type.toUpperCase()}** ad ${d.adId.slice(0, 8)}: ${d.rationale}`).join("\n")}`
        : "",
      concluded.length > 0
        ? `\n## Experiments Concluded\n${concluded.map((id) => `- Experiment ${id.slice(0, 8)}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    await resend.emails.send({
      from: process.env.EMAIL_FROM || "AdLab <noreply@getacuity.io>",
      to: "keenan@heelerdigital.com",
      subject: `AdLab Daily: ${decisions.filter((d) => d.type === "kill").length} kills, ${decisions.filter((d) => d.type === "scale").length} scales`,
      text: body,
    });
  } catch (err) {
    console.error("[adlab-cron] Email send failed:", err);
  }

  return NextResponse.json({
    synced: syncResults.length,
    decisions: decisions.length,
    concluded: concluded.length,
  });
}
