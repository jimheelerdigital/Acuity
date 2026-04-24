import { serve } from "inngest/next";
import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import {
  generateDailyFn,
  researchBriefingFn,
} from "@/inngest/functions/content-factory";
import { day14AuditCronFn } from "@/inngest/functions/day-14-audit-cron";
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
import { snapshotLifemapHistoryFn } from "@/inngest/functions/snapshot-lifemap-history";
import { computeDailySnapshotFn } from "@/inngest/functions/compute-daily-snapshot";
import { scanRedFlagsFn } from "@/inngest/functions/scan-red-flags";
import { trialEmailOrchestratorFn } from "@/inngest/functions/trial-email-orchestrator";
import { weeklyDigestFn } from "@/inngest/functions/weekly-digest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Upper bound for any single Inngest step invocation. On Hobby the effective
// ceiling is 10s; on Pro it's 60s. See INNGEST_MIGRATION_PLAN.md §12.
export const maxDuration = 60;

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
    computeDailySnapshotFn,
    scanRedFlagsFn,
    generateStateOfMeFn,
    stateOfMeAutoTickFn,
    trialEmailOrchestratorFn,
  ],
});

/**
 * ─── IMPORTANT: the flag gate is SPLIT BY METHOD on purpose ──────────
 *
 * Inngest Cloud calls this endpoint to:
 *   1. Discover our registered functions (GET — returns the function
 *      catalog so Inngest knows what we can handle).
 *   2. Sync / register a new app version (PUT — fires on
 *      deployment or on manual sync from the Inngest dashboard).
 *   3. Invoke individual steps (POST — each `step.run()` in a
 *      function body lands here).
 *
 * If we gate ALL three behind ENABLE_INNGEST_PIPELINE, the app never
 * registers with Inngest Cloud — GET and PUT return 503, so Inngest
 * never sees our function catalog and never attempts an invocation.
 * That's the bug the 2026-04-20 smoke-test session ran into: the
 * endpoint was 503-inert, which looks correct from a "flag off"
 * standpoint but breaks the sync handshake.
 *
 * The correct behavior:
 *   - GET, PUT   → ALWAYS respond (catalog + registration are
 *                  metadata-only; no user-facing side effects, no
 *                  token spend, nothing to gate).
 *   - POST       → flag-gated. POST = step invocation = Whisper +
 *                  Claude token burn. When the flag is off we
 *                  return 503 + a hint so the operator sees why.
 *
 * Do NOT "fix" this back to uniform gating. The correct gate for
 * "stop Inngest from running work" is flipping the Inngest Cloud
 * functions to Paused from the dashboard, not 503'ing the
 * registration handshake.
 */

function flagOff() {
  return NextResponse.json(
    {
      error: "Inngest pipeline not enabled",
      hint: "Set ENABLE_INNGEST_PIPELINE=1 in the server environment to allow event dispatch.",
    },
    { status: 503 }
  );
}

function isEnabled() {
  return process.env.ENABLE_INNGEST_PIPELINE === "1";
}

export async function GET(req: NextRequest, ctx: unknown) {
  // Always respond — Inngest Cloud fetches function metadata here.
  return handler.GET(req, ctx);
}

export async function PUT(req: NextRequest, ctx: unknown) {
  // Always respond — Inngest Cloud uses PUT to sync / register.
  return handler.PUT(req, ctx);
}

export async function POST(req: NextRequest, ctx: unknown) {
  // Flag-gate only POST — step invocations burn Whisper + Claude
  // tokens. Inngest Cloud also uses POST to deliver events to
  // functions; when the pipeline is off by design, those events
  // simply don't flow, which is what the flag is for.
  if (!isEnabled()) return flagOff();
  return handler.POST(req, ctx);
}
