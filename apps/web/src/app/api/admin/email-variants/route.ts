/**
 * GET /api/admin/email-variants
 *
 * How each version of each lifecycle email is doing (2026-10-01): matured
 * sends (72h+ old) and how many reached the email's goal (recorded / got
 * into the app / paid / clicked — lib/email-jev.ts goalFor). This is the
 * same evidence Jev sees when it picks a version.
 *
 * Optional `?key=<emailKey>` for one email.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const { TRIAL_EMAIL_TEMPLATES } = await import("@/emails/trial/registry");
  const { variantStats, goalFor } = await import("@/lib/email-jev");
  const { isEmailEnabled } = await import("@/lib/email-enabled");

  const only = req.nextUrl.searchParams.get("key");
  const out: Record<string, unknown> = {};
  for (const [key, t] of Object.entries(TRIAL_EMAIL_TEMPLATES)) {
    if (only && key !== only) continue;
    if (!t.variants?.length || !isEmailEnabled(key)) continue;
    const stats = await variantStats(key, t.variants.map((x) => x.id));
    out[key] = {
      goal: goalFor(key),
      versions: t.variants.map((x) => {
        const s = stats.find((st) => st.id === x.id)!;
        return { id: x.id, angle: x.angle, sent: s.sent, reachedGoal: s.goals, rate: s.sent ? Math.round((s.goals / s.sent) * 1000) / 10 + "%" : null };
      }),
    };
  }
  return NextResponse.json({ emails: out });
}
