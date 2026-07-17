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
      const text = `\u{1F389} New Ripple signup: ${firstName} (${email}) via ${signupMethod}${campaign ? ` | campaign: ${campaign}` : ""}`;
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
 * Map a raw payment `source` tag to a human-readable label + a subject
 * headline, so every founder payment email says AT A GLANCE which path
 * paid. Sources in the wild:
 *   - "in_app_upgrade"    → web /upgrade (existing user, Stripe)
 *   - "onboarding_funnel" → web-to-app funnel paywall (Stripe, trial)
 *   - "apple"             → mobile Apple IAP (verify-receipt write)
 *   - "google_play"       → mobile Google Play IAP (verify-receipt write)
 *   - anything else       → "Direct" fallback
 */
function describePaymentSource(source: string): {
  label: string;
  headline: string;
} {
  switch (source) {
    case "in_app_upgrade":
      return { label: "In-app upgrade", headline: "In-app Pro upgrade" };
    case "onboarding_funnel":
      return { label: "Onboarding funnel", headline: "Funnel conversion" };
    case "apple":
      return { label: "Mobile IAP (Apple)", headline: "Mobile IAP upgrade" };
    case "google_play":
      return {
        label: "Mobile IAP (Google Play)",
        headline: "Mobile IAP upgrade",
      };
    default:
      return { label: "Direct", headline: "New payment" };
  }
}

/**
 * Notify founders when someone completes a paid subscription. Fired from
 * the Stripe webhook (funnel + web /upgrade) and the IAP verify-receipt
 * write path (mobile Apple/Google). Same fail-soft pattern as signup
 * notifications. Idempotency is the CALLER's responsibility — the Stripe
 * webhook dedups on event.id, and the IAP path only calls this on a
 * genuinely new transaction (first write), so this never double-sends.
 *
 * The `source` tag drives a clear label in BOTH the subject and body so
 * we can tell in-app upgrades from funnel conversions at a glance.
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
  const { label, headline } = describePaymentSource(source);

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const timeStr = timestamp.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });

    await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      subject: `\u{1F4B0} ${headline} — ${email} (${plan})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">${headline}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${email}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${plan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Source</td><td style="padding:8px 0;font-weight:600;">${label}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${timeStr}</td></tr>
          </table>
        </div>
      `,
    });
  } catch (err) {
    console.error("[founder-notification] Payment email failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Alert founders when the nightly Stripe reconciliation finds SEV1 drift
 * (a paying customer locked out — Stripe active/trialing but our DB withholds
 * access) or aborts because drift exceeded its safety threshold (upstream
 * breakage). Same fail-soft email + Slack pattern as the other notifiers.
 */
export async function notifyFoundersOfReconciliationAlert(params: {
  sev1Count: number;
  aborted: boolean;
  totalDrifts: number;
  applied: boolean;
  sampleEmails: string[];
}): Promise<void> {
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;
  const { sev1Count, aborted, totalDrifts, applied, sampleEmails } = params;

  const headline = aborted
    ? `\u{1F6A8} Stripe reconciliation ABORTED — ${totalDrifts} drifts over threshold`
    : `\u{1F6A8} Stripe reconciliation: ${sev1Count} paying customer(s) locked out`;
  const sample = sampleEmails.slice(0, 10).join(", ") || "(none)";

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    await resend.emails.send({
      from: EMAIL_FROM,
      to: FOUNDER_NOTIFICATION_RECIPIENTS,
      subject: headline,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">${headline}</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">SEV1 (paid, locked out)</td><td style="padding:8px 0;font-weight:600;">${sev1Count}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Total drifts</td><td style="padding:8px 0;font-weight:600;">${totalDrifts}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Repairs applied</td><td style="padding:8px 0;font-weight:600;">${applied ? "yes" : "no (observe-only / aborted)"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Sample</td><td style="padding:8px 0;">${sample}</td></tr>
          </table>
        </div>
      `,
    });
  } catch (err) {
    console.error("[founder-notification] Reconciliation alert email failed:", err instanceof Error ? err.message : err);
  }

  const slackUrl = process.env.SLACK_FOUNDER_WEBHOOK_URL;
  if (slackUrl) {
    try {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `${headline} | total=${totalDrifts} applied=${applied} | ${sample}` }),
      });
    } catch {
      /* best-effort */
    }
  }
}
