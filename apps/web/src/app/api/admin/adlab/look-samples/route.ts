/**
 * POST /api/admin/adlab/look-samples — render one sample ad per look in the
 * look library and email a contact sheet (inngest/functions/adlab-look-samples.ts).
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { inngest } from "@/inngest/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  await inngest.send({ name: "adlab/look-samples.requested", data: {} });
  return NextResponse.json({ ok: true });
}
