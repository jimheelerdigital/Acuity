/**
 * One-tap "Posted ✓" link for the manual-TikTok emails (2026-09-24, social
 * audit Phase 1). TikTok posting is by hand and nothing ever recorded it —
 * 0 of 535 posts had a tiktokUrl, so the pipeline couldn't tell what went
 * live. Tapping the link in the email marks the post POSTED on TikTok; the
 * nightly TikTok scrape then attaches the real video + numbers (matching on
 * caption, or on the posted-time this link records).
 *
 * The link is unauthenticated (it's opened from Gmail on a phone) but
 * HMAC-signed with CRON_SECRET, so it can only mark the post it was
 * generated for.
 */

import { createHmac, timingSafeEqual } from "crypto";

function sign(postId: string, account: string): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret).update(`tiktok-posted:${postId}:${account}`).digest("hex").slice(0, 32);
}

export function tiktokPostedUrl(postId: string, account: "ripple" | "bwk"): string | null {
  if (!process.env.CRON_SECRET) return null;
  const base = process.env.NEXTAUTH_URL || "https://goripple.io";
  const qs = new URLSearchParams({ p: postId, a: account, s: sign(postId, account) });
  return `${base}/api/content-factory/tiktok-posted?${qs}`;
}

export function verifyTiktokPosted(postId: string, account: string, sig: string): boolean {
  if (!process.env.CRON_SECRET || !sig) return false;
  const expected = Buffer.from(sign(postId, account));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Email-safe button HTML, or "" when links can't be signed. */
export function tiktokPostedButton(postId: string, account: "ripple" | "bwk"): string {
  const url = tiktokPostedUrl(postId, account);
  if (!url) return "";
  return `<p style="margin:0 0 16px;"><a href="${url}" style="display:inline-block;background:#2E7D5B;color:#fff;font-weight:700;font-size:14px;padding:10px 18px;border-radius:8px;text-decoration:none;">✓ I posted this on TikTok</a></p>`;
}
