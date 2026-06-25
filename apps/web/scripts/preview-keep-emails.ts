/**
 * Render the 12 KEEP lifecycle/transactional emails to standalone HTML
 * files for branding + copy review. NO Resend calls — pure render only.
 *
 * Context: the lifecycle/marketing email kill-switch (2026-06-24) paused
 * everything except 12 KEEP emails. This script renders those 12 so we
 * can eyeball brand (violet #7C5CFC vs the coral brand) + stale copy
 * ("14 days", "nightly", "60-second", "$12.99", jargon) before rebuild.
 *
 * Usage:
 *   cd apps/web && npx tsx scripts/preview-keep-emails.ts
 *
 * Output: <repo-root>/.tmp/email-previews/*.html
 *
 * Pure registry/transactional templates are imported and called directly.
 * The five send-functions that bundle their render inside an async
 * Resend-coupled function (payment-failed, data-export-ready,
 * state-of-me-ready, weekly-digest, founder-payment) are reproduced here
 * by calling the SAME shared layout shells with the SAME copy, so the
 * rendered shell + styling is byte-accurate without triggering a send.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { TrialVars } from "@/emails/trial/registry";

// Pure templates — safe to import + call directly.
import { welcomeDay0 } from "@/emails/trial/welcome-day0";
import { recoveryPaidNoApp } from "@/emails/trial/recovery-paid-no-app";
import { recoveryRecordedOnce } from "@/emails/trial/recovery-recorded-once";
import { recoveryDownloadReminder } from "@/emails/trial/recovery-download-reminder";
import { magicLinkEmail } from "@/emails/magic-link";
import { passwordResetEmail } from "@/emails/password-reset";
import { welcomeVerifyEmail } from "@/emails/welcome-verify";
import {
  founderNotificationSubject,
  founderNotificationHtml,
} from "@/emails/founder-signup-notification";

// Shared layout shells — used to reproduce the 5 Resend-coupled renders.
import { emailLayout } from "@/emails/layout";
import {
  appUrl as digestAppUrl,
  digestLayout,
  escapeHtml as digestEscape,
  section,
} from "@/emails/digest-layout";

const OUT_DIR = resolve(__dirname, "../../..", ".tmp/email-previews");

const APP_URL = "https://www.getacuity.io";
const UNSUB =
  "https://www.getacuity.io/api/emails/unsubscribe?token=preview-fake-unsub-xyz";

function sampleTrialVars(overrides: Partial<TrialVars> = {}): TrialVars {
  return {
    firstName: "Sarah",
    appUrl: APP_URL,
    trialEndsAt: "July 1",
    trialEndsAtRaw: new Date("2026-07-01T12:00:00Z"),
    totalRecordings: 4,
    topTheme: "work stress",
    firstDebriefTaskCount: 3,
    foundingMemberNumber: 42,
    unsubscribeUrl: UNSUB,
    ...overrides,
  };
}

interface Preview {
  file: string;
  label: string;
  subject: string;
  html: string;
}

const previews: Preview[] = [];

function add(file: string, label: string, r: { subject: string; html: string }) {
  previews.push({ file, label, subject: r.subject, html: r.html });
}

// ── #1 welcome_day0 (registry) ──────────────────────────────────────
const wd0Vars = sampleTrialVars();
add("01-welcome_day0.html", "#1 welcome_day0", {
  subject: welcomeDay0.subject(wd0Vars),
  html: welcomeDay0.html(wd0Vars),
});

// ── #29 recovery_paid_no_app (registry) ─────────────────────────────
const rpnaVars = sampleTrialVars();
add("02-recovery_paid_no_app.html", "#29 recovery_paid_no_app", {
  subject: recoveryPaidNoApp.subject(rpnaVars),
  html: recoveryPaidNoApp.html(rpnaVars),
});

// ── #30 recovery_recorded_once (registry) ───────────────────────────
const rroVars = sampleTrialVars({ totalRecordings: 1 });
add("03-recovery_recorded_once.html", "#30 recovery_recorded_once", {
  subject: recoveryRecordedOnce.subject(rroVars),
  html: recoveryRecordedOnce.html(rroVars),
});

// ── #32 recovery_download_reminder (registry) ───────────────────────
const rdrVars = sampleTrialVars({ totalRecordings: 0 });
add("04-recovery_download_reminder.html", "#32 recovery_download_reminder", {
  subject: recoveryDownloadReminder.subject(rdrVars),
  html: recoveryDownloadReminder.html(rdrVars),
});

// ── #4 magic link (transactional) ───────────────────────────────────
add(
  "05-magic_link.html",
  "#4 magic_link",
  magicLinkEmail(
    "https://getacuity.io/api/auth/callback/email?token=preview-fake-magic"
  )
);

// ── #5 password reset (transactional) ───────────────────────────────
add(
  "06-password_reset.html",
  "#5 password_reset",
  passwordResetEmail(
    "https://getacuity.io/auth/reset?token=preview-fake-reset"
  )
);

// ── #2 welcome + verify (transactional) ─────────────────────────────
add(
  "07-welcome_verify.html",
  "#2 welcome_verify",
  welcomeVerifyEmail({
    firstName: "Sarah",
    verifyUrl:
      "https://getacuity.io/api/auth/verify-email?token=preview-fake-verify",
    unsubscribeUrl: UNSUB,
    foundingMemberNumber: 42,
  })
);

// ── #6 payment failed (transactional — reproduced shell) ────────────
// Mirrors sendPaymentFailedEmail in @/emails/payment-failed.
add("08-payment_failed.html", "#6 payment_failed", {
  subject: "Couldn't charge your card — quick update needed",
  html: emailLayout({
    title: "Quick heads-up on your subscription",
    preheader:
      "Stripe couldn't charge your card — a small fix keeps things running.",
    intro: `Hi Sarah — Stripe couldn't charge your card for this month's Acuity subscription. Your account is still active for now while Stripe retries, but updating your card keeps everything running smoothly.`,
    ctaLabel: "Update payment method",
    ctaUrl: `${APP_URL}/account`,
    footnote:
      "Tap the button above, sign in, then hit Manage subscription. Stripe will retry over the next couple of weeks; nothing gets cut off without another email first.",
  }),
});

// ── #35a data export ready (transactional — reproduced shell) ───────
// Mirrors sendDataExportReadyEmail in @/emails/data-export-ready.
const expiresAt = new Date("2026-06-25T12:00:00Z").toLocaleString("en-US", {
  dateStyle: "long",
  timeStyle: "short",
});
add("09-data_export_ready.html", "#35 data_export_ready", {
  subject: "Your Acuity data export is ready",
  html: emailLayout({
    title: "Your Acuity export is ready",
    preheader: "Download your data — link expires in 24 hours.",
    intro: `Hi Sarah — your data export is ready. The zip contains all your entries, goals, tasks, Life Matrix history, weekly reports, and any retained audio files. The link expires at ${expiresAt} (24 hours from now).`,
    ctaLabel: "Download export",
    ctaUrl: "https://getacuity.io/exports/preview-fake-export.zip",
    footnote:
      "Missed the window? You can request a new export from Account → Download my data. One request per 7 days.",
  }),
});

// ── #35b state of me ready (transactional — reproduced shell) ───────
// Mirrors sendStateOfMeReadyEmail in @/emails/state-of-me-ready.
const headline = "The quarter you stopped running on empty";
const closingReflection =
  "Three months ago you described most days as a blur. The entries since then tell a different story — slower mornings, clearer boundaries at work, and a steadiness that shows up even in the hard weeks.";
const preview =
  closingReflection.length > 220
    ? `${closingReflection.slice(0, 220).trim()}…`
    : closingReflection;
add("10-state_of_me_ready.html", "#35 state_of_me_ready", {
  subject: `Your State of Me — ${headline}`,
  html: emailLayout({
    title: "Your State of Me is ready",
    preheader: headline,
    intro: `Sarah — your quarterly State of Me is ready. Here's a preview:\n\n"${preview}"`,
    ctaLabel: "Read the full report",
    ctaUrl: `${APP_URL}/insights/state-of-me/preview-fake-id`,
    footnote:
      "State of Me arrives every ~90 days. You can also request one manually from /insights (once per 30 days).",
  }),
});

// ── #7 founder signup notify (internal) ─────────────────────────────
const founderSignupVars = {
  firstName: "Sarah",
  email: "sarah@example.com",
  signupMethod: "Email + password",
  timestamp: new Date("2026-06-24T15:30:00Z"),
  campaign: "meta-anxiety-v3",
  branch: "ios",
  paymentStatus: "TRIAL",
  utmSource: "facebook",
  utmMedium: "paid",
  utmCampaign: "anxiety-q2",
};
add("11-founder_signup_notify.html", "#7 founder_signup_notify", {
  subject: founderNotificationSubject(founderSignupVars),
  html: founderNotificationHtml(founderSignupVars),
});

// ── #8 founder payment notify (internal — reproduced inline) ────────
// Mirrors notifyFoundersOfPayment in @/lib/founder-notifications.
const payEmail = "sarah@example.com";
const payPlan = "Annual ($39.99)";
const paySource = "onboarding-funnel-paywall";
const payTime = new Date("2026-06-24T15:35:00Z").toLocaleString("en-US", {
  timeZone: "America/Chicago",
  dateStyle: "medium",
  timeStyle: "short",
});
add("12-founder_payment_notify.html", "#8 founder_payment_notify", {
  subject: `\u{1F4B0} New payment: ${payEmail} (${payPlan})`,
  html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 16px;">New Payment</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:600;">${payEmail}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Plan</td><td style="padding:8px 0;font-weight:600;">${payPlan}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Source</td><td style="padding:8px 0;">${paySource}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${payTime}</td></tr>
          </table>
        </div>
      `,
});

// ── #33 weekly digest (transactional — reproduced shell) ────────────
// Mirrors sendWeeklyDigest in @/emails/weekly-digest.
(function buildWeeklyDigest() {
  const firstName = "Sarah";
  const entryCount: number = 5;
  const streak: number = 4;
  const moodSummary = "Mostly steady — 3 good, 2 neutral days";
  const topThemes = [
    { name: "work stress", mentions: 6 },
    { name: "sleep", mentions: 4 },
    { name: "kids", mentions: 3 },
  ];
  const observations = [
    "Your calmest entries this week all came after you mentioned a walk.",
    "Work stress showed up most on days you skipped recording the night before.",
  ];
  const goalUpdates = [
    { title: "Walk 3x a week", progress: 66, delta: 12 },
    { title: "Read before bed", progress: 40, delta: -5 },
  ];
  const range = "Jun 16 – Jun 22";
  const unsubUrl = UNSUB;

  const parts: string[] = [];
  parts.push(
    section(
      "Your week at a glance",
      `<p style="margin:0;">Hi ${digestEscape(firstName)} — you recorded ${entryCount} debrief${entryCount === 1 ? "" : "s"} this week${
        streak >= 2 ? `, and you're on a ${streak}-day streak 🔥` : "."
      }</p>
       <p style="margin:8px 0 0;color:#6b7280;">${digestEscape(moodSummary)}</p>`
    )
  );
  const chips = topThemes
    .slice(0, 3)
    .map(
      (t) =>
        `<span style="display:inline-block;background:#E5E7EB;color:#374151;border-radius:999px;padding:4px 10px;font-size:12px;margin-right:6px;margin-top:4px;">${digestEscape(t.name)} · ${t.mentions}</span>`
    )
    .join("");
  parts.push(section("Top themes", chips));
  const bullets = observations
    .slice(0, 2)
    .map(
      (o) =>
        `<li style="margin:6px 0;list-style:none;padding-left:16px;position:relative;">
             <span style="position:absolute;left:0;color:#E06B46;">→</span>
             ${digestEscape(o)}
           </li>`
    )
    .join("");
  parts.push(
    section("What we noticed", `<ul style="padding:0;margin:0;">${bullets}</ul>`)
  );
  const rows = goalUpdates
    .slice(0, 3)
    .map((g) => {
      const bar = `<div style="height:4px;background:#E5E7EB;border-radius:2px;margin-top:4px;">
          <div style="height:4px;background:#E06B46;border-radius:2px;width:${Math.max(0, Math.min(100, g.progress))}%;"></div>
        </div>`;
      const deltaLabel =
        typeof g.delta === "number" && g.delta !== 0
          ? `<span style="color:${g.delta > 0 ? "#5DCAA5" : "#F59E0B"};margin-left:8px;font-size:11px;">${g.delta > 0 ? "↑" : "↓"} ${Math.abs(g.delta)}%</span>`
          : "";
      return `<div style="margin:10px 0;">
          <p style="margin:0;color:#1a1a1a;font-size:13px;">${digestEscape(g.title)}${deltaLabel}</p>
          ${bar}
        </div>`;
    })
    .join("");
  parts.push(section("Goals this week", rows));

  const html = digestLayout({
    title: `Your week in review`,
    preheader: `${entryCount} entries · ${topThemes.map((t) => t.name).slice(0, 3).join(", ")}`,
    dateRange: range,
    sectionsHtml: parts.join("\n"),
    unsubscribeUrl: unsubUrl,
    kindLabel: "weekly summary",
    ctaLabel: "Open Insights",
    ctaUrl: `${digestAppUrl()}/insights`,
  });

  add("13-weekly_digest.html", "#33 weekly_digest", {
    subject: `Your week in review · ${range}`,
    html,
  });
})();

// ── Write all files ─────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
for (const p of previews) {
  writeFileSync(resolve(OUT_DIR, p.file), p.html, "utf8");
}

const indexRows = previews
  .map(
    (p) =>
      `    <li><a href="./${p.file}">${p.label}</a> — <code>${p.subject.replace(/</g, "&lt;")}</code></li>`
  )
  .join("\n");
const indexHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Acuity KEEP email previews</title></head>
<body style="font-family:-apple-system,sans-serif;max-width:760px;margin:40px auto;line-height:1.6;">
  <h1>Acuity KEEP email previews (12)</h1>
  <p>Rendered ${new Date().toISOString()} — review only, no emails sent.</p>
  <ol>
${indexRows}
  </ol>
</body></html>`;
writeFileSync(resolve(OUT_DIR, "index.html"), indexHtml, "utf8");

console.log(`\n✓ Rendered ${previews.length} KEEP email previews to:`);
console.log(`  ${OUT_DIR}`);
for (const p of previews) {
  console.log(`   - ${p.file}  (${p.label})  "${p.subject}"`);
}
console.log(`\n  Open the index:\n    open ${resolve(OUT_DIR, "index.html")}`);
