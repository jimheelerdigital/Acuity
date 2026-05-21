/**
 * POST /api/admin/backfill-email-verified
 *
 * One-time backfill: set emailVerified = createdAt for all users where
 * emailVerified is NULL. This prevents the old verification wall from
 * hitting users who signed up before the emailVerified-at-creation fix.
 *
 * Admin-only. Safe to run multiple times (idempotent).
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

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
