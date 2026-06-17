// MRI Diagnostic Dashboard — snapshot builder.
//
// Calls the section queries and serializes AGGREGATES ONLY (no raw rows, no
// PII, no session lists) into the <5KB JSON blob fed to Claude in insights.ts.
// Keep this lean: every field here costs input tokens on every cron run.

import type { PrismaClient } from "@prisma/client";

import {
  getSystemHealth,
  getWebFunnel,
  getActivation,
  getTrial,
  getAcquisition,
  getFeatures,
  getEngagement,
  getFailures,
  getRevenue,
} from "./queries";
import type { AcquisitionResponse, Snapshot } from "./types";

/**
 * Build the diagnostic snapshot for the AI Insights panel.
 *
 * @param range  Human-readable label for the window (e.g. "7d", "30d").
 * @param start  Window start (inclusive).
 * @param end    Window end (inclusive).
 */
export async function buildSnapshot(
  prisma: PrismaClient,
  range: string,
  start: Date,
  end: Date
): Promise<Snapshot> {
  // monthStart for the revenue (business-metrics) current-state slice.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [
    systemHealth,
    webFunnel,
    activation,
    trial,
    acquisition,
    features,
    engagement,
    failures,
    revenue,
  ] = await Promise.all([
    getSystemHealth(prisma),
    getWebFunnel(prisma, start, end),
    getActivation(prisma, start, end),
    getTrial(prisma, start, end),
    getAcquisition(prisma, start, end),
    getFeatures(prisma, start, end),
    getEngagement(prisma, start, end),
    getFailures(prisma, start, end),
    getRevenue(prisma, monthStart),
  ]);

  // ── Web funnel → step/pctOfPrev/pctOfTop aggregates ──────────────────────
  const funnelSteps = webFunnel.steps ?? [];
  const topCount = funnelSteps.length > 0 ? funnelSteps[0].count : 0;
  const snapshotWebFunnel = funnelSteps.map((s, i) => {
    const prev = i > 0 ? funnelSteps[i - 1].count : null;
    return {
      step: i + 1,
      label: s.label,
      sessions: s.count,
      pctOfPrev:
        prev && prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : i === 0 ? null : 0,
      pctOfTop: topCount > 0 ? Math.round((s.count / topCount) * 1000) / 10 : null,
    };
  });

  return {
    rangeUsed: range,
    generatedAt: new Date().toISOString(),
    systemHealth,
    webFunnel: snapshotWebFunnel,
    activation: {
      steps: activation.steps.map((s) => ({
        label: s.label,
        count: s.count,
        pctOfPrev: s.pctOfPrev,
      })),
      timeToFirstEntry: {
        median: activation.timeToFirstEntry.median,
        p25: activation.timeToFirstEntry.p25,
        p75: activation.timeToFirstEntry.p75,
        p90: activation.timeToFirstEntry.p90,
      },
    },
    trialFunnel: trial.buckets,
    acquisition: (acquisition.platformAcquisition ?? []).map(
      (a: AcquisitionResponse["platformAcquisition"][number]) => ({
        source: a.source,
        platform: a.platform,
        signups: a.signups,
        activated: a.activated,
        activationPct: a.activationPct,
      })
    ),
    featureUsage: {
      freeVsPaid: features.freeVsPaid.map((f) => ({
        isPaid: f.isPaid,
        users: f.users,
        usedTasks: f.usedTasks,
        usedGoals: f.usedGoals,
        usedInsights: f.usedInsights,
        usedLifeAudit: f.usedLifeAudit,
        usedWeeklyReport: f.usedWeeklyReport,
        usedReminder: f.usedReminder,
        usedCalendar: f.usedCalendar,
      })),
    },
    engagement: {
      distribution: {
        totalActivated: engagement.distribution.totalActivated,
        oneAndDone: engagement.distribution.cohorts.oneAndDone,
        dabbled: engagement.distribution.cohorts.dabbled,
        engaged: engagement.distribution.cohorts.engaged,
        habit: engagement.distribution.cohorts.habit,
        recorded3PlusDays: engagement.distribution.recorded3PlusDays,
        recorded7PlusDays: engagement.distribution.recorded7PlusDays,
        avgEntriesPerUser: engagement.distribution.avgEntriesPerUser,
      },
      retentionCurve: engagement.retentionCurve.map((w) => ({
        weekNum: w.weekNum,
        pctRetained: w.pctRetained,
      })),
    },
    // Top failure surfaces only — cap to keep the blob small.
    failures: failures.surfaces.slice(0, 15).map((f) => ({
      message: f.message,
      source: f.source,
      occurrences: f.occurrences,
      usersAffected: f.usersAffected,
    })),
    revenue: {
      stalePro: revenue.staleStripeRecords?.length ?? 0,
      pastDue: revenue.pastDueRecovery?.length ?? 0,
      mrrCents: revenue.mrrCents,
      payingUsers: revenue.payingUsers,
    },
  };
}
