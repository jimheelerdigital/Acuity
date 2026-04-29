/**
 * Real-time founder notification on every new signup. Sends an email
 * to both cofounders with full attribution data and live counts.
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
  email: string | null;
  isFoundingMember: boolean;
  foundingMemberNumber: number | null;
  trialDays: number;
  attribution?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    referrer?: string;
    landingPath?: string;
  };
}): Promise<void> {
  // Env toggle — default enabled
  if (process.env.FOUNDER_NOTIFICATIONS_ENABLED === "false") return;

  const { userId, email, isFoundingMember, foundingMemberNumber, trialDays, attribution } = params;

  if (!email) {
    console.warn("[founder-notification] Skipping — user has no email");
    return;
  }

  const { prisma } = await import("@/lib/prisma");

  // Pull live counts
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let signupsTodayCount = 0;
  let foundingMembersClaimedCount = 0;
  try {
    [signupsTodayCount, foundingMembersClaimedCount] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { isFoundingMember: true } }),
    ]);
  } catch {
    // Non-fatal — proceed with 0s
  }

  // Parse name
  const { getResendClient } = await import("@/lib/resend");
  const {
    founderNotificationSubject,
    founderNotificationHtml,
  } = await import("@/emails/founder-signup-notification");

  // Look up user for name
  let userName: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, createdAt: true },
    });
    userName = user?.name ?? null;
  } catch {
    // Non-fatal
  }

  const nameParts = (userName ?? "").trim().split(/\s+/);
  const firstName = nameParts[0] || email.split("@")[0];
  const lastName = nameParts.slice(1).join(" ") || "";

  const vars = {
    firstName,
    lastName,
    email,
    foundingMemberNumber,
    isFoundingMember,
    trialDays,
    signupUtmSource: attribution?.utmSource ?? null,
    signupUtmCampaign: attribution?.utmCampaign ?? null,
    signupLandingPath: attribution?.landingPath ?? null,
    signupReferrer: attribution?.referrer ?? null,
    createdAt: new Date(),
    signupsTodayCount,
    foundingMembersClaimedCount,
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
      const source = attribution?.utmSource || "direct";
      const fmTag = foundingMemberNumber
        ? `Founding Member #${foundingMemberNumber}`
        : "standard trial";
      const text = `\u{1F389} New Acuity signup: ${firstName} from ${source} \u2014 ${fmTag}`;
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
