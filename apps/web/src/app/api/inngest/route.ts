import { serve } from "inngest/next";
import { NextRequest } from "next/server";

import { inngest } from "@/inngest/client";
import {
  generateDailyFn,
  researchBriefingFn,
} from "@/inngest/functions/content-factory";
import { day14AuditCronFn } from "@/inngest/functions/day-14-audit-cron";
import { drainPendingCalendarTasksFn } from "@/inngest/functions/drain-pending-calendar-tasks";
import { generateLifeAuditFn } from "@/inngest/functions/generate-life-audit";
import { generateWeeklyReportFn } from "@/inngest/functions/generate-weekly-report";
import { helloWorldFn } from "@/inngest/functions/hello-world";
import { processEntryFn } from "@/inngest/functions/process-entry";
import { computeUserInsightsFn } from "@/inngest/functions/compute-user-insights";
import { generateDataExportFn } from "@/inngest/functions/generate-data-export";
import {
  generateStateOfMeFn,
  stateOfMeAutoTickFn,
} from "@/inngest/functions/generate-state-of-me";
import { monthlyDigestFn } from "@/inngest/functions/monthly-digest";
import { refreshLifeMapFn } from "@/inngest/functions/refresh-lifemap";
import { cleanupGenerationJobsFn } from "@/inngest/functions/cleanup-generation-jobs";
import { compressMemoryFn } from "@/inngest/functions/compress-memory";
import { snapshotLifemapHistoryFn } from "@/inngest/functions/snapshot-lifemap-history";
import { computeDailySnapshotFn } from "@/inngest/functions/compute-daily-snapshot";
import { rlsAuditFn } from "@/inngest/functions/rls-audit";
import { scanRedFlagsFn } from "@/inngest/functions/scan-red-flags";
import { trialEmailOrchestratorFn } from "@/inngest/functions/trial-email-orchestrator";
import { weeklyDigestFn } from "@/inngest/functions/weekly-digest";
import {
  autoBlogGenerateFn,
  autoBlogPruneFn,
} from "@/inngest/functions/auto-blog";
import { waitlistReactivationFn } from "@/inngest/functions/waitlist-reactivation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Upper bound for any single Inngest step invocation. Vercel Pro allows up
// to 300s. Bumped from 60 to 300 because Claude generation calls can take
// 60-90s and the previous 60s ceiling caused FUNCTION_INVOCATION_TIMEOUT.
export const maxDuration = 300;

const handler = serve({
  client: inngest,
  functions: [
    helloWorldFn,
    processEntryFn,
    generateWeeklyReportFn,
    refreshLifeMapFn,
    day14AuditCronFn,
    generateLifeAuditFn,
    researchBriefingFn,
    generateDailyFn,
    snapshotLifemapHistoryFn,
    computeUserInsightsFn,
    weeklyDigestFn,
    monthlyDigestFn,
    generateDataExportFn,
    cleanupGenerationJobsFn,
    compressMemoryFn,
    computeDailySnapshotFn,
    rlsAuditFn,
    scanRedFlagsFn,
    generateStateOfMeFn,
    stateOfMeAutoTickFn,
    trialEmailOrchestratorFn,
    autoBlogGenerateFn,
    autoBlogPruneFn,
    waitlistReactivationFn,
    drainPendingCalendarTasksFn,
  ],
});

/**
 * ─── ENABLE_INNGEST_PIPELINE flag removed (2026-04-28) ──────────────
 *
 * The previous POST-only flag gate (ENABLE_INNGEST_PIPELINE) silently
 * prevented ALL Inngest function invocations in production when the env
 * var was unset. This was the root cause of auto-blog "Generate Now"
 * appearing to succeed (inngest.send() hits Inngest Cloud fine) while
 * the function never actually ran (Inngest Cloud's callback POST got
 * 503'd).
 *
 * The correct way to pause individual functions is via the Inngest
 * Cloud dashboard (Functions → Pause). That approach is per-function
 * and doesn't break the registration handshake.
 *
 * All three HTTP methods now pass through unconditionally.
 */

export async function GET(req: NextRequest, ctx: unknown) {
  return handler.GET(req, ctx);
}

export async function PUT(req: NextRequest, ctx: unknown) {
  return handler.PUT(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  return handler.POST(req, ctx);
}
