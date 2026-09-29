/**
 * Ripple 1.9 release announcement send.
 *
 * Sends REAL email to REAL users. Same safeguards as android-launch-send.ts,
 * in strict order with a hard stop between each stage:
 *
 *   1) dry-run  (default)  — prints the full recipient list. NOTHING is sent.
 *   2) test [--to=addr]    — sends ONE copy to jim@heelerdigital.com (or --to).
 *                            No DB writes, no dedup.
 *   3) live  --yes         — sends to the real list. Every send is claimed in
 *                            TrialEmailLog BEFORE the network call, so a re-run
 *                            can never double-send. Rate-limited.
 *
 * RELEASE GATE: `live` refuses to run unless the server's iOS
 * recommendedVersion is "1.9.0" — i.e. the release-day version-config change
 * (branch release/version-config-1.9.0) is merged, which only happens once
 * 1.9.0 is actually live on the App Store. This stops the email going out
 * while users would still get 1.6.0 from the store.
 *
 * Run from apps/web so the "@/..." alias + .env resolve:
 *
 *   cd apps/web
 *   npx tsx scripts/ripple-1-9-send.ts                  # dry-run
 *   npx tsx scripts/ripple-1-9-send.ts test             # one test copy
 *   npx tsx scripts/ripple-1-9-send.ts live --yes       # LIVE send
 *
 * Audience — iPhone users: devicePlatform = "ios" OR pushTokenPlatform =
 * "ios", not unsubscribed, not in the suppression file.
 */

// Load env BEFORE any "@/..." import so prisma is built with valid creds.
import "./load-env";

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { ripple19Announcement, type Ripple19Vars as AnnouncementVars } from "@/emails/announcements/ripple-1-9";
import { configForPlatform } from "@/lib/app-version-config";

// ── Config ───────────────────────────────────────────────────────────────
const EMAIL_KEY = "ripple_1_9_announcement";
const REQUIRED_IOS_VERSION = "1.9.0";
const DEFAULT_TEST_TO = "jim@heelerdigital.com";
const APP_ORIGIN = "https://goripple.io";
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS ?? 600); // ~2/s Resend limit
const SUPPRESSION_FILE = resolve(__dirname, "ripple-1-9-suppression.txt");

// Sender: the same Keenan lifecycle sender the trial emails use in production
// every day (src/lib/trial-emails.ts LIFECYCLE_FROM), so it's a known-verified
// Resend domain with an established sending reputation.
const FROM = '"Keenan from Ripple" <keenan@getacuity.io>';
const REPLY_TO = "keenan@getacuity.io";

interface Recipient {
  userId: string;
  email: string;
  firstName: string | null;
  createdAt: Date;
  lastEvent: { event: string; createdAt: Date } | null;
  alreadySent: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function firstNameOf(name: string | null): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || null;
}

function unsubUrl(userId: string): string {
  const token = signUnsubscribeToken(userId, "onboarding");
  return `${APP_ORIGIN}/api/emails/unsubscribe?token=${encodeURIComponent(token)}`;
}

function render(r: Recipient): { subject: string; html: string } {
  const vars: AnnouncementVars = { firstName: r.firstName, unsubscribeUrl: unsubUrl(r.userId) };
  return ripple19Announcement(vars);
}

function loadSuppression(): Set<string> {
  const set = new Set<string>();
  if (!existsSync(SUPPRESSION_FILE)) return set;
  for (const line of readFileSync(SUPPRESSION_FILE, "utf8").split(/\r?\n/)) {
    const e = line.trim().toLowerCase();
    if (e && !e.startsWith("#")) set.add(e);
  }
  return set;
}

// ── Audience ─────────────────────────────────────────────────────────────
async function buildRecipients(suppression: Set<string>): Promise<Recipient[]> {
  // Single segment: iPhone users, not unsubscribed.
  const candidates = await prisma.user.findMany({
    where: {
      onboardingUnsubscribed: false,
      OR: [{ devicePlatform: "ios" }, { pushTokenPlatform: "ios" }],
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length === 0) return [];

  const sentRows = await prisma.trialEmailLog.findMany({
    where: { userId: { in: candidateIds }, emailKey: EMAIL_KEY },
    select: { userId: true },
  });
  const sentSet = new Set(sentRows.map((r) => r.userId!));

  const recipients: Recipient[] = [];
  for (const u of candidates) {
    if (suppression.has(u.email.toLowerCase())) continue;
    recipients.push({
      userId: u.id,
      email: u.email,
      firstName: firstNameOf(u.name),
      createdAt: u.createdAt,
      lastEvent: null,
      alreadySent: sentSet.has(u.id),
    });
  }
  return recipients;
}

async function attachLastEvents(recipients: Recipient[]): Promise<void> {
  if (recipients.length === 0) return;
  const ids = recipients.map((r) => r.userId);
  const events = await prisma.onboardingEvent.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, event: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const latest = new Map<string, { event: string; createdAt: Date }>();
  for (const e of events) {
    if (e.userId && !latest.has(e.userId)) {
      latest.set(e.userId, { event: e.event, createdAt: e.createdAt });
    }
  }
  for (const r of recipients) r.lastEvent = latest.get(r.userId) ?? null;
}

// ── Output ───────────────────────────────────────────────────────────────
function iso(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "—";
}

function printTable(rows: Recipient[]): void {
  console.log(`\nRIPPLE 1.9 — one email, iPhone users  [${rows.length} recipients]`);
  console.log("─".repeat(104));
  console.log(
    "email".padEnd(38) +
      "signup".padEnd(12) +
      "lastEvent".padEnd(38) +
      "lastAt".padEnd(12) +
      "status"
  );
  console.log("─".repeat(104));
  for (const r of rows) {
    console.log(
      r.email.slice(0, 37).padEnd(38) +
        iso(r.createdAt).padEnd(12) +
        (r.lastEvent?.event ?? "—").slice(0, 37).padEnd(38) +
        iso(r.lastEvent?.createdAt ?? null).padEnd(12) +
        (r.alreadySent ? "ALREADY-SENT (skip)" : "queued")
    );
  }
}

// ── Modes ────────────────────────────────────────────────────────────────
async function runDryRun(): Promise<void> {
  const suppression = loadSuppression();
  const recipients = await buildRecipients(suppression);
  await attachLastEvents(recipients);

  console.log("\n=== DRY RUN — nothing will be sent ===");
  console.log(
    `Suppression file: ${existsSync(SUPPRESSION_FILE) ? `${SUPPRESSION_FILE} (${suppression.size} addresses)` : "NOT FOUND — no bounced/complained addresses excluded"}`
  );
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO})`);

  printTable(recipients);

  const queued = recipients.filter((r) => !r.alreadySent).length;
  console.log("\n── Summary ──");
  console.log(`${recipients.length} total, ${queued} to send (${recipients.length - queued} already sent)`);
  console.log("\nNext: review this list. If approved, run `test` then `live --yes`.");
}

async function runTest(to: string): Promise<void> {
  const resend = getResendClient();
  const vars: AnnouncementVars = { firstName: "Jimmy", unsubscribeUrl: unsubUrl("test-user-id") };
  const { subject, html } = ripple19Announcement(vars);
  console.log(`\n=== TEST SEND → ${to} (no DB writes) ===`);
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO})`);
  const res = await resend.emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `[TEST] ${subject}`,
    html,
    headers: {
      "List-Unsubscribe": `<${vars.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
  console.log(`sent: id=${res.data?.id ?? "ERR"} err=${JSON.stringify(res.error)}`);
  console.log("\nCheck the template renders correctly, then run `live --yes`.");
}

async function runLive(flags: Set<string>): Promise<void> {
  if (!flags.has("--yes")) {
    console.error("LIVE send requires explicit confirmation. Re-run with: live --yes");
    process.exit(1);
  }
  const iosVersion = configForPlatform("ios").recommendedVersion;
  if (iosVersion !== REQUIRED_IOS_VERSION && !flags.has("--skip-release-gate")) {
    console.error(
      `Refusing to send: server iOS recommendedVersion is "${iosVersion}", not "${REQUIRED_IOS_VERSION}".\n` +
        `Merge release/version-config-1.9.0 once 1.9.0 is live on the App Store, then re-run.`
    );
    process.exit(1);
  }
  const suppressionExists = existsSync(SUPPRESSION_FILE);
  if (!suppressionExists && !flags.has("--no-suppression-file")) {
    console.error(
      `Refusing to send: suppression file not found at ${SUPPRESSION_FILE}.\n` +
        `Export the Resend suppression list (bounced + complained + unsubscribed) into that file,\n` +
        `one email per line. To send WITHOUT a suppression file (not recommended), pass --no-suppression-file.`
    );
    process.exit(1);
  }

  const suppression = loadSuppression();
  const recipients = (await buildRecipients(suppression)).filter((r) => !r.alreadySent);

  console.log(`\n=== LIVE SEND — ${recipients.length} recipients ===`);
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO})`);
  console.log(`Suppression: ${suppressionExists ? `${suppression.size} addresses` : "NONE (override in effect)"}`);
  console.log("email\tsentAt\tresendId");

  const resend = getResendClient();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of recipients) {
    // Claim BEFORE sending. The @@unique([userId, emailKey]) constraint makes
    // this the idempotency guard: if the row already exists (a prior run or a
    // concurrent run), we skip — so the same user can never be emailed twice.
    try {
      await prisma.trialEmailLog.create({
        data: { userId: r.userId, emailKey: EMAIL_KEY, sentAt: new Date() },
      });
    } catch {
      skipped++;
      continue;
    }

    const { subject, html } = render(r);
    const res = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: r.email,
      subject,
      html,
      headers: {
        "List-Unsubscribe": `<${unsubUrl(r.userId)}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (res.error) {
      failed++;
      // Leave the claim row (resendId stays null) so this address is NOT auto-
      // retried on a re-run — a null-resendId row flags a send that needs manual
      // review rather than a silent double-send.
      console.error(`FAILED ${r.email}: ${JSON.stringify(res.error)}`);
    } else {
      await prisma.trialEmailLog.update({
        where: { userId_emailKey: { userId: r.userId, emailKey: EMAIL_KEY } },
        data: { resendId: res.data?.id ?? null },
      });
      sent++;
      console.log(`${r.email}\t${new Date().toISOString()}\t${res.data?.id ?? ""}`);
    }
    await sleep(SEND_INTERVAL_MS);
  }

  console.log(`\n── Done ── sent=${sent} skipped=${skipped} failed=${failed}`);
  if (failed > 0) {
    console.log(
      `${failed} send(s) failed. Their TrialEmailLog rows have a null resendId — review and, ` +
        `if truly unsent, delete those rows before re-running.`
    );
  }
}

// ── Entry ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.find((a) => !a.startsWith("--")) ?? "dry-run";
  const flags = new Set(args.filter((a) => a.startsWith("--")));

  switch (mode) {
    case "dry-run":
      await runDryRun();
      break;
    case "test": {
      const toFlag = [...flags].find((f) => f.startsWith("--to="));
      await runTest(toFlag ? toFlag.slice(5) : DEFAULT_TEST_TO);
      break;
    }
    case "live":
      await runLive(flags);
      break;
    default:
      console.error(`Unknown mode "${mode}". Use: dry-run | test | live --yes`);
      process.exit(1);
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
