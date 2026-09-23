/**
 * POST /api/admin/blog/rewrite-triage
 *
 * Fires the admin/blog-rewrite-triage.requested Inngest event, which
 * rewrites the 41 Phase-1 triage posts (Keenan sign-off 2026-09-23) in
 * production — the working ANTHROPIC_API_KEY only exists in Vercel, so
 * the rewrite engine must run there, not locally.
 *
 * Body (optional JSON): { only?: string; limit?: number; force?: boolean }
 * - only: rewrite a single slug (smoke test)
 * - limit: cap the number of posts this run
 * - force: redo posts that already have a finalBody
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const bearerOk = !!cronSecret && bearer === `Bearer ${cronSecret}`;
  if (!bearerOk) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }

  const data: { only?: string; limit?: number; force?: boolean } = {};
  try {
    const body = await req.json();
    if (typeof body?.only === "string") data.only = body.only;
    if (typeof body?.limit === "number") data.limit = body.limit;
    if (body?.force === true) data.force = true;
  } catch {
    // no body — run the full queue
  }

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "admin/blog-rewrite-triage.requested", data });

  return NextResponse.json({ ok: true, sent: data });
}
