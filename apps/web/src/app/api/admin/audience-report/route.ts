/**
 * GET /api/admin/audience-report?days=28[&send=1]
 * The Sunday audience report on demand (lib/audience-report.ts): JSON by
 * default, emails Keenan with send=1. Auth: admin session OR
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const days = Math.min(90, Math.max(7, Number(req.nextUrl.searchParams.get("days")) || 28));
  const { audienceReport, audienceReportHtml } = await import("@/lib/audience-report");
  const report = await audienceReport(days);
  if (req.nextUrl.searchParams.get("send") !== "1") return NextResponse.json(report);
  const { subject, html } = audienceReportHtml(report);
  const { getResendClient } = await import("@/lib/resend");
  const { data, error } = await getResendClient().emails.send({
    from: "Ripple <hello@goripple.io>",
    to: ["keenan@heelerdigital.com"],
    replyTo: "keenan@heelerdigital.com",
    subject,
    html,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sent: data?.id, subject });
}
