/**
 * POST /api/user/push-token — slice 9b (2026-05-25).
 *
 * Mobile registers its Expo push token here after the user grants
 * notification permission. Idempotent — safe to call on every cold
 * launch as a freshness check (Expo tokens can rotate; we re-write
 * silently when they change).
 *
 * Body: { token: string, platform: "ios" | "android" }
 *
 * Auth: accepts the mobile NextAuth-compatible Bearer JWT via
 * `getAnySessionUserId` (same path the rest of the mobile API uses).
 *
 * Stamps three columns:
 *   - User.pushToken            — the ExponentPushToken[...]
 *   - User.pushTokenPlatform    — "ios" | "android"
 *   - User.pushTokenUpdatedAt   — now(); used by ops to detect stale
 *                                  tokens if Expo's send returns a
 *                                  DeviceNotRegistered receipt
 *
 * Apple Option-C: nothing here surfaces $/Subscribe — purely a
 * device-registration write. The push copy itself is enforced server-
 * side in trial-countdown-push.ts.
 */

import { NextRequest, NextResponse } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TOKEN_MAX_LEN = 256;

interface Body {
  token?: unknown;
  platform?: unknown;
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const platform = body.platform === "ios" || body.platform === "android"
    ? body.platform
    : null;

  if (!token || token.length > TOKEN_MAX_LEN) {
    return NextResponse.json({ ok: false, error: "InvalidToken" }, { status: 400 });
  }
  if (!platform) {
    return NextResponse.json({ ok: false, error: "InvalidPlatform" }, { status: 400 });
  }
  // Expo's tokens look like "ExponentPushToken[...]" on iOS/Android.
  // We don't enforce the prefix here — Expo's spec allows raw FCM/APNs
  // tokens too via expo-server-sdk fallbacks. Length + non-empty is
  // sufficient validation at this layer; the cron will discover bad
  // tokens via Expo's DeviceNotRegistered receipts.

  const { prisma } = await import("@/lib/prisma");
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        pushToken: token,
        pushTokenPlatform: platform,
        pushTokenUpdatedAt: new Date(),
      },
    });
  } catch (err) {
    safeLog.error("push-token.update_failed", {
      userId,
      err: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ ok: false, error: "WriteFailed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
