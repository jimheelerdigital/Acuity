/**
 * POST /api/admin/people/backfill
 *
 * Admin-only trigger for the Anchor People backfill cron.
 * Slice 7 v1.2.
 *
 * Body: { userId?: string }
 *   - userId set → backfill only that user. Use this as the canary
 *     path before running across all users (Jim's account first).
 *   - userId omitted → walk every PRO/TRIAL user with > 5 entries
 *     and at least one entry where peopleExtractedAt IS NULL.
 *
 * Fires-and-forgets via inngest.send — the actual work happens in
 * the peopleBackfillFn function (see inngest/functions/people-
 * backfill.ts). Endpoint returns immediately with the event id so
 * the admin caller can watch progress in the Inngest UI.
 */

import { NextRequest, NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Body {
  userId?: unknown;
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as Body;
  const userId = typeof body.userId === "string" ? body.userId : undefined;

  const result = await inngest.send({
    name: "people/backfill",
    data: userId ? { userId } : {},
  });

  return NextResponse.json({
    ok: true,
    eventIds: result.ids,
    scope: userId ? `user:${userId}` : "all-eligible",
  });
}
