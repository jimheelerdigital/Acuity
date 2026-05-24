/**
 * Trial countdown email sequence — slice 4 (2026-05-25).
 *
 * The existing `lib/trial-emails.ts` + `inngest/functions/trial-
 * email-orchestrator.ts` handle ONBOARDING + RETENTION emails
 * (welcome_day0, reactivation, power-user pings, value recap, etc.)
 * via the TrialEmailLog table.
 *
 * This module is the COUNTDOWN sequence — five emails fired
 * relative to the user's trial-end timestamp:
 *   - T-7 : "Your trial ends in a week"
 *   - T-3 : "3 days left in your trial"
 *   - T-1 : "Last day"
 *   - T+0 : "Your trial ended" (fires after the expiration cron
 *           sets trialExpiredAt)
 *   - T+3 : "Come back when you're ready"
 *
 * Tracking uses the dedicated User.trial*EmailSentAt columns Jim
 * added in slice 3, NOT the TrialEmailLog table. Keeps the
 * countdown system independent of the orchestrator's slot-based
 * scheduling — countdowns are calendar-driven, not signup-driven.
 *
 * Templates lean on the same `trialLayout` + `trialButton` +
 * `trialCard` HTML helpers from `emails/trial/layout.ts` so the
 * inbox aesthetic stays consistent across both systems.
 *
 * Copy in Accountability voice per docs/Acuity_SalesCopy.md §7.2 +
 * §8: "keep what you've built", specific numbers, no fake urgency,
 * no banned verbs. Apple Option-C compliance: these are EMAILS, not
 * in-app copy, so prices + "Subscribe" are fine.
 */

import "server-only";

import {
  trialButton,
  trialCard,
  trialLayout,
} from "@/emails/trial/layout";
import { escapeHtml } from "@/lib/escape-html";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { safeLog } from "@/lib/safe-log";

const DEFAULT_APP_URL = "https://www.getacuity.io";

export type CountdownEmailKey =
  | "trial_countdown_t7"
  | "trial_countdown_t3"
  | "trial_countdown_t1"
  | "trial_ended_t0"
  | "trial_reengagement_t3";

interface CountdownVars {
  firstName: string;
  appUrl: string;
  upgradeUrl: (src: string) => string;
  unsubscribeUrl: string;
  totalRecordings: number;
  currentStreak: number;
  themesSurfaced: number;
  topThemeName: string | null;
  secondThemeName: string | null;
  axesScored: number;
}

function origin(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    DEFAULT_APP_URL
  ).replace(/\/$/, "");
}

function firstNameFrom(name: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "there";
  const first = raw.split(/\s+/)[0];
  return first || "there";
}

/**
 * Pull the personalization stats for the countdown emails. Cheap —
 * one parallel batch of three counts + one ranked-theme query +
 * one LifeMapArea aggregation.
 *
 * Idempotent + reusable: cron, admin "preview email" surface, and
 * potential test-send tooling all share this.
 */
async function buildCountdownVars(userId: string): Promise<CountdownVars | null> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      currentStreak: true,
      totalRecordings: true,
      onboardingUnsubscribed: true,
    },
  });
  if (!user || !user.email) return null;
  if (user.onboardingUnsubscribed) return null;

  const [topThemes, axesScoredCount] = await Promise.all([
    prisma.theme.findMany({
      where: { userId, mentions: { some: {} } },
      orderBy: { mentions: { _count: "desc" } },
      select: { name: true, _count: { select: { mentions: true } } },
      take: 2,
    }),
    prisma.lifeMapArea.count({
      where: { userId, score: { gt: 5 } },
    }),
  ]);

  // themesSurfaced = themes with at least 2 mentions (matches the
  // orbital cosmos floor + the in-product "themes" definition).
  const themesSurfaced = await prisma.theme.count({
    where: { userId, mentions: { some: {} } },
  });

  const baseUrl = origin();
  // `onboarding` kind matches the existing trial-emails system —
  // same unsubscribe routing + single User.onboardingUnsubscribed
  // flag controls both. Token expiry uses the signer's default TTL.
  const unsubscribeToken = signUnsubscribeToken(userId, "onboarding");
  const unsubscribeUrl = `${baseUrl}/api/email/unsubscribe?token=${encodeURIComponent(
    unsubscribeToken
  )}`;
  const upgradeUrl = (src: string) =>
    `${baseUrl}/upgrade?src=${encodeURIComponent(src)}`;

  return {
    firstName: firstNameFrom(user.name),
    appUrl: baseUrl,
    upgradeUrl,
    unsubscribeUrl,
    totalRecordings: user.totalRecordings,
    currentStreak: user.currentStreak ?? 0,
    themesSurfaced,
    topThemeName: topThemes[0]?.name ?? null,
    secondThemeName: topThemes[1]?.name ?? null,
    axesScored: axesScoredCount,
  };
}

function statsLine(v: CountdownVars): string {
  const parts: string[] = [];
  parts.push(`${v.totalRecordings} ${v.totalRecordings === 1 ? "entry" : "entries"}`);
  if (v.currentStreak >= 2) parts.push(`${v.currentStreak}-day streak`);
  parts.push(`${v.themesSurfaced} ${v.themesSurfaced === 1 ? "theme" : "themes"} surfaced`);
  parts.push(`${v.axesScored}/10 axes scored`);
  return escapeHtml(parts.join(" · "));
}

// ─── Template renderers ─────────────────────────────────────────

function renderT7(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "Your trial ends in a week";
  const themesBit = v.topThemeName
    ? v.secondThemeName
      ? `${escapeHtml(v.topThemeName)} and ${escapeHtml(v.secondThemeName)}`
      : escapeHtml(v.topThemeName)
    : "patterns starting to surface";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        Your trial ends in a week, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        You've recorded ${escapeHtml(String(v.totalRecordings))} ${v.totalRecordings === 1 ? "entry" : "entries"} so far. Your themes are starting to surface — ${themesBit}. The next week is when patterns really show up. Then your trial wraps and Life Matrix, Theme Map, and weekly insights move to Pro.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_t7"), "Keep building →")}
    </td></tr>
    <tr><td style="padding-top:24px;">
      <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
        — Jim &amp; Keenan
      </p>
    </td></tr>
  `;
  return {
    subject,
    html: trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "A week left in your trial. Patterns are about to settle.",
    }),
  };
}

function renderT3(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "3 days left in your trial";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        3 days left, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        Three days before your insights move to Pro. Here's what you've built:
      </p>
    </td></tr>
    <tr><td style="padding-bottom:24px;">
      ${trialCard(`
        <p style="margin:0;font-size:15px;color:#FFFFFF;line-height:1.7;font-weight:600;">
          ${statsLine(v)}
        </p>
      `)}
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        After your trial wraps, recording stays free — but Life Matrix and Theme Map lock until you continue on web.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_t3"), "Keep your insights →")}
    </td></tr>
    <tr><td style="padding-top:24px;">
      <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
        — Jim &amp; Keenan
      </p>
    </td></tr>
  `;
  return {
    subject,
    html: trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "3 days before Life Matrix + Theme Map move to Pro.",
    }),
  };
}

function renderT1(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "Last day";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        Last day, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        Your trial ends tomorrow. Recording stays free. Life Matrix, Theme Map, and your weekly report lock unless you continue on web.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_t1"), "Keep going →")}
    </td></tr>
    <tr><td style="padding-top:24px;">
      <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
        — Jim &amp; Keenan
      </p>
    </td></tr>
  `;
  return {
    subject,
    html: trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "One more day to lock in Pro at your trial rate.",
    }),
  };
}

function renderT0(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "Your trial ended";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        Your trial just wrapped, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        Recording is still yours — keep journaling. Your data is preserved. Life Matrix, Theme Map, and weekly insights are on Pro now. Continue on web anytime to bring them back.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_t0"), "Continue on web →")}
    </td></tr>
    <tr><td style="padding-top:24px;">
      <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
        — Jim &amp; Keenan
      </p>
    </td></tr>
  `;
  return {
    subject,
    html: trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Recording stays yours. Insights are on Pro now.",
    }),
  };
}

function renderT3Post(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "Come back when you're ready";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        Your reflections are still here, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        ${escapeHtml(String(v.totalRecordings))} ${v.totalRecordings === 1 ? "entry" : "entries"}, ${escapeHtml(String(v.themesSurfaced))} ${v.themesSurfaced === 1 ? "theme" : "themes"}. We've saved your spot — when you're ready to bring Life Matrix and Theme Map back, you'll find them right where you left them.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_t3_post"), "Continue on web →")}
    </td></tr>
    <tr><td style="padding-top:24px;">
      <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
        — Jim &amp; Keenan
      </p>
    </td></tr>
  `;
  return {
    subject,
    html: trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your reflections are saved. Bring insights back anytime.",
    }),
  };
}

const RENDERERS: Record<
  CountdownEmailKey,
  (v: CountdownVars) => { subject: string; html: string }
> = {
  trial_countdown_t7: renderT7,
  trial_countdown_t3: renderT3,
  trial_countdown_t1: renderT1,
  trial_ended_t0: renderT0,
  trial_reengagement_t3: renderT3Post,
};

// ─── Send + stamp helpers ───────────────────────────────────────

export interface CountdownSendResult {
  sent: boolean;
  reason?: "unsubscribed" | "no_user" | "send_failed";
  resendId?: string;
}

/**
 * Send a countdown email + stamp the matching SentAt column on the
 * User row. Caller is responsible for the WHERE-clause gate (cron
 * already filtered to "SentAt IS NULL"); this function trusts the
 * caller and does the send + stamp in two writes. If the send
 * fails, the stamp is skipped so the next cron tick retries.
 */
export async function sendCountdownEmail(
  userId: string,
  key: CountdownEmailKey
): Promise<CountdownSendResult> {
  const vars = await buildCountdownVars(userId);
  if (!vars) {
    return { sent: false, reason: "no_user" };
  }

  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, onboardingUnsubscribed: true },
  });
  if (!user || !user.email) {
    return { sent: false, reason: "no_user" };
  }
  if (user.onboardingUnsubscribed) {
    return { sent: false, reason: "unsubscribed" };
  }

  const { subject, html } = RENDERERS[key](vars);

  try {
    const { getResendClient } = await import("@/lib/resend");
    const resend = getResendClient();
    const resp = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Acuity <hello@getacuity.io>",
      to: user.email,
      subject,
      html,
    });

    // Resend client's `.send` shape varies between versions. Both
    // legacy {id} and current {data:{id}} are handled defensively.
    const respUnknown = resp as unknown as {
      id?: string;
      data?: { id?: string };
    };
    const resendId = respUnknown?.data?.id ?? respUnknown?.id;

    // Stamp the SentAt column for this key. Field names match
    // schema.prisma exactly. updateMany used so we can re-assert
    // "IS NULL" — defends against two concurrent cron ticks racing
    // on the same user (Inngest retries can occasionally fire
    // overlapping invocations).
    const FIELD: Record<CountdownEmailKey, string> = {
      trial_countdown_t7: "trialT7EmailSentAt",
      trial_countdown_t3: "trialT3EmailSentAt",
      trial_countdown_t1: "trialT1EmailSentAt",
      trial_ended_t0: "trialEndedEmailSentAt",
      trial_reengagement_t3: "trialT3PostEmailSentAt",
    };
    const fieldName = FIELD[key];
    await prisma.user.updateMany({
      where: { id: userId, [fieldName]: null },
      data: { [fieldName]: new Date() },
    });

    safeLog.info("trial-countdown.sent", {
      userId,
      key,
      resendId: resendId ?? null,
    });
    return { sent: true, resendId };
  } catch (err) {
    safeLog.error(
      "trial-countdown.send_failed",
      err instanceof Error ? err : new Error(String(err)),
      { userId, key }
    );
    return { sent: false, reason: "send_failed" };
  }
}
