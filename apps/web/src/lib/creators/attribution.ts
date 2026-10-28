import "server-only";

/**
 * Creator referral attribution — three roads into ONE account-level record
 * (CreatorReferral, unique per userId). The first road to match wins for the
 * life of the account; later clicks or codes change nothing. Only an admin
 * reassign (lib/creators/admin.ts) moves a referral.
 *
 *   Road 1 — web_cookie:  rp_click cookie from goripple.io/c/<CODE>, ≤ 90 days
 *   Road 2 — code:        code typed in app onboarding (POST /api/creators/code)
 *   Road 3 — email_match: email captured on the landing's store step, ≤ 30 days,
 *                         and VERIFIED (the owner opened our email's link —
 *                         lib/creators/email-capture). An unverified capture
 *                         never attributes: the capture endpoint is public.
 *
 * Every function here is best-effort from the caller's point of view: a
 * failure is logged and never breaks signup.
 */

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import {
  CLICK_COOKIE,
  CLICK_COOKIE_DAYS,
  EMAIL_MATCH_DAYS,
} from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;
/** An account older than this at attribution time is not "new". */
const NEW_ACCOUNT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ReferralSource = "web_cookie" | "code" | "email_match" | "admin";

export type WriteReferralResult =
  | { ok: true; referralId: string; creatorId: string }
  | {
      ok: false;
      reason:
        | "already_referred"
        | "not_new"
        | "self_referral"
        | "unknown_creator"
        | "no_user"
        | "error";
    };

interface SelfFingerprints {
  emails?: string[];
  devices?: string[];
  payments?: string[];
}

export function fingerprintsOf(json: unknown): Required<SelfFingerprints> {
  const f = (json ?? {}) as SelfFingerprints;
  const arr = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
  return {
    emails: arr(f.emails).map((e) => e.toLowerCase()),
    devices: arr(f.devices),
    payments: arr(f.payments),
  };
}

/**
 * Is this account the creator's own? Email, device (push token) or a
 * payment fingerprint matching the creator's own.
 */
export async function isSelfReferral(
  creator: { id: string; email: string | null; userId: string | null; selfFingerprints: unknown },
  user: { id: string; email: string; pushToken: string | null }
): Promise<boolean> {
  if (creator.userId && creator.userId === user.id) return true;
  const fp = fingerprintsOf(creator.selfFingerprints);
  const emails = new Set([...fp.emails, ...(creator.email ? [creator.email.toLowerCase()] : [])]);
  if (creator.userId) {
    const own = await prisma.user.findUnique({
      where: { id: creator.userId },
      select: { email: true, pushToken: true },
    });
    if (own?.email) emails.add(own.email.toLowerCase());
    if (own?.pushToken) fp.devices.push(own.pushToken);
  }
  if (emails.has(user.email.toLowerCase())) return true;
  if (user.pushToken && fp.devices.includes(user.pushToken)) return true;
  return false;
}

/** Any sign the account already has (or had) a subscription. PURE. */
export function alreadySubscribed(u: {
  subscriptionStatus?: string | null;
  subscriptionSource?: string | null;
  stripeSubscriptionId?: string | null;
  appleOriginalTransactionId?: string | null;
  googlePurchaseToken?: string | null;
}): boolean {
  return Boolean(
    u.subscriptionSource ||
      u.stripeSubscriptionId ||
      u.appleOriginalTransactionId ||
      u.googlePurchaseToken ||
      (u.subscriptionStatus ?? "").toUpperCase() === "PRO" ||
      (u.subscriptionStatus ?? "").toUpperCase() === "PAST_DUE"
  );
}

/**
 * Write the one referral record for an account. Rejects an existing record,
 * an account that isn't new (or already paid), and self-referrals.
 */
export async function writeReferral(params: {
  userId: string;
  creatorId: string;
  source: ReferralSource;
  clickId?: string | null;
  /** Admin writes skip the new-account check. */
  reason?: string | null;
}): Promise<WriteReferralResult> {
  const { userId, creatorId, source } = params;
  try {
    const [user, creator, existing] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          createdAt: true,
          pushToken: true,
          stripeCustomerId: true,
          subscriptionStatus: true,
          subscriptionSource: true,
          stripeSubscriptionId: true,
          appleOriginalTransactionId: true,
          googlePurchaseToken: true,
        },
      }),
      prisma.ugcCreator.findUnique({
        where: { id: creatorId },
        select: { id: true, email: true, userId: true, selfFingerprints: true, referralCode: true },
      }),
      prisma.creatorReferral.findUnique({ where: { userId }, select: { id: true } }),
    ]);
    if (!user) return { ok: false, reason: "no_user" };
    if (!creator?.referralCode) return { ok: false, reason: "unknown_creator" };
    if (existing) return { ok: false, reason: "already_referred" };

    if (source !== "admin") {
      const age = Date.now() - user.createdAt.getTime();
      if (age > NEW_ACCOUNT_MAX_AGE_MS) return { ok: false, reason: "not_new" };
      // Already subscribed (paid OR in a store/Stripe trial) before the
      // referral → not the creator's customer. (The old check counted
      // CreatorRevenueEvent rows, which only exist for referred users, so
      // it could never fire.) Every legitimate road runs before the
      // paywall: web cookie / email at signup, the app code right after
      // the account exists.
      if (alreadySubscribed(user)) return { ok: false, reason: "not_new" };
    }

    if (await isSelfReferral(creator, user)) {
      safeLog.warn("creators.referral.self-referral-rejected", { userId, creatorId, source });
      return { ok: false, reason: "self_referral" };
    }

    const row = await prisma.creatorReferral.create({
      data: {
        userId,
        creatorId,
        source,
        clickId: params.clickId ?? null,
        reason: params.reason ?? null,
      },
      select: { id: true },
    });
    safeLog.info("creators.referral.written", { userId, creatorId, source });

    // Carry the creator on every later payment event. Best-effort.
    await tagPaymentProviders(userId, creatorId, user.stripeCustomerId).catch(() => {});

    // First referred signup for this creator → tell them. Best-effort.
    const count = await prisma.creatorReferral.count({ where: { creatorId } });
    if (count === 1) {
      const { sendFirstSignupEmail } = await import("./emails");
      await sendFirstSignupEmail(creatorId).catch((err) =>
        safeLog.warn("creators.email.first-signup-failed", {
          creatorId,
          err: err instanceof Error ? err.message : String(err),
        })
      );
    }
    return { ok: true, referralId: row.id, creatorId };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") return { ok: false, reason: "already_referred" };
    safeLog.error("creators.referral.write-failed", err, { userId, creatorId, source });
    return { ok: false, reason: "error" };
  }
}

/** Stripe customer metadata + RevenueCat subscriber attribute. */
export async function tagPaymentProviders(
  userId: string,
  creatorId: string,
  stripeCustomerId: string | null
): Promise<void> {
  if (stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
    const { stripe } = await import("@/lib/stripe");
    await stripe.customers
      .update(stripeCustomerId, { metadata: { creator_id: creatorId } })
      .catch((err) =>
        safeLog.warn("creators.tag.stripe-failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        })
      );
  }
  const rcKey = process.env.RC_PUBLIC_KEY_IOS ?? process.env.RC_PUBLIC_KEY_STRIPE;
  if (rcKey) {
    await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/attributes`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${rcKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          attributes: { creator_id: { value: creatorId, updated_at_ms: Date.now() } },
        }),
      }
    ).catch((err) =>
      safeLog.warn("creators.tag.rc-failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

/** Find a creator by any current or retired code (any case, look-alikes forgiven). */
export async function creatorByCode(raw: string | null | undefined) {
  const { resolveCode } = await import("./codes");
  return resolveCode(raw);
}

/** Read the rp_click cookie when called inside a request; null otherwise. */
async function clickIdFromRequest(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return cookies().get(CLICK_COOKIE)?.value ?? null;
  } catch {
    return null; // not in a request scope (job / script)
  }
}

/**
 * Called once from bootstrapNewUser for every new account. Road 1 (cookie),
 * then Road 3 (captured email). Road 2 arrives later via the app.
 */
export async function attributeNewUser(params: {
  userId: string;
  email: string | null;
  clickId?: string | null;
}): Promise<WriteReferralResult | null> {
  try {
    const clickId = params.clickId ?? (await clickIdFromRequest());
    if (clickId) {
      const click = await prisma.creatorReferralClick.findUnique({
        where: { clickId },
        select: { creatorId: true, clickId: true, createdAt: true },
      });
      if (click && Date.now() - click.createdAt.getTime() <= CLICK_COOKIE_DAYS * DAY_MS) {
        const r = await writeReferral({
          userId: params.userId,
          creatorId: click.creatorId,
          source: "web_cookie",
          clickId: click.clickId,
        });
        if (r.ok || r.reason !== "unknown_creator") return r;
      }
    }

    if (params.email) {
      const since = new Date(Date.now() - EMAIL_MATCH_DAYS * DAY_MS);
      const click = await prisma.creatorReferralClick.findFirst({
        where: {
          capturedEmail: params.email.trim().toLowerCase(),
          capturedEmailAt: { gte: since },
          // Proof the person who captured it owns the inbox (finding 5).
          capturedEmailVerifiedAt: { not: null },
        },
        orderBy: { capturedEmailAt: "asc" }, // first creator to capture wins
        select: { creatorId: true, clickId: true },
      });
      if (click) {
        return writeReferral({
          userId: params.userId,
          creatorId: click.creatorId,
          source: "email_match",
          clickId: click.clickId,
        });
      }
    }
    return null;
  } catch (err) {
    safeLog.error("creators.attribute-new-user-failed", err, { userId: params.userId });
    return null;
  }
}
