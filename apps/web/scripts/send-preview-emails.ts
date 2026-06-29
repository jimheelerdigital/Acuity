/**
 * One-off script: send all 7 emails created this session to a test address.
 *
 * Usage:
 *   cd apps/web
 *   npx vercel env pull .env.local   # pulls RESEND_API_KEY from Vercel
 *   npx tsx scripts/send-preview-emails.ts
 *
 * Sends each email with sample TrialVars to the hardcoded recipient.
 */

import { Resend } from "resend";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load .env.local for the RESEND_API_KEY
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("RESEND_API_KEY not found. Run: npx vercel env pull .env.local");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);
const TO = "keenan@heelerdigital.com";
const FROM = '"Keenan from Acuity" <keenan@getacuity.io>';

// Import templates
import { firstInsight } from "../src/emails/trial/first-insight";
import { keepMomentum } from "../src/emails/trial/keep-momentum";
import { trialEnding } from "../src/emails/trial/trial-ending";
import { rescueSignupOnly } from "../src/emails/trial/rescue-signup-only";
import { rescueViewedNoTap } from "../src/emails/trial/rescue-viewed-no-tap";
import { rescueTappedAppStore } from "../src/emails/trial/rescue-tapped-app-store";
import { rescueWebviewBlocked } from "../src/emails/trial/rescue-webview-blocked";
import { neverRecorded24h } from "../src/emails/trial/never-recorded-24h";
import { neverRecorded48h } from "../src/emails/trial/never-recorded-48h";
import { neverRecorded3day } from "../src/emails/trial/never-recorded-3day";
import { neverRecordedLastday } from "../src/emails/trial/never-recorded-lastday";

import type { TrialVars } from "../src/emails/trial/types";

const sampleVars: TrialVars = {
  firstName: "Keenan",
  appUrl: "https://www.getacuity.io",
  trialEndsAt: "July 1",
  trialEndsAtRaw: new Date("2026-07-01T12:00:00Z"),
  totalRecordings: 5,
  topTheme: "work stress",
  firstDebriefTaskCount: 3,
  foundingMemberNumber: null,
  unsubscribeUrl: "https://www.getacuity.io/api/emails/unsubscribe?token=preview",
  observationText: "You mention your partner more in positive entries \u2014 worth noticing.",
  observationSeverity: "POSITIVE",
};

const emails = [
  { name: "First Insight", template: firstInsight, replyTo: undefined },
  { name: "Keep Momentum", template: keepMomentum, replyTo: undefined },
  { name: "Trial Ending", template: trialEnding, replyTo: undefined },
  { name: "Rescue #1: Signup Only", template: rescueSignupOnly, replyTo: undefined },
  { name: "Rescue #2: Viewed No Tap", template: rescueViewedNoTap, replyTo: "keenan@getacuity.io" },
  { name: "Rescue #3: Tapped App Store", template: rescueTappedAppStore, replyTo: undefined },
  { name: "Rescue #4: Webview Blocked", template: rescueWebviewBlocked, replyTo: undefined },
  { name: "Never Recorded #1: 24h", template: neverRecorded24h, replyTo: undefined },
  { name: "Never Recorded #2: 48h", template: neverRecorded48h, replyTo: undefined },
  { name: "Never Recorded #3: 3 days left", template: neverRecorded3day, replyTo: undefined },
  { name: "Never Recorded #4: Last day", template: neverRecordedLastday, replyTo: undefined },
];

async function main() {
  console.log(`Sending ${emails.length} preview emails to ${TO}...\n`);

  for (const { name, template, replyTo } of emails) {
    const subject = `[PREVIEW] ${template.subject(sampleVars)}`;
    const html = template.html(sampleVars);

    try {
      const resp = await resend.emails.send({
        from: FROM,
        replyTo: replyTo ?? undefined,
        to: TO,
        subject,
        html,
      });
      const id = (resp as { data?: { id?: string } }).data?.id ?? "(unknown)";
      console.log(`  ✓ ${name} — sent (${id})`);
    } catch (err) {
      console.error(`  ✗ ${name} — failed:`, err instanceof Error ? err.message : err);
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\nDone.");
}

main();
