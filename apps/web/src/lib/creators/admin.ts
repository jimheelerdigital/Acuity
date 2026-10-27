import "server-only";

/**
 * Admin-side creator actions: issue codes, invite to the dashboard, grant
 * the free-premium perk, and the weekly Stripe reconciliation.
 */

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { RECONCILE_TOLERANCE_CENTS } from "./config";
import { firstNameOf } from "./money";

const DEAL_OR_LATER = new Set(["deal", "briefed", "delivered", "paid"]);

/**
 * Give a creator their referral code (idempotent — an existing code is
 * kept). Allowed from status deal onward, or always with `force` (manual add).
 */
export async function issueReferralCode(creatorId: string, opts: { force?: boolean } = {}): Promise<string> {
  const c = await prisma.ugcCreator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { id: true, status: true, referralCode: true, displayName: true, handle: true, firstName: true, email: true, selfFingerprints: true },
  });
  if (c.referralCode) return c.referralCode;
  if (!opts.force && !DEAL_OR_LATER.has(c.status)) {
    throw new Error(`creator is "${c.status}"; codes are issued from "deal" on`);
  }
  const fp = (c.selfFingerprints ?? {}) as { emails?: string[] };
  const emails = Array.from(new Set([...(fp.emails ?? []), ...(c.email ? [c.email.toLowerCase()] : [])]));
  await prisma.ugcCreator.update({
    where: { id: c.id },
    data: {
      firstName: c.firstName ?? firstNameOf(c.displayName, c.handle),
      selfFingerprints: { ...((c.selfFingerprints as object | null) ?? {}), emails },
    },
  });
  const { assignGeneratedCode } = await import("./codes");
  return assignGeneratedCode(c.id);
}

/**
 * Status deal: issue the code and send the dashboard invite (which asks for
 * agreement acceptance + Stripe onboarding). Safe to call repeatedly; the
 * invite goes once unless `resend`.
 */
export async function onCreatorDeal(creatorId: string, opts: { resend?: boolean } = {}): Promise<void> {
  await issueReferralCode(creatorId, { force: true });
  const c = await prisma.ugcCreator.findUniqueOrThrow({
    where: { id: creatorId },
    select: { email: true, dashboardInvitedAt: true },
  });
  if (!c.email) {
    safeLog.warn("creators.deal.no-email", { creatorId });
    return;
  }
  if (c.dashboardInvitedAt && !opts.resend) return;
  const { sendDashboardLink } = await import("./emails");
  await sendDashboardLink(creatorId, "invite");
}

/**
 * Free Ripple premium while active: link the creator's Ripple account by
 * email and comp it (same durable comp as /api/admin/comp). The account is
 * also recorded as the creator's own, so it can never count as a referral.
 */
export async function grantCreatorPremium(creatorId: string, email: string, by: string) {
  const { COMP_SUBSCRIPTION_SOURCE } = await import("@/lib/entitlements");
  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, subscriptionStatus: true, subscriptionSource: true, pushToken: true },
  });
  if (!user) throw new Error("No Ripple account with that email. Ask them to sign up first.");
  const c = await prisma.ugcCreator.findUniqueOrThrow({ where: { id: creatorId }, select: { selfFingerprints: true } });
  const fp = (c.selfFingerprints ?? {}) as { emails?: string[]; devices?: string[]; payments?: string[] };
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { subscriptionStatus: "PRO", subscriptionSource: COMP_SUBSCRIPTION_SOURCE, trialEndsAt: null, stripeFirstFailureAt: null },
    }),
    prisma.ugcCreator.update({
      where: { id: creatorId },
      data: {
        userId: user.id,
        selfFingerprints: {
          ...fp,
          emails: Array.from(new Set([...(fp.emails ?? []), email.trim().toLowerCase()])),
          devices: Array.from(new Set([...(fp.devices ?? []), ...(user.pushToken ? [user.pushToken] : [])])),
        },
      },
    }),
  ]);
  const { ADMIN_ACTIONS, logAdminAction } = await import("@/lib/admin-audit");
  await logAdminAction({
    adminUserId: by,
    action: ADMIN_ACTIONS.USER_COMP,
    targetUserId: user.id,
    metadata: { reason: "creator premium perk", creatorId, from: `${user.subscriptionStatus}/${user.subscriptionSource ?? "null"}` },
  }).catch(() => {});
  return user.id;
}

/**
 * Weekly: compare the ledger's Stripe revenue per creator with Stripe's own
 * paid invoices for the same customers since their referral. A gap over $1
 * opens a data flag. (App-store revenue has no per-customer transaction API
 * in RevenueCat v1, so it is reconciled by the RC dashboard by hand.)
 */
export async function reconcileStripe(): Promise<Array<{ creatorId: string; ledgerCents: number; stripeCents: number }>> {
  const { stripe } = await import("@/lib/stripe");
  const gaps: Array<{ creatorId: string; ledgerCents: number; stripeCents: number }> = [];
  const refs = await prisma.creatorReferral.findMany({
    where: { firstPaidAt: { not: null } },
    select: { creatorId: true, userId: true, attributedAt: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: refs.map((r) => r.userId) }, stripeCustomerId: { not: null } },
    select: { id: true, stripeCustomerId: true },
  });
  const custBy = new Map(users.map((u) => [u.id, u.stripeCustomerId!]));
  const perCreator = new Map<string, { ledger: number; stripe: number }>();
  for (const r of refs) {
    const cust = custBy.get(r.userId);
    if (!cust) continue;
    const ledger = await prisma.creatorRevenueEvent.aggregate({
      where: { userId: r.userId, source: "stripe", type: "payment" },
      _sum: { amountPaid: true },
    });
    let stripeTotal = 0;
    for await (const inv of stripe.invoices.list({
      customer: cust,
      status: "paid",
      created: { gte: Math.floor(r.attributedAt.getTime() / 1000) - 3600 },
      limit: 100,
    })) {
      stripeTotal += inv.amount_paid;
    }
    const g = perCreator.get(r.creatorId) ?? { ledger: 0, stripe: 0 };
    g.ledger += ledger._sum.amountPaid ?? 0;
    g.stripe += stripeTotal;
    perCreator.set(r.creatorId, g);
  }
  for (const [creatorId, g] of Array.from(perCreator.entries())) {
    if (Math.abs(g.ledger - g.stripe) > RECONCILE_TOLERANCE_CENTS) {
      gaps.push({ creatorId, ledgerCents: g.ledger, stripeCents: g.stripe });
    }
  }
  return gaps;
}


/**
 * Add a creator straight into the program (2026-10-25, per Keenan): for
 * creators who said yes in DMs. Creates or updates the creator by handle,
 * sets their email + first name, marks them "deal", issues their code (custom
 * if given and available, else random) and, unless told not to, emails the
 * dashboard invite. Skips the old outreach scoring/drafting entirely.
 */
export async function addCreatorDirect(input: {
  handle: string;
  email: string;
  firstName: string;
  platform?: string;
  code?: string;
  sendInvite?: boolean;
  by: string;
}): Promise<{ creatorId: string; code: string; invited: boolean; codeNote?: string; proNote: string }> {
  const raw = input.handle.trim();
  const platform = input.platform === "tiktok" || /tiktok\.com/i.test(raw) ? "tiktok" : "instagram";
  const handle = raw.replace(/\?.*$/, "").replace(/^https?:\/\/[^/]+\//i, "").replace(/^@/, "").replace(/\/$/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,40}$/.test(handle)) throw new Error(`Not a valid handle: "${input.handle}"`);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
  const firstName = input.firstName.trim().slice(0, 40);
  if (!firstName) throw new Error("First name required");

  const { newTrackingCode } = await import("@/lib/ugc/status");
  const existing = await prisma.ugcCreator.findUnique({
    where: { platform_handle: { platform, handle } },
    select: { id: true, status: true, email: true, referralCode: true },
  });
  // Audit 2026-10-27: re-adding a handle that's already in the program with a
  // different email would re-point its dashboard sign-in (and so its payout
  // details) at the new address. Only a full admin may do that.
  if (existing?.referralCode && existing.email && existing.email.toLowerCase() !== email && input.by.startsWith("desk:")) {
    throw new Error(`@${handle} is already in the program with a different email. Ask Keenan to change it in admin.`);
  }
  const creator = existing
    ? await prisma.ugcCreator.update({
        where: { id: existing.id },
        // Never move a creator who is further along (briefed/delivered/paid) back to "deal".
        data: { email, firstName, displayName: firstName, ...(DEAL_OR_LATER.has(existing.status) ? {} : { status: "deal" as const }) },
        select: { id: true },
      })
    : await prisma.ugcCreator.create({
        data: {
          platform,
          handle,
          source: "manual",
          trackingCode: newTrackingCode(),
          status: "deal",
          email,
          firstName,
          displayName: firstName,
          notes: "Added from Creator payouts (said yes in DMs)",
        },
        select: { id: true },
      });
  if (!existing || !DEAL_OR_LATER.has(existing.status)) {
    await prisma.ugcStatusEvent.create({
      data: { creatorId: creator.id, from: existing?.status ?? null, to: "deal", by: input.by, note: "added to the creator program" },
    });
  }

  let code = await issueReferralCode(creator.id, { force: true });
  let codeNote: string | undefined;
  if (input.code?.trim()) {
    const { setCustomCode } = await import("./codes");
    const r = await setCustomCode(creator.id, input.code, `admin:${input.by}`);
    if (r.ok) code = r.code;
    else codeNote = `Custom code not used (${r.message}). They got ${code} and can pick their own on the dashboard.`;
  }

  let invited = false;
  if (input.sendInvite !== false) {
    await onCreatorDeal(creator.id, { resend: true });
    invited = true;
  }
  // Already has a Ripple account with this email? Free Pro now; otherwise it
  // switches on when they sign up (bootstrapNewUser → autoGrantCreatorPerk).
  const perk = await autoGrantCreatorPerk(email, `admin:${input.by}`);
  const proNote = perk.granted
    ? perk.alreadyPaying
      ? "Ripple Pro is on. Heads-up: they were already paying for a subscription. It keeps billing until it's cancelled, so cancel/refund it by hand."
      : "They already had a Ripple account, so Ripple Pro is on now."
    : "Ripple Pro switches on automatically when they sign up with this email.";
  return { creatorId: creator.id, code, invited, codeNote, proNote };
}


/**
 * Free Ripple Pro for creators, automatically (2026-10-25, per Keenan: "any
 * email that signs up for an affiliate program also gets a free account with
 * Ripple Pro when they sign up with the same email").
 *
 * Called (a) from bootstrapNewUser for every new account, and (b) when a
 * creator is added and already has a Ripple account. Matches a creator in the
 * program (has a referral code) by email, then reuses grantCreatorPremium:
 * durable comp PRO + marks the account as the creator's own (never a referral).
 * Does NOT cancel an existing paid subscription; the caller is told so a
 * founder can cancel/refund it by hand. Never throws.
 */
export async function autoGrantCreatorPerk(
  email: string | null | undefined,
  by: string
): Promise<{ granted: boolean; creatorId?: string; alreadyPaying?: boolean }> {
  try {
    const e = (email ?? "").trim().toLowerCase();
    if (!e) return { granted: false };
    const creator = await prisma.ugcCreator.findFirst({
      where: { email: { equals: e, mode: "insensitive" }, referralCode: { not: null } },
      select: { id: true },
    });
    if (!creator) return { granted: false };
    const user = await prisma.user.findFirst({
      where: { email: e },
      select: { id: true, subscriptionStatus: true, subscriptionSource: true, stripeSubscriptionId: true },
    });
    if (!user) return { granted: false, creatorId: creator.id };
    const alreadyPaying =
      user.subscriptionStatus === "PRO" && user.subscriptionSource !== "comp" && Boolean(user.subscriptionSource || user.stripeSubscriptionId);
    await grantCreatorPremium(creator.id, e, by);
    safeLog.info("creators.perk.granted", { creatorId: creator.id, userId: user.id, alreadyPaying });
    return { granted: true, creatorId: creator.id, alreadyPaying };
  } catch (err) {
    safeLog.warn("creators.perk.failed", { err: err instanceof Error ? err.message : String(err) });
    return { granted: false };
  }
}
