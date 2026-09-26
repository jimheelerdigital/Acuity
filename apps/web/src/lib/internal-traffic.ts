/**
 * Internal traffic — our own QA, test signups and team clicks must NEVER
 * count toward the funnel (2026-09-26, per Keenan: "please make sure no
 * internal sessions ever count towards the funnel").
 *
 * Internal events are STORED with OnboardingEvent.isBot = true (real crawler
 * bots are dropped before storage, so in practice isBot=true means internal).
 * Every funnel query already filters isBot: false, so flagging at write time
 * keeps them out everywhere without touching the dashboard queries.
 *
 * A session is internal if ANY of these is true for ANY of its events:
 *   - automated browser (navigator.webdriver, sent as body.automation)
 *   - the acuity_internal=1 cookie (set by opening /admin, or visiting any
 *     funnel URL with ?internal=1)
 *   - a Playwright/devtools device-preset UA (INTERNAL_UA)
 *   - a signed-in admin, or an internal email (INTERNAL_EMAIL_DOMAINS,
 *     INTERNAL_EMAILS, env INTERNAL_EMAILS)
 * Once one event marks a session internal, the whole session is marked —
 * earlier events are back-flagged and later ones (including server-side
 * Stripe webhook events) inherit it.
 */
import type { PrismaClient } from "@prisma/client";

export const INTERNAL_COOKIE = "acuity_internal";

/** Playwright's stock device presets send UAs no real 2026 visitor has:
 *  iOS 15.0 / 10.3.1 iPhones, and Android UAs naming the Pixel model (real
 *  Chrome reduces it to "Android 10; K"; in-app WebViews add " Build/"). */
export const INTERNAL_UA = /iPhone OS (15_0|10_3_1) like Mac OS X|\bAndroid \d+; Pixel \d+( Pro)?\)|HeadlessChrome|Playwright|Puppeteer/;

const INTERNAL_EMAIL_DOMAINS = ["heelerdigital.com", "getacuity.io", "goripple.io"];
const INTERNAL_EMAILS = ["keenanassaraf@gmail.com"];

export function isInternalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const extra = (process.env.INTERNAL_EMAILS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (INTERNAL_EMAILS.includes(e) || extra.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  return INTERNAL_EMAIL_DOMAINS.includes(domain);
}

type Db = Pick<PrismaClient, "user" | "onboardingEvent">;

export async function isInternalUser(db: Db, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { isAdmin: true, email: true } });
  return !!u && (u.isAdmin || isInternalEmail(u.email));
}

/** True when any stored event of this session or user is already flagged. */
export async function isInternalSession(
  db: Db,
  sessionToken: string | null | undefined,
  userId?: string | null
): Promise<boolean> {
  const or = [
    ...(sessionToken ? [{ sessionToken }] : []),
    ...(userId ? [{ userId }] : []),
  ];
  if (or.length === 0) return false;
  const hit = await db.onboardingEvent.findFirst({ where: { isBot: true, OR: or }, select: { id: true } });
  return !!hit;
}

/** Back-flag every earlier event of this session (and user) as internal. */
export async function flagSessionInternal(
  db: Db,
  sessionToken: string | null | undefined,
  userId?: string | null
): Promise<void> {
  const or = [
    ...(sessionToken ? [{ sessionToken }] : []),
    ...(userId ? [{ userId }] : []),
  ];
  if (or.length === 0) return;
  await db.onboardingEvent.updateMany({ where: { isBot: false, OR: or }, data: { isBot: true } });
}
