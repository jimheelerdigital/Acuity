/**
 * Immediate founder notification on every new signup. Sends a simple
 * email to both cofounders with just name, email, signup method, and
 * timestamp. No attribution, no UTM data, no delays.
 *
 * Called inline from bootstrapNewUser — fail-soft so notification
 * failures never block signup.
 *
 * Toggle: set FOUNDER_NOTIFICATIONS_ENABLED=false to silence.
 * Slack: set SLACK_FOUNDER_WEBHOOK_URL for a one-liner to Slack.
 */

import "server-only";

const FOUNDER_NOTIFICATION_RECIPIENTS = [
  "keenan@heelerdigital.com",
  "jim@heelerdigital.com",
];

const EMAIL_FROM = "hello@getacuity.io";

export async function notifyFoundersOfSignup(params: {
  userId: string;
  name: string | null;
  email: string;
  signupMethod: string;
  timestamp: Date;
  campaign?: string | null;
  branch?: string | null;
  paymentStatus?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<void> {
  // Env toggle — default enabled
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { userId, name, email, signupMethod, timestamp, campaign, branch, paymentStatus, utmSource, utmMedium, utmCampaign } = params;

  const { prisma } = await import("@/lib/prisma");
  const { getResendClient } = await import("@/lib/resend");
  const {
    founderNotificationSubject,
    founderNotificationHtml,
  } = await import("@/emails/founder-signup-notification");

  const firstName = (name ?? "").trim().split(/\s+/)[0] || email.split("@")[0];

  const vars = {
    firstName,
    email,
    signupMethod,
    timestamp,
    campaign: campaign ?? null,
    branch: branch ?? null,
    paymentStatus: paymentStatus ?? null,
    utmSource: utmSource ?? null,
    utmMedium: utmMedium ?? null,
    utmCampaign: utmCampaign ?? null,
  };

  let success = false;
  let errorMessage: string | null = null;

  try {
    const resend = getResendClient();
    await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      subject: founderNotificationSubject(vars),
      html: founderNotificationHtml(vars),
    });
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[founder-notification] Email send failed:", errorMessage);
  }

  // Log the attempt
  try {
    await prisma.founderNotificationLog.create({
      data: {
        userId,
        recipientEmails: FOUNDER_NOTIFICATION_RECIPIENTS,
        success,
        errorMessage,
      },
    });
  } catch (logErr) {
    // Log table might not exist yet (pre-schema-push). Don't fail.
    console.warn("[founder-notification] Failed to write log:", logErr);
  }

  // Slack fallback (additive — never blocks)
  const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
  if (slackUrl) {
    try {
      const text = `\u{1F389} New Acuity signup: ${firstName} (${email}) via ${signupMethod}${campaign ? ` | campaign: ${campaign}` : ""}`;
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch {
      // Silent — Slack is best-effort
    }
  }
}

function chicagoTime(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function chicagoDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format(cents / 100);
}

async function sendFounderEmail(subject: string, html: string): Promise<void> {
  const { getResendClient } = await import("@/lib/resend");
  const resend = getResendClient();
  await resend.emails.send({
    from: EMAIL_FROM,
    to: FOUNDER_NOTIFICATION_RECIPIENTS,
    subject,
    html,
  });
}

/**
 * Fires on checkout.session.completed for the TRIAL funnel (no money has
 * moved yet — the card is charged when the 7-day trial converts). Renamed
 * from the old notifyFoundersOfPayment, which mislabeled a trial signup as
 * "New payment". The real money notification is notifyFoundersOfPayment
 * below (invoice.payment_succeeded). Fail-soft.
 */
export async function notifyFoundersOfTrialSignup(params: {
  email: string;
  plan: string;
  source: string;
  timestamp: Date;
  convertsOn: Date | null;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { email, plan, source, timestamp, convertsOn } = params;
  const convertsStr = convertsOn ? chicagoDate(convertsOn) : "in ~7 days";

  try {
    await sendFounderEmail(
      `\u{1F3AF} New trial signup: ${email} (${plan}) — converts on ${convertsStr}`,
      `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#7C5CFC;margin:0 0 8px;">New Trial Signup</h2>
          <p style="margin:0 0 16px;color:#444;font-weight:600;">Trial converts on ${convertsStr}. No payment yet.</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Converts on</td><td style="padding:8px 0;font-weight:600;">${convertsStr}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Source</td><td style="padding:8px 0;">${source}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Signed up</td><td style="padding:8px 0;">${chicagoTime(timestamp)}</td></tr>
          </table>
        </div>
      `
    );
  } catch (err) {
    console.error("[founder-notification] Trial-signup email failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Fires on invoice.payment_succeeded with a non-zero amount — the REAL
 * "money received" notification (trial conversion or renewal). Guard the
 * amount > 0 check at the call site so the $0 trial-start invoice doesn't
 * trigger a misleading "$0.00 received". Fail-soft.
 */
export async function notifyFoundersOfPayment(params: {
  email: string;
  plan: string;
  amountCents: number;
  currency: string;
  timestamp: Date;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { email, plan, amountCents, currency, timestamp } = params;
  const amountStr = formatMoney(amountCents, currency);

  try {
    await sendFounderEmail(
      `\u{1F4B0} Payment received: ${email} (${plan}) — ${amountStr}`,
      `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#1A7F37;margin:0 0 16px;">Payment Received</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Amount</td><td style="padding:8px 0;font-weight:600;">${amountStr}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${chicagoTime(timestamp)}</td></tr>
          </table>
        </div>
      `
    );
  } catch (err) {
    console.error("[founder-notification] Payment email failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Fires on charge.refunded — real money OUT, so it should be visible.
 * amountCents is the refunded amount (Stripe charge.amount_refunded).
 * Fail-soft.
 */
export async function notifyFoundersOfRefund(params: {
  email: string;
  amountCents: number;
  currency: string;
  timestamp: Date;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { email, amountCents, currency, timestamp } = params;
  const amountStr = formatMoney(amountCents, currency);

  try {
    await sendFounderEmail(
      `\u{1F4B8} Refund issued: ${email} — ${amountStr}`,
      `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">Refund Issued</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Refunded</td><td style="padding:8px 0;font-weight:600;">${amountStr}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${chicagoTime(timestamp)}</td></tr>
          </table>
        </div>
      `
    );
  } catch (err) {
    console.error("[founder-notification] Refund email failed:", err instanceof Error ? err.message : err);
  }
}
