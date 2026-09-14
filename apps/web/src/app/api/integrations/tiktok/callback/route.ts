import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import {
  exchangeTikTokCode,
  fetchTikTokDisplayName,
} from "@/lib/content-factory/tiktok-publish";

export const dynamic = "force-dynamic";

/**
 * TikTok OAuth callback — exchanges the code and upserts the tokens
 * into SocialToken (provider "tiktok", accountKey "ripple"). Admin-only:
 * the session cookie survives the TikTok redirect because it's the same
 * browser. State cookie check prevents forged callbacks.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json(
      { error: `TikTok authorization denied: ${oauthError}` },
      { status: 400 }
    );
  }

  const jar = await cookies();
  const expectedState = jar.get("tiktok_oauth_state")?.value;
  jar.delete("tiktok_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json(
      { error: "Missing or mismatched OAuth state — restart at /api/integrations/tiktok/connect" },
      { status: 400 }
    );
  }

  const redirectUri = `${url.origin}/api/integrations/tiktok/callback`;
  const tokens = await exchangeTikTokCode(code, redirectUri);
  const displayName = await fetchTikTokDisplayName(tokens.accessToken);

  await prisma.socialToken.upsert({
    where: {
      provider_accountKey: { provider: "tiktok", accountKey: "ripple" },
    },
    create: {
      provider: "tiktok",
      accountKey: "ripple",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      openId: tokens.openId,
      displayName,
    },
    update: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      openId: tokens.openId,
      displayName,
      lastError: null,
    },
  });

  const safeName = (displayName ?? tokens.openId ?? "unknown").replace(
    /[<>&"]/g,
    (c) => `&#${c.charCodeAt(0)};`
  );
  return new Response(
    `<html><body style="font-family:sans-serif;padding:40px">
      <h2>TikTok connected ✓</h2>
      <p>Account: <strong>${safeName}</strong></p>
      <p>Slideshow drafts will now land in this account's TikTok inbox
      whenever the auto-publish cron runs. You can close this tab.</p>
    </body></html>`,
    { headers: { "content-type": "text/html" } }
  );
}
