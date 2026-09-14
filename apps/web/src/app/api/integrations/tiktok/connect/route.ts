import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { requireAdmin } from "@/lib/admin-guard";
import {
  tiktokAuthorizeUrl,
  tiktokConfigured,
} from "@/lib/content-factory/tiktok-publish";

export const dynamic = "force-dynamic";

/**
 * One-time TikTok OAuth start (2026-09-14). Admin-only: Keenan visits
 * this URL while logged into the dashboard, approves on TikTok, and the
 * callback stores the tokens in SocialToken. Re-visiting reconnects
 * (upsert), which is also the fix when a refresh token gets revoked.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!tiktokConfigured()) {
    return NextResponse.json(
      { error: "TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set in Vercel" },
      { status: 500 }
    );
  }

  const state = randomBytes(16).toString("hex");
  const redirectUri = `${new URL(req.url).origin}/api/integrations/tiktok/callback`;

  const jar = await cookies();
  jar.set("tiktok_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations/tiktok",
  });

  return NextResponse.redirect(tiktokAuthorizeUrl(redirectUri, state));
}
