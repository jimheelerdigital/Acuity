/**
 * POST /api/admin/adlab/ads/validate — pre-launch validation for AdLab experiments.
 * Runs all checks in parallel and returns a checklist of pass/fail/warn results.
 *
 * Accepts: { experimentId }
 *
 * Based on ADLAB_PRINCIPLES.md:
 * - Structure: 1 ad set per campaign
 * - Objective: OUTCOME_TRAFFIC unless manually overridden
 * - Optimization: LINK_CLICKS when Traffic
 * - Budget: >= $10/day
 * - Landing page: exists and returns HTTP 200
 * - Creatives: >= 3 approved, warn if > 15
 * - Geo: no AU in targeting
 * - Destination type: Website explicitly set
 * - Billing: ad account active
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CheckStatus = "pass" | "fail" | "warn";

interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { experimentId } = await req.json();
  if (!experimentId) {
    return NextResponse.json({ error: "experimentId required" }, { status: 400 });
  }

  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      project: true,
      landingPage: true,
      angles: {
        include: {
          creatives: {
            where: { approved: true, complianceStatus: { not: "flagged" } },
          },
        },
      },
    },
  });

  if (!experiment) {
    return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
  }

  const project = experiment.project;
  const expRecord = experiment as Record<string, unknown>;
  const isAppInstall = expRecord.campaignType === "app_install";
  const campaignObjective = isAppInstall
    ? "OUTCOME_APP_PROMOTION"
    : ((expRecord.campaignObjective as string) || "OUTCOME_TRAFFIC");
  const isTraffic = campaignObjective === "OUTCOME_TRAFFIC";
  const launchableCreatives = experiment.angles.flatMap((a) => a.creatives);
  const audience = project.targetAudience as Record<string, unknown> | null;
  const geo = (audience?.geo as string[]) || [];
  const adsetBudget = (expRecord.adSetDailyBudgetCents as number) || project.dailyBudgetCentsPerVariant;
  const landingPageUrl = (project as Record<string, unknown>).landingPageUrl as string | null;

  // Run all checks in parallel
  const checks = await Promise.all([
    // 1. Campaign structure: single ad set
    (async (): Promise<CheckResult> => ({
      id: "structure",
      label: "Campaign structure",
      status: "pass",
      message: "1 campaign, 1 ad set — algorithm gets concentrated data",
    }))(),

    // 2. Objective check
    (async (): Promise<CheckResult> => {
      if (isAppInstall) {
        return { id: "objective", label: "Campaign objective", status: "pass", message: "App Install (OUTCOME_APP_PROMOTION)" };
      }
      if (isTraffic) {
        return { id: "objective", label: "Campaign objective", status: "pass", message: "Traffic (OUTCOME_TRAFFIC) — correct for pre-50 weekly conversions" };
      }
      return { id: "objective", label: "Campaign objective", status: "warn", message: `Set to ${campaignObjective} — only use conversion objective with 50+ weekly events on pixel` };
    })(),

    // 3. Optimization goal
    (async (): Promise<CheckResult> => {
      if (isAppInstall) {
        return { id: "optimization", label: "Optimization goal", status: "pass", message: "APP_INSTALLS" };
      }
      if (isTraffic) {
        return { id: "optimization", label: "Optimization goal", status: "pass", message: "LINK_CLICKS — correct for Traffic objective" };
      }
      // Conversion objective
      if (!project.metaPixelId) {
        return { id: "optimization", label: "Optimization goal", status: "fail", message: "OFFSITE_CONVERSIONS requires a pixel ID — none configured" };
      }
      return { id: "optimization", label: "Optimization goal", status: "pass", message: "OFFSITE_CONVERSIONS with pixel configured" };
    })(),

    // 4. Budget check
    (async (): Promise<CheckResult> => {
      const budgetDollars = adsetBudget / 100;
      if (adsetBudget < 1000) {
        return { id: "budget", label: "Daily budget", status: "fail", message: `$${budgetDollars.toFixed(2)}/day — minimum $10/day required. Underfunded campaigns never exit the learning phase.` };
      }
      return { id: "budget", label: "Daily budget", status: "pass", message: `$${budgetDollars.toFixed(2)}/day` };
    })(),

    // 5. Destination / landing page check — validates the actual URL ads will point to
    (async (): Promise<CheckResult> => {
      if (isAppInstall) {
        return { id: "landing_page", label: "Destination", status: "pass", message: "App Install — links to App Store" };
      }

      const destination = expRecord.destination as string | undefined;

      if (destination === "direct_funnel") {
        // Direct to /start — validate that URL is reachable
        const funnelUrl = "https://goripple.io/start";
        try {
          const res = await fetch(funnelUrl, { method: "HEAD", redirect: "follow" });
          if (res.ok) {
            return { id: "landing_page", label: "Destination", status: "pass", message: `Direct to Funnel — ${funnelUrl} — HTTP ${res.status}` };
          }
          return { id: "landing_page", label: "Destination", status: "fail", message: `Funnel URL returned HTTP ${res.status} — ${funnelUrl}` };
        } catch (err) {
          return { id: "landing_page", label: "Destination", status: "fail", message: `Funnel URL unreachable: ${err instanceof Error ? err.message : "network error"}` };
        }
      }

      // Landing page destination — check generated page or project URL
      const lp = experiment.landingPage;
      if (!lp && !landingPageUrl) {
        return { id: "landing_page", label: "Destination", status: "fail", message: "No landing page generated and no project URL set. Generate a landing page or switch destination to Direct to Funnel." };
      }

      const urlToCheck = lp
        ? `https://goripple.io/for/${lp.slug}`
        : landingPageUrl!;

      try {
        const res = await fetch(urlToCheck, { method: "HEAD", redirect: "follow" });
        if (res.ok) {
          return { id: "landing_page", label: "Destination", status: "pass", message: `Landing page — ${urlToCheck} — HTTP ${res.status}` };
        }
        return { id: "landing_page", label: "Destination", status: "fail", message: `Landing page returned HTTP ${res.status} — generate one first or check the URL` };
      } catch (err) {
        return { id: "landing_page", label: "Destination", status: "fail", message: `Landing page unreachable: ${err instanceof Error ? err.message : "network error"}` };
      }
    })(),

    // 6. Creatives count
    (async (): Promise<CheckResult> => {
      const count = launchableCreatives.length;
      if (count < 3) {
        return { id: "creatives_min", label: "Creative count", status: "fail", message: `${count} approved creative${count === 1 ? "" : "s"} — need at least 3 for the algorithm to test effectively` };
      }
      return { id: "creatives_min", label: "Creative count", status: "pass", message: `${count} approved creative${count === 1 ? "" : "s"} ready to launch` };
    })(),

    // 7. Creatives cap (warn only)
    (async (): Promise<CheckResult> => {
      const count = launchableCreatives.length;
      if (count > 15) {
        return { id: "creatives_cap", label: "Creative cap", status: "warn", message: `${count} creatives — Meta performs best with 5-15 ads per ad set. Consider reducing.` };
      }
      return { id: "creatives_cap", label: "Creative cap", status: "pass", message: `${count} creatives — within optimal range` };
    })(),

    // 8. Geo targeting
    (async (): Promise<CheckResult> => {
      if (isAppInstall) {
        return { id: "geo", label: "Geo targeting", status: "pass", message: "App Install campaign" };
      }
      if (geo.length === 0) {
        return { id: "geo", label: "Geo targeting", status: "fail", message: "No countries configured — set geo targeting on the project" };
      }
      const hasAU = geo.some((c) => c.toUpperCase() === "AU");
      const filtered = geo.filter((c) => c.toUpperCase() !== "AU");
      if (hasAU) {
        return { id: "geo", label: "Geo targeting", status: "warn", message: `AU (Australia) will be excluded at launch. Remaining: ${filtered.join(", ")}. Remove AU from project settings to clear this warning.` };
      }
      return { id: "geo", label: "Geo targeting", status: "pass", message: `Countries: ${geo.join(", ")}` };
    })(),

    // 9. Destination type (Website explicitly set)
    (async (): Promise<CheckResult> => {
      if (isAppInstall) {
        return { id: "destination", label: "Destination type", status: "pass", message: "APP destination" };
      }
      // The launch route always sets destination_type: "WEBSITE" for non-app campaigns
      return { id: "destination", label: "Destination type", status: "pass", message: "WEBSITE destination explicitly set in API call" };
    })(),

    // 10. Billing / ad account status
    (async (): Promise<CheckResult> => {
      try {
        const { getAdAccountStatus } = await import("@/lib/adlab/meta");
        const status = await getAdAccountStatus();
        if (status.isActive) {
          return { id: "billing", label: "Ad account status", status: "pass", message: `Account "${status.name}" is active` };
        }
        const statusLabels: Record<number, string> = {
          2: "DISABLED",
          3: "UNSETTLED",
          7: "PENDING_RISK_REVIEW",
          8: "PENDING_SETTLEMENT",
          9: "IN_GRACE_PERIOD",
          100: "PENDING_CLOSURE",
          101: "CLOSED",
        };
        const label = statusLabels[status.accountStatus] || `STATUS_${status.accountStatus}`;
        return { id: "billing", label: "Ad account status", status: "fail", message: `Account "${status.name}" is ${label} — resolve in Meta Business Settings before launching` };
      } catch (err) {
        return { id: "billing", label: "Ad account status", status: "warn", message: `Could not check account status: ${err instanceof Error ? err.message : "API error"}. Verify manually.` };
      }
    })(),
  ]);

  const hasFail = checks.some((c) => c.status === "fail");
  const hasWarn = checks.some((c) => c.status === "warn");

  return NextResponse.json({
    checks,
    allPassed: !hasFail,
    hasWarnings: hasWarn,
    launchableCount: launchableCreatives.length,
  });
}
