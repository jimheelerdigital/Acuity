/**
 * One-tap "open the app already signed in" links (2026-09-28, per Keenan:
 * web signups were downloading the app, landing in its new-user onboarding
 * and never getting into the account they created and paid for).
 *
 * Uses the existing mobile magic-link flow, which the shipped app already
 * handles: the link opens /auth/mobile-complete, which forwards the token to
 * acuity://auth-callback and the app exchanges it for a session. The token is
 * only consumed when the app redeems it, so tapping before installing is
 * harmless, and the page offers the store when the app is missing.
 *
 * Every email that asks someone to get into the app should carry one of
 * these. See lib/email-enabled.ts APP_ACCESS_EMAIL_KEYS.
 */
import { randomToken } from "@/lib/auth-tokens";

export const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";
const TTL_HOURS = 72;

export async function createAppSignInUrl(email: string): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const token = randomToken();
  await prisma.verificationToken.create({
    data: {
      identifier: `mobile:${email.toLowerCase().trim()}`,
      token,
      expires: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
    },
  });
  const origin = process.env.NEXTAUTH_URL ?? "https://goripple.io";
  return `${origin}/auth/mobile-complete?token=${encodeURIComponent(token)}`;
}

/** Has this user ever signed into the app? (lib/mobile-session.ts logs it.) */
export async function hasSignedIntoApp(userId: string): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const hit = await prisma.onboardingEvent.findFirst({ where: { userId, event: "app_signed_in" }, select: { id: true } });
  return !!hit;
}
