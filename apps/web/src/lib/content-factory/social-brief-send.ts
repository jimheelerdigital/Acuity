/**
 * Social Brief email + the switch that retires the old social emails
 * (2026-10-20, per Keenan: one weekly social brief instead of many).
 *
 * FeatureFlag "social_brief_only": while OFF (the first overlap week), the
 * old weekly social emails keep sending next to the Social Brief so Keenan
 * can compare. Turn it ON to stop them: the weekly brief email, lane
 * intelligence report, niche strategy memo, Monday performance report, UGC
 * weekly digest, and the competitor research / top-videos / video-script
 * reports. Their data jobs keep running; only their emails stop. Read from
 * the DB with a short memo so flipping it takes effect within a minute.
 */
import { readSocialBrief, socialBriefEmailHtml, SOCIAL_BRANDS, type SocialBrief } from "./social-brief";

export const SOCIAL_BRIEF_ONLY_FLAG = "social_brief_only";

let memo: { at: number; on: boolean } | null = null;

/** True when the old weekly social emails should stay quiet. */
export async function socialBriefOnly(): Promise<boolean> {
  if (memo && Date.now() - memo.at < 60_000) return memo.on;
  let on = false;
  try {
    const { prisma } = await import("@/lib/prisma");
    const row = await prisma.featureFlag.findUnique({ where: { key: SOCIAL_BRIEF_ONLY_FLAG }, select: { enabled: true } });
    on = !!row?.enabled;
  } catch {
    on = false; // DB hiccup: keep the old emails rather than lose them
  }
  memo = { at: Date.now(), on };
  return on;
}

export async function sendSocialBriefEmail(): Promise<{ sent: boolean; brands: string[] }> {
  const briefs = (await Promise.all(SOCIAL_BRANDS.map((b) => readSocialBrief(b)))).filter(Boolean) as SocialBrief[];
  // Only briefs built in the last 3 days, so a failed sweep never resends last week's.
  const fresh = briefs.filter((b) => Date.now() - new Date(b.builtAt).getTime() < 3 * 86_400_000);
  if (!fresh.length) return { sent: false, brands: [] };
  const { sendEmailOrThrow } = await import("@/lib/resend");
  await sendEmailOrThrow({
    from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
    to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
    subject: `Weekly Social Brief — ${fresh.map((b) => ({ ripple: "Ripple", mythicals: "Mythicals", bwk: "BWK" })[b.brand]).join(", ")} (${new Date().toISOString().slice(0, 10)})`,
    html: socialBriefEmailHtml(fresh),
  });
  return { sent: true, brands: fresh.map((b) => b.brand) };
}
