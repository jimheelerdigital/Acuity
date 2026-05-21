/**
 * POST /api/admin/backfill-email-verified
 *
 * One-time backfill: set emailVerified = createdAt for all users where
 * emailVerified is NULL.
 *
 * Auth: accepts either admin session OR CRON_SECRET bearer token.
 * Safe to run multiple times (idempotent).
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Accept CRON_SECRET or admin session
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!hasCronAuth) {
    // Fallback to admin session check
    try {
      const { requireAdmin } = await import("@/lib/admin-guard");
      const guard = await requireAdmin();
      if (!guard.ok) return guard.response;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await prisma.$executeRaw`
    UPDATE "User"
    SET "emailVerified" = "createdAt"
    WHERE "emailVerified" IS NULL
  `;

  return NextResponse.json({
    updated: result,
    message: `Set emailVerified = createdAt for ${result} users`,
  });
}
