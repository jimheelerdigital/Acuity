/**
 * Trial countdown email sequence — slice 4 (2026-05-25).
 *
 * The existing `lib/trial-emails.ts` + `inngest/functions/trial-
 * email-orchestrator.ts` handle ONBOARDING + RETENTION emails
 * (welcome_day0, reactivation, power-user pings, value recap, etc.)
 * via the TrialEmailLog table.
 *
 * This module is the COUNTDOWN sequence — four emails fired
 * relative to the user's trial-end timestamp. Tuned for the 7-day
 * trial (migrated from 14 days 2026-06): all windows are relative
 * to trialEndsAt, so the change is grandfathering-safe.
 *   - T-4 (Day 3) : mid-trial value reminder ("patterns are
 *                   surfacing")
 *   - T-2 (Day 5) : "2 days left" urgency
 *   - T+0 (Day 7) : "Your trial ended" (fires after the expiration
 *                   cron sets trialExpiredAt)
 *   - T+3 : "Come back when you're ready"
 *
 * The old T-7 (would land on signup day at a 7-day trial) and T-1
 * ("Last day") emails were dropped. The DB column names are legacy
 * slot names (trialT7/T3/T1...) — they no longer correspond to the
 * day offsets in their names; see the FIELD map below.
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
import { isEmailEnabled } from "@/lib/email-enabled";
import { escapeHtml } from "@/lib/escape-html";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { safeLog } from "@/lib/safe-log";

const DEFAULT_APP_URL = "https://www.getacuity.io";

export type CountdownEmailKey =
  | "trial_midtrial"
  | "trial_urgency"
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

function renderMidtrial(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "Your patterns are starting to surface";
  const themesBit = v.topThemeName
    ? v.secondThemeName
      ? `${escapeHtml(v.topThemeName)} and ${escapeHtml(v.secondThemeName)}`
      : escapeHtml(v.topThemeName)
    : "patterns starting to surface";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        You're hitting your stride, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        You've recorded ${escapeHtml(String(v.totalRecordings))} ${v.totalRecordings === 1 ? "entry" : "entries"} so far. Your themes are starting to surface — ${themesBit}. This next stretch is where the patterns really settle. Keep going and watch Life Matrix, Theme Map, and weekly insights come into focus.
      </p>
    </td></tr>
    <tr><td style="padding-bottom:8px;">
      ${trialButton(v.upgradeUrl("trial_midtrial"), "Keep building →")}
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
      preheader: "Your patterns are surfacing. The next stretch is where they settle.",
    }),
  };
}

function renderUrgency(v: CountdownVars): { subject: string; html: string } {
  const name = escapeHtml(v.firstName);
  const subject = "2 days left in your trial";

  const content = `
    <tr><td style="padding-bottom:24px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
        2 days left, ${name}.
      </h1>
    </td></tr>
    <tr><td style="padding-bottom:20px;">
      <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
        Two days before your insights move to Pro. Here's what you've built:
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
      ${trialButton(v.upgradeUrl("trial_urgency"), "Keep your insights →")}
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
      preheader: "2 days before Life Matrix + Theme Map move to Pro.",
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
  trial_midtrial: renderMidtrial,
  trial_urgency: renderUrgency,
  trial_ended_t0: renderT0,
  trial_reengagement_t3: renderT3Post,
};

// ─── Send + stamp helpers ───────────────────────────────────────

export interface CountdownSendResult {
  sent: boolean;
  reason?: "unsubscribed" | "no_user" | "send_failed" | "disabled";
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
  // Kill-switch — the entire countdown sequence is paused while we
  // rebuild templates. All four keys are disabled in lib/email-enabled.ts;
  // flip a key back to re-enable. The cron stays registered + scanning so
  // re-enabling is a one-line change here.
  if (!isEmailEnabled(key)) {
    return { sent: false, reason: "disabled" };
  }

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
    // Column names are LEGACY slot names from the 14-day cadence —
    // they no longer match the day offsets in their names. We reuse
    // the existing columns to avoid a migration: trialT7EmailSentAt
    // now backs the mid-trial (T-4) email, trialT3EmailSentAt backs
    // the urgency (T-2) email. trialT1EmailSentAt is now unused.
    const FIELD: Record<CountdownEmailKey, string> = {
      trial_midtrial: "trialT7EmailSentAt",
      trial_urgency: "trialT3EmailSentAt",
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
