/**
 * POST /api/user/app-open
 *
 * Called by the mobile app on every launch (after auth is confirmed)
 * to record device telemetry. Updates devicePlatform and appVersion
 * on every call; sets appFirstOpenedAt only once (write-once).
 *
 * Body: { devicePlatform: "ios" | "android", appVersion: string }
 *
 * Auth: Bearer JWT (mobile) or NextAuth cookie (web).
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { devicePlatform?: string; appVersion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { devicePlatform, appVersion } = body;

  if (devicePlatform !== "ios" && devicePlatform !== "android") {
    return NextResponse.json(
      { error: "devicePlatform must be 'ios' or 'android'" },
      { status: 400 }
    );
  }

  // Fetch current user to check write-once field
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { appFirstOpenedAt: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    devicePlatform,
    appVersion: appVersion ?? undefined,
    lastSeenAt: new Date(),
  };

  // Write-once: only set appFirstOpenedAt if currently NULL
  if (!user.appFirstOpenedAt) {
    updateData.appFirstOpenedAt = new Date();
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });

  return NextResponse.json({ ok: true });
}
