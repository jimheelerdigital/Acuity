/**
 * GET /api/admin/users/[id]/emails
 *
 * Returns the log of admin-sent emails for a specific user.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const emails = await prisma.adminSentEmail.findMany({
    where: { targetUserId: params.id },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      body: true,
      sentAt: true,
    },
  });

  return NextResponse.json({ emails });
}
