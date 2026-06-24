import {
  NOTIFICATION_VARIANT_COUNTS,
  renderNotification,
} from "@/emails/notifications/registry";
import type { NotifTone, NotifVars } from "@/emails/notifications/types";
import {
  signCategoryOptOutToken,
  signUnsubscribeToken,
} from "@/lib/email-tokens";
import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";

import { hashString, type CandidateUser, type Decision } from "./eligibility";

const DEFAULT_APP_URL = "https://www.getacuity.io";

function baseUrl(): string {
  return process.env.APP_URL ?? DEFAULT_APP_URL;
}

function firstNameFrom(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

function shortErr(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  resendId?: string;
}

/**
 * Render + send one engagement notification email, with the NotificationLog
 * row as the idempotency token:
 *   1. INSERT the log row first — the unique (userId, category, localDay)
 *      makes a duplicate send impossible even under racing cron ticks
 *      (P2002 → already sent this category today).
 *   2. Send via Resend.
 *   3. Stamp resendId (for the open/click webhook), or mark "failed".
 * The caller has already claimed the 18h gate (lastNotifiedAt) atomically.
 */
export async function sendNotification(
  user: CandidateUser,
  decision: Extract<Decision, { action: "send" }>
): Promise<SendResult> {
  const { candidate, localDay } = decision;
  const category = candidate.category;
  const variantCount = NOTIFICATION_VARIANT_COUNTS[category] ?? 1;
  const variantIndex = hashString(`${user.id}:${localDay}`) % variantCount;
  const tone: NotifTone = user.prefs.tone === "direct" ? "direct" : "caring";

  const base = baseUrl();
  const unsubscribeUrl = `${base}/api/emails/unsubscribe?token=${encodeURIComponent(
    signUnsubscribeToken(user.id, "engagement_notifications")
  )}`;
  const vars: NotifVars = {
    firstName: firstNameFrom(user.name),
    appUrl: `${base}/?src=notif_${category}`,
    manageUrl: `${base}/account#notifications`,
    unsubscribeUrl,
    categoryOptOutUrl: `${base}/api/notifications/opt-out?token=${encodeURIComponent(
      signCategoryOptOutToken(user.id, category)
    )}`,
    streakCount: candidate.streakCount,
    milestoneTitle: candidate.milestoneTitle,
  };

  const rendered = renderNotification({ category, variantIndex, tone, vars });

  // 1. Claim via the log row (idempotent on the unique index).
  let logId: string;
  try {
    const row = await prisma.notificationLog.create({
      data: {
        userId: user.id,
        category,
        channel: "email",
        templateVariant: String(variantIndex),
        refId: candidate.refId ?? null,
        localDay,
        status: "sent",
        renderedSubject: rendered.subject,
        renderedBody: rendered.html,
      },
      select: { id: true },
    });
    logId = row.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { sent: false, reason: "already_sent_today" };
    }
    throw err;
  }

  // 2. Send.
  try {
    const resend = getResendClient();
    const resp = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const resendId = resp.data?.id ?? null;
    // 3. Stamp for the open/click webhook.
    await prisma.notificationLog.update({
      where: { id: logId },
      data: { resendId },
    });
    return { sent: true, resendId: resendId ?? undefined };
  } catch (err) {
    await prisma.notificationLog
      .update({
        where: { id: logId },
        data: { status: "failed", skipReason: shortErr(err) },
      })
      .catch(() => {});
    return { sent: false, reason: "send_failed" };
  }
}
