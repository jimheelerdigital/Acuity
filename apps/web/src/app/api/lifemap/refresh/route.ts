/**
 * POST /api/lifemap/refresh
 *
 * Dual-path behavior (INNGEST_MIGRATION_PLAN.md §3.3 + §11 step 4):
 *   - ENABLE_INNGEST_PIPELINE !== "1" (default): legacy sync path.
 *     Runs compress-memory + generate-insights inline and returns
 *     200 with the freshly-recomputed areas.
 *   - ENABLE_INNGEST_PIPELINE === "1": async path. Dispatches an
 *     `lifemap/refresh.requested` Inngest event and returns 202.
 *     The function is debounced 10 minutes per user, so back-to-back
 *     button-mashing collapses to one Claude pair. Client re-fetches
 *     GET /api/lifemap to see the updated scores once the function
 *     completes (client polling lands in PR 5).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { inngest } from "@/inngest/client";
import { requireEntitlement } from "@/lib/paywall";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(limiters.expensiveAi, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

  const gate = await requireEntitlement("canRefreshLifeMap", userId);
  if (!gate.ok) return gate.response;

  const useInngest = process.env.ENABLE_INNGEST_PIPELINE === "1";

  // ── Async path: dispatch event, return 202 ──────────────────────────────
  if (useInngest) {
    await inngest.send({
      name: "lifemap/refresh.requested",
      data: { userId },
    });
    return NextResponse.json({ status: "QUEUED" }, { status: 202 });
  }

  // ── Sync path (legacy): inline Claude calls, return 200 with areas ──────
  try {
    const { generateLifeMapInsights, compressMemory, getOrCreateUserMemory } =
      await import("@/lib/memory");

    // Compress memory if stale (> 7 days since last compression)
    const memory = await getOrCreateUserMemory(userId);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (!memory.lastCompressed || memory.lastCompressed < sevenDaysAgo) {
      await compressMemory(userId);
    }

    // Generate fresh insights
    await generateLifeMapInsights(userId);

    // Return updated areas
    const { prisma } = await import("@/lib/prisma");
    const areas = await prisma.lifeMapArea.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ areas }, { status: 200 });
  } catch (err) {
    console.error("[lifemap/refresh] Failed:", err);
    return NextResponse.json(
      { error: "Failed to refresh Life Matrix" },
      { status: 500 }
    );
  }
}
