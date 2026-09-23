/**
 * POST /api/admin/blog/weekly-seo-report
 *
 * Fires the admin/weekly-seo-report.requested Inngest event, which builds
 * and emails the weekly GSC metrics report immediately (same code path as
 * the Sunday 12:00 UTC cron). Used for smoke-testing the report.
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

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "admin/weekly-seo-report.requested", data: {} });

  return NextResponse.json({ ok: true });
}
