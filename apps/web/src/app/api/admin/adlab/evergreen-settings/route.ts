/**
 * POST /api/admin/adlab/evergreen-settings
 *
 * Pushes the code's per-group daily budget and optimization event
 * (lib/adlab/evergreen.ts) onto the live evergreen ad sets, and returns what
 * Meta now reports for each. Added 2026-09-30 to switch both ad sets to
 * Purchase optimization and move $20/day from women to men.
 *
 * Auth: admin session OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const bearer = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!(cronSecret && bearer === `Bearer ${cronSecret}`)) {
    const guard = await requireAdmin();
    if (!guard.ok) return guard.response;
  }
  const body = (await req.json().catch(() => ({}))) as { migrate?: "women" | "men"; setupTest?: boolean };
  const { applyEvergreenSettings, migrateEvergreenOptimization, ensureTestAdSet, trimMainAdSet } = await import("@/lib/adlab/evergreen");
  // { setupTest: true } (2026-09-30): create/confirm each lane's $15/day test
  // ad set and cap each main ad set at 8 live ads.
  if (body.setupTest) {
    const out: Record<string, unknown> = {};
    for (const g of ["women", "men"] as const) {
      out[g] = {
        test: await ensureTestAdSet(g).catch((err) => ({ error: String(err).slice(0, 300) })),
        trim: await trimMainAdSet(g).catch((err) => ({ error: String(err).slice(0, 300) })),
      };
    }
    return NextResponse.json(out);
  }
  // { migrate: "women" | "men" }: move that lane to a new ad set optimized
  // for GROUP_OPTIMIZATION_EVENT (Meta won't edit a published ad set's event).
  if (body.migrate === "women" || body.migrate === "men") {
    return NextResponse.json(await migrateEvergreenOptimization(body.migrate));
  }
  return NextResponse.json(await applyEvergreenSettings());
}
