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
}): Promise<void> {
  // Env toggle — default enabled
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { userId, name, email, signupMethod, timestamp, campaign } = params;

  const { prisma } = await import("@/lib/prisma");
  const { getResendClient } = await import("@/lib/resend");
  const {
    founderNotificationSubject,
    founderNotificationHtml,
  } = await import("@/emails/founder-signup-notification");

  const firstName = (name ?? "").trim().split(/\s+/)[0] || email.split("@")[0];

  const vars = { firstName, email, signupMethod, timestamp, campaign: campaign ?? null };

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

/**
 * Notify founders when someone completes payment through the onboarding
 * funnel paywall. Same fail-soft pattern as signup notifications.
 */
export async function notifyFoundersOfPayment(params: {
  userId: string;
  email: string;
  plan: string;
  source: string;
  timestamp: Date;
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { email, plan, source, timestamp } = params;

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const timeStr = timestamp.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      subject: `\u{1F4B0} New payment: ${email} (${plan})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#7C5CFC;margin:0 0 16px;">New Payment</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Source</td><td style="padding:8px 0;">${source}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${timeStr}</td></tr>
          </table>
        </div>
      `,
    });
  } catch (err) {
    console.error("[founder-notification] Payment email failed:", err instanceof Error ? err.message : err);
  }
}
