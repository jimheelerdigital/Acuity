/**
 * Mobile-only upload endpoint for daily HealthKit snapshots.
 *
 * POST /api/health/snapshots
 *   body: { snapshots: Array<{ date: "YYYY-MM-DD", sleepHours?, steps?, avgHRV?, activeMinutes? }> }
 *   returns: { written: N }
 *
 * Idempotent — @@unique([userId, date]) lets us upsert per row so
 * the mobile worker can re-send the last 7 days on every sync
 * without double-counting. Uses getAnySessionUserId (Bearer auth).
 * Rate-limited under the generic userWrite bucket.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SnapshotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  steps: z.number().int().min(0).max(500_000).nullable().optional(),
  avgHRV: z.number().min(0).max(500).nullable().optional(),
  activeMinutes: z.number().int().min(0).max(1440).nullable().optional(),
});
const BodySchema = z.object({
  snapshots: z.array(SnapshotSchema).min(1).max(31),
});

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const gated = await gateFeatureFlag(userId, "apple_health_integration");
  if (gated) return gated;
  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { prisma } = await import("@/lib/prisma");

  let written = 0;
  for (const snap of parsed.data.snapshots) {
    const date = new Date(`${snap.date}T00:00:00Z`);
    await prisma.healthSnapshot.upsert({
      where: { userId_date: { userId, date } },
      create: {
        userId,
        date,
        sleepHours: snap.sleepHours ?? null,
        steps: snap.steps ?? null,
        avgHRV: snap.avgHRV ?? null,
        activeMinutes: snap.activeMinutes ?? null,
      },
      update: {
        sleepHours: snap.sleepHours ?? null,
        steps: snap.steps ?? null,
        avgHRV: snap.avgHRV ?? null,
        activeMinutes: snap.activeMinutes ?? null,
      },
    });
    written += 1;
  }

  // Opportunistically stamp healthConnectedAt the first time a user
  // uploads anything, so /api/user/me can report the state.
  await prisma.user.update({
    where: { id: userId },
    data: { healthConnectedAt: new Date() },
  });

  return NextResponse.json({ written });
}
