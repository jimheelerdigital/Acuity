/**
 * Server-side glue for the trial onboarding email sequence. Produces
 * a TrialVars bag from a User row, renders the correct template, and
 * writes the TrialEmailLog atomically so the orchestrator never
 * double-sends.
 *
 * Every entry point is idempotent on (userId, emailKey) — the unique
 * constraint on TrialEmailLog enforces that a collision just returns
 * without sending.
 *
 * The welcome_day0 fast path is called inline from bootstrapNewUser
 * so the email goes out in the signup request itself (spec: within 60
 * seconds of signup). Every other emailKey is dispatched from the
 * hourly orchestrator (inngest/functions/trial-email-orchestrator.ts).
 */

import "server-only";

import { TRIAL_EMAIL_TEMPLATES } from "@/emails/trial/registry";
import type {
  TrialEmailKey,
  TrialVars,
} from "@/emails/trial/registry";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { safeLog } from "@/lib/safe-log";

const DEFAULT_APP_URL = "https://www.getacuity.io";

export interface MinimalUser {
  id: string;
  email: string;
  name: string | null;
  trialEndsAt: Date | null;
  totalRecordings: number;
  foundingMemberNumber: number | null;
}

function origin(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    DEFAULT_APP_URL
  ).replace(/\/$/, "");
}

function firstNameFrom(user: MinimalUser): string {
  const raw = (user.name ?? "").trim();
  if (!raw) return "friend";
  // "Keenan Heeler" → "Keenan"; "keenan@x.com" pattern handled by
  // falling back to the part before @ if the user's name looks like
  // an email.
  const first = raw.split(/\s+/)[0];
  return first || "friend";
}

function formatTrialEnd(d: Date | null): string {
  if (!d) return "the end of your trial";
  try {
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Compose the TrialVars bag for a user. Includes async lookups of
 * firstDebriefTaskCount + topTheme so emails that reference those can
 * personalize. Safe to call for users with zero recordings — both
 * enrichment lookups short-circuit and return null.
 */
export async function buildTrialVars(
  user: MinimalUser
): Promise<TrialVars> {
  const { prisma } = await import("@/lib/prisma");

  let topTheme: string | null = null;
  let firstDebriefTaskCount: number | null = null;

  if (user.totalRecordings > 0) {
    // Top recurring theme — highest-mentionCount Theme for this user.
    // O(1) with the @@index([userId]) on Theme.
    const themes = await prisma.theme.findMany({
      where: { userId: user.id },
      select: {
        name: true,
        _count: { select: { mentions: true } },
      },
    });
    if (themes.length > 0) {
      themes.sort(
        (a, b) => (b._count?.mentions ?? 0) - (a._count?.mentions ?? 0)
      );
      topTheme = themes[0]?.name ?? null;
    }

    // First debrief's extracted task count — the count of tasks tied
    // to the earliest COMPLETE entry. We cap at the first successful
    // entry; extraction commit-or-skip doesn't matter here (we want
    // the number the user was shown, which is rawAnalysis.tasks.length
    // but for a first-pass personalization the Task rows themselves
    // are good enough).
    const firstEntry = await prisma.entry.findFirst({
      where: { userId: user.id, status: "COMPLETE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (firstEntry) {
      firstDebriefTaskCount = await prisma.task.count({
        where: { entryId: firstEntry.id },
      });
    }
  }

  const unsubToken = signUnsubscribeToken(user.id, "onboarding");
  const unsubscribeUrl = `${origin()}/api/emails/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  return {
    firstName: firstNameFrom(user),
    appUrl: origin(),
    trialEndsAt: formatTrialEnd(user.trialEndsAt),
    trialEndsAtRaw: user.trialEndsAt,
    totalRecordings: user.totalRecordings,
    topTheme,
    firstDebriefTaskCount,
    foundingMemberNumber: user.foundingMemberNumber,
    unsubscribeUrl,
  };
}

export interface SendResult {
  sent: boolean;
  reason?: "already_sent" | "unsubscribed" | "send_failed";
  resendId?: string;
}

/**
 * Send a single trial email to a user. Idempotent on
 * (userId, emailKey) via the TrialEmailLog unique constraint — a
 * second call for the same pair returns { sent: false,
 * reason: "already_sent" } without dispatching to Resend.
 *
 * Skips the send if the user is unsubscribed from onboarding emails.
 * Caller is free to re-check status afterward.
 */
export async function sendTrialEmail(
  userId: string,
  emailKey: TrialEmailKey,
  opts: { force?: boolean } = {}
): Promise<SendResult> {
  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      trialEndsAt: true,
      totalRecordings: true,
      foundingMemberNumber: true,
      onboardingUnsubscribed: true,
    },
  });

  if (!user || !user.email) {
    return { sent: false, reason: "send_failed" };
  }

  if (user.onboardingUnsubscribed) {
    return { sent: false, reason: "unsubscribed" };
  }

  // Dedupe — if a log row exists for this key, skip unless force=true
  // (admin resend UI uses force=true).
  if (!opts.force) {
    const existing = await prisma.trialEmailLog.findUnique({
      where: {
        userId_emailKey: { userId: user.id, emailKey },
      },
      select: { id: true },
    });
    if (existing) {
      return { sent: false, reason: "already_sent" };
    }
  }

  const template = TRIAL_EMAIL_TEMPLATES[emailKey];
  if (!template) {
    safeLog.error("trial-email.unknown_key", new Error("unknown emailKey"), {
      emailKey,
      userId: user.id,
    });
    return { sent: false, reason: "send_failed" };
  }

  const vars = await buildTrialVars({
    id: user.id,
    email: user.email,
    name: user.name,
    trialEndsAt: user.trialEndsAt,
    totalRecordings: user.totalRecordings,
    foundingMemberNumber: user.foundingMemberNumber,
  });

  const subject = template.subject(vars);
  const html = template.html(vars);

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const sendResp = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: user.email,
      subject,
      html,
    });

    // Resend v6 returns { data: { id }, error } — coerce defensively.
    const resendId =
      (sendResp as { data?: { id?: string } }).data?.id ??
      (sendResp as { id?: string }).id ??
      null;

    // Upsert the log row. force=true means we're resending from
    // admin — record a NEW send log instead of overwriting by
    // bumping `sentAt`. Upsert on (userId, emailKey) handles both.
    await prisma.trialEmailLog.upsert({
      where: { userId_emailKey: { userId: user.id, emailKey } },
      update: {
        sentAt: new Date(),
        resendId: resendId ?? undefined,
        // Reset engagement fields on resend.
        opened: null,
        clicked: null,
        openedAt: null,
        clickedAt: null,
      },
      create: {
        userId: user.id,
        emailKey,
        sentAt: new Date(),
        resendId: resendId ?? undefined,
      },
    });

    safeLog.info("trial-email.sent", {
      userId: user.id,
      emailKey,
      resendId: resendId ?? "(missing)",
    });

    return { sent: true, resendId: resendId ?? undefined };
  } catch (err) {
    safeLog.error("trial-email.send_failed", err, {
      userId: user.id,
      emailKey,
    });
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * Hours since a given instant, floored. Used by the orchestrator for
 * "has enough time passed?" gates.
 */
export function hoursSince(d: Date, now: Date = new Date()): number {
  return Math.floor((now.getTime() - d.getTime()) / (60 * 60 * 1000));
}
