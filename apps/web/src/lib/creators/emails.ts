import "server-only";

/**
 * Creator emails (Resend). Four creator-facing sends, per the spec:
 * dashboard invite / sign-in link, first referred signup, each payout, and a
 * post we boost. Plus the admin payout-run notice.
 *
 * All sends go through sendEmailOrThrow (the Resend SDK does not throw on
 * API errors). Callers wrap these so an email failure never blocks money.
 */

import { prisma } from "@/lib/prisma";
import { sendEmailOrThrow } from "@/lib/resend";
import { escapeHtml } from "@/lib/escape-html";

import {
  ADMIN_ALERT_EMAIL,
  CREATOR_EMAIL_FROM,
  CREATOR_EMAIL_REPLY_TO,
  HOLD_DAYS,
  SITE_URL,
} from "./config";
import { firstNameOf, formatCents } from "./money";
import { signMagicLinkToken } from "./session";

function layout(bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1b22">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:22px;padding:28px;font-size:15px;line-height:1.5">
${bodyHtml}
<p style="margin-top:28px;color:#77737f;font-size:13px">Keenan, Ripple<br/>Reply to this email with any question.</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#e8735a;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${escapeHtml(label)}</a></p>`;
}

async function creatorFor(creatorId: string) {
  const c = await prisma.ugcCreator.findUnique({
    where: { id: creatorId },
    select: {
      id: true,
      email: true,
      firstName: true,
      displayName: true,
      handle: true,
      referralCode: true,
      dashboardTokenVersion: true,
    },
  });
  if (!c?.email) throw new Error(`creator ${creatorId} has no email`);
  return { ...c, email: c.email, name: c.firstName ?? firstNameOf(c.displayName, null) };
}

export function magicLinkUrl(creatorId: string, version: number): string {
  return `${SITE_URL}/creators/login?t=${encodeURIComponent(signMagicLinkToken(creatorId, version))}`;
}

async function send(to: string, subject: string, html: string) {
  await sendEmailOrThrow({
    from: CREATOR_EMAIL_FROM,
    replyTo: CREATOR_EMAIL_REPLY_TO,
    to,
    subject,
    html,
  });
}

/** Welcome-to-the-program invite (status deal) or a plain sign-in link. */
export async function sendDashboardLink(creatorId: string, kind: "invite" | "signin"): Promise<void> {
  const c = await creatorFor(creatorId);
  const url = magicLinkUrl(c.id, c.dashboardTokenVersion);
  const link = `${SITE_URL}/c/${c.referralCode}`;
  const html =
    kind === "invite"
      ? layout(`<p>Hi ${escapeHtml(c.name)},</p>
<p>Your Ripple creator dashboard is ready. Your link is <a href="${link}">${link.replace("https://", "")}</a> and your code is <strong>${escapeHtml(c.referralCode ?? "")}</strong>.</p>
<p>Before your first payout, two quick things in the dashboard: accept the creator agreement and connect Stripe so we can pay you. It takes about five minutes.</p>
<p>Your Ripple Pro is free while you're working with us: download Ripple and sign up with this same email address (${escapeHtml(c.email)}) and Pro switches on automatically. If you sign in with Apple, choose to share your email rather than hide it.</p>
${button(url, "Open my dashboard")}
<p style="color:#77737f;font-size:13px">This link signs you in for 7 days. You can always ask for a new one at ${SITE_URL.replace("https://", "")}/creators.</p>`)
      : layout(`<p>Hi ${escapeHtml(c.name)},</p><p>Here's your sign-in link for the Ripple creator dashboard.</p>${button(url, "Open my dashboard")}<p style="color:#77737f;font-size:13px">It works for 7 days. If you didn't ask for it, ignore this email.</p>`);
  await send(c.email, kind === "invite" ? "Your Ripple creator dashboard" : "Your Ripple dashboard link", html);
  if (kind === "invite") {
    await prisma.ugcCreator.update({ where: { id: c.id }, data: { dashboardInvitedAt: new Date() } });
  }
}

export async function sendFirstSignupEmail(creatorId: string): Promise<void> {
  const c = await creatorFor(creatorId);
  await send(
    c.email,
    "Your first Ripple signup",
    layout(`<p>Hi ${escapeHtml(c.name)},</p>
<p>Someone just signed up for Ripple through your link. You'll earn 25% of what they pay for their first 12 months, starting with their first payment after the free trial.</p>
${button(`${SITE_URL}/creators`, "See your dashboard")}`)
  );
}

export async function sendBoostEmail(creatorId: string, postUrl: string): Promise<void> {
  const c = await creatorFor(creatorId);
  await send(
    c.email,
    "We're running your post as an ad",
    layout(`<p>Hi ${escapeHtml(c.name)},</p>
<p>We liked <a href="${escapeHtml(postUrl)}">your post</a> enough to run it as an ad. A $100 boost bonus is now in your balance, and any signups from the ad still count toward your commission.</p>
${button(`${SITE_URL}/creators`, "See your dashboard")}`)
  );
}

export async function sendPayoutStatement(payoutId: string): Promise<void> {
  const p = await prisma.creatorPayout.findUniqueOrThrow({
    where: { id: payoutId },
    select: { id: true, creatorId: true, amount: true, rail: true, entryIds: true, sentAt: true },
  });
  const c = await creatorFor(p.creatorId);
  const ids = (p.entryIds as string[]) ?? [];
  const rows = await prisma.creatorLedgerEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { payableAt: "asc" },
    select: { type: true, amount: true, payableAt: true, reason: true },
  });
  const lines = rows
    .map(
      (r) =>
        `<tr><td style="padding:4px 0;color:#77737f">${r.payableAt.toISOString().slice(0, 10)}</td><td style="padding:4px 8px">${escapeHtml(labelFor(r.type))}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums">${formatCents(r.amount)}</td></tr>`
    )
    .join("");
  const via = p.rail === "stripe_connect" ? "Stripe" : p.rail === "paypal" ? "PayPal" : "manual transfer";
  await send(
    c.email,
    `Ripple payout: ${formatCents(p.amount)}`,
    layout(`<p>Hi ${escapeHtml(c.name)},</p>
<p>We just sent you <strong>${formatCents(p.amount)}</strong> via ${via}. Here's what it covers:</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${lines}</table>
<p style="color:#77737f;font-size:13px">Commissions wait ${HOLD_DAYS} days after each payment before they're paid. The full statement and a CSV are in your dashboard.</p>
${button(`${SITE_URL}/creators`, "See your dashboard")}`)
  );
}

export async function sendAdminNotice(subject: string, bodyHtml: string): Promise<void> {
  await send(ADMIN_ALERT_EMAIL, subject, layout(bodyHtml));
}

export function labelFor(type: string): string {
  switch (type) {
    case "commission":
      return "Commission";
    case "clawback":
      return "Refund reversal";
    case "boost_bonus":
      return "Boost bonus";
    case "milestone_bonus":
      return "Milestone bonus";
    case "adjustment":
      return "Adjustment";
    case "payout":
      return "Payout";
    default:
      return type;
  }
}
