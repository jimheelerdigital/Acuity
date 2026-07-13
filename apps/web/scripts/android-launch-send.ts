/**
 * One-off Android-launch announcement send.
 *
 * Sends REAL email to REAL users. Safeguards are not optional and run in a
 * strict order, with a hard stop between each stage:
 *
 *   1) dry-run  (default)  — prints the full recipient list per segment as a
 *                            table. NOTHING is sent. Keenan approves the list.
 *   2) test                — sends both templates to keenan@heelerdigital.com
 *                            ONLY. No DB writes, no dedup.
 *   3) live  --yes         — sends to the real list. Every send is claimed and
 *                            logged in TrialEmailLog BEFORE the network call, so
 *                            a re-run can never double-send. Rate-limited.
 *
 * Run from apps/web so the "@/..." alias + .env resolve:
 *
 *   cd apps/web
 *   npx tsx scripts/android-launch-send.ts                 # dry-run
 *   npx tsx scripts/android-launch-send.ts test            # test send to Keenan
 *   npx tsx scripts/android-launch-send.ts live --yes      # LIVE send
 *
 * Segments (see docs/acuity-positioning.md for the copy voice):
 *   A = signup events show os:android  AND 0 recordings                → "Android is live"
 *   B = (os:ios OR unknown/desktop) AND 0 recordings AND no app        → App Store re-nudge
 *       platform registered
 *
 * Global exclusions (both segments): any recording, active in-app in the last
 * 7 days, onboardingUnsubscribed, or listed in the Resend suppression file.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

config({ path: resolve(__dirname, "..", ".env.local") });
// Root .env holds the valid Resend key + secrets; override placeholders.
config({ path: resolve(__dirname, "../../..", ".env"), override: true });

import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { androidLaunchA, type AnnouncementVars } from "@/emails/announcements/android-launch-a";
import { androidLaunchB, type SegmentBVariant } from "@/emails/announcements/android-launch-b";

// ── Config ───────────────────────────────────────────────────────────────
const KEY_A = "android_launch_a";
const KEY_B = "android_launch_b";
const TEST_TO = "keenan@heelerdigital.com";
const APP_ORIGIN = "https://www.getacuity.io";
const ACTIVE_WINDOW_DAYS = 7;
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS ?? 600); // ~2/s Resend limit
const SUPPRESSION_FILE = resolve(__dirname, "android-launch-suppression.txt");

// Sender: keenan@heelerdigital.com only if that domain is verified in Resend,
// else fall back to the known-verified getacuity.io sender with reply-to Keenan.
const HEELER_VERIFIED = process.env.HEELERDIGITAL_SENDER_VERIFIED === "true";
const FROM = HEELER_VERIFIED
  ? '"Keenan" <keenan@heelerdigital.com>'
  : '"Keenan at Acuity" <hello@getacuity.io>';
const REPLY_TO = HEELER_VERIFIED ? "keenan@heelerdigital.com" : "keenan@getacuity.io";

type Segment = "A" | "B";

interface Recipient {
  userId: string;
  email: string;
  firstName: string | null;
  segment: Segment;
  variant: SegmentBVariant | null;
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

function keyFor(segment: Segment): string {
  return segment === "A" ? KEY_A : KEY_B;
}

function unsubUrl(userId: string): string {
  const token = signUnsubscribeToken(userId, "onboarding");
  return `${APP_ORIGIN}/api/emails/unsubscribe?token=${encodeURIComponent(token)}`;
}

function render(r: Recipient): { subject: string; html: string } {
  const vars: AnnouncementVars = { firstName: r.firstName, unsubscribeUrl: unsubUrl(r.userId) };
  return r.segment === "A"
    ? androidLaunchA(vars)
    : androidLaunchB({ ...vars, variant: r.variant ?? "generic" });
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

// ── Segmentation ─────────────────────────────────────────────────────────
async function buildRecipients(suppression: Set<string>): Promise<Recipient[]> {
  const activeCutoff = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 86_400_000);

  // Base pool: never recorded, not unsubscribed, not active in the last 7 days.
  const candidates = await prisma.user.findMany({
    where: {
      totalRecordings: 0,
      firstRecordingAt: null,
      onboardingUnsubscribed: false,
      OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: activeCutoff } }],
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      devicePlatform: true,
      appFirstOpenedAt: true,
      pushTokenPlatform: true,
    },
  });
  const candidateIds = candidates.map((c) => c.id);
  if (candidateIds.length === 0) return [];

  // OS is encoded inside OnboardingEvent.value as "os:android" / "os:ios"
  // (pipe-delimited PII-safe diagContext). A user counts as that OS if ANY of
  // their events carries it.
  const [androidRows, iosRows, sentRows] = await Promise.all([
    prisma.onboardingEvent.findMany({
      where: { userId: { in: candidateIds }, value: { contains: "os:android" } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.onboardingEvent.findMany({
      where: { userId: { in: candidateIds }, value: { contains: "os:ios" } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.trialEmailLog.findMany({
      where: { userId: { in: candidateIds }, emailKey: { in: [KEY_A, KEY_B] } },
      select: { userId: true },
    }),
  ]);
  const androidSet = new Set(androidRows.map((r) => r.userId!));
  const iosSet = new Set(iosRows.map((r) => r.userId!));
  const sentSet = new Set(sentRows.map((r) => r.userId!));

  const recipients: Recipient[] = [];
  for (const u of candidates) {
    if (suppression.has(u.email.toLowerCase())) continue;

    const isAndroid = androidSet.has(u.id);
    const isIos = iosSet.has(u.id);
    const appRegistered =
      u.devicePlatform !== null || u.appFirstOpenedAt !== null || u.pushTokenPlatform !== null;

    let segment: Segment | null = null;
    let variant: SegmentBVariant | null = null;

    if (isAndroid) {
      // Segment A — Android signup, app now available.
      segment = "A";
    } else if (!appRegistered) {
      // Segment B — iOS or unknown/desktop, and never registered any app.
      segment = "B";
      variant = isIos ? "ios" : "generic";
    }
    if (!segment) continue;

    recipients.push({
      userId: u.id,
      email: u.email,
      firstName: firstNameOf(u.name),
      segment,
      variant,
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

function printTable(segment: Segment, rows: Recipient[]): void {
  const title =
    segment === "A"
      ? "SEGMENT A — Android is live (Play Store)"
      : "SEGMENT B — App Store re-nudge (ios / generic variants)";
  console.log(`\n${title}  [${rows.length} recipients]`);
  console.log("─".repeat(110));
  console.log(
    "email".padEnd(38) +
      "seg".padEnd(6) +
      "signup".padEnd(12) +
      "lastEvent".padEnd(38) +
      "lastAt".padEnd(12) +
      "status"
  );
  console.log("─".repeat(110));
  for (const r of rows) {
    const segLabel = r.segment === "B" ? `B/${r.variant}` : "A";
    console.log(
      r.email.slice(0, 37).padEnd(38) +
        segLabel.padEnd(6) +
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

  const segA = recipients.filter((r) => r.segment === "A");
  const segB = recipients.filter((r) => r.segment === "B");

  console.log("\n=== DRY RUN — nothing will be sent ===");
  console.log(`Suppression file: ${existsSync(SUPPRESSION_FILE) ? `${SUPPRESSION_FILE} (${suppression.size} addresses)` : "NOT FOUND — no bounced/complained addresses excluded"}`);
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO}, heelerdigital verified=${HEELER_VERIFIED})`);

  printTable("A", segA);
  printTable("B", segB);

  const queuedA = segA.filter((r) => !r.alreadySent).length;
  const queuedB = segB.filter((r) => !r.alreadySent).length;
  console.log("\n── Summary ──");
  console.log(`Segment A: ${segA.length} total, ${queuedA} to send (${segA.length - queuedA} already sent)`);
  console.log(`Segment B: ${segB.length} total, ${queuedB} to send (${segB.length - queuedB} already sent)`);
  console.log(`TOTAL to send on live run: ${queuedA + queuedB}`);
  console.log("\nNext: review this list. If approved, run `test` then `live --yes`.");
}

async function runTest(): Promise<void> {
  const resend = getResendClient();
  const vars: AnnouncementVars = { firstName: "Keenan", unsubscribeUrl: unsubUrl("test-user-id") };
  const samples = [
    { label: "A (android launch)", ...androidLaunchA(vars) },
    { label: "B/ios (app store re-nudge)", ...androidLaunchB({ ...vars, variant: "ios" }) },
    { label: "B/generic (unknown OS)", ...androidLaunchB({ ...vars, variant: "generic" }) },
  ];
  console.log(`\n=== TEST SEND → ${TEST_TO} (no DB writes) ===`);
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO})`);
  for (const s of samples) {
    const res = await resend.emails.send({
      from: FROM,
      replyTo: REPLY_TO,
      to: TEST_TO,
      subject: `[TEST] ${s.subject}`,
      html: s.html,
      headers: {
        "List-Unsubscribe": `<${vars.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    console.log(`${s.label}: id=${res.data?.id ?? "ERR"} err=${JSON.stringify(res.error)}`);
    await sleep(SEND_INTERVAL_MS);
  }
  console.log("\nCheck both templates render correctly, then run `live --yes`.");
}

async function runLive(flags: Set<string>): Promise<void> {
  if (!flags.has("--yes")) {
    console.error("LIVE send requires explicit confirmation. Re-run with: live --yes");
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
  console.log("email\ttemplate\tsentAt\tresendId");

  const resend = getResendClient();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const r of recipients) {
    const emailKey = keyFor(r.segment);

    // Claim BEFORE sending. The @@unique([userId, emailKey]) constraint makes
    // this the idempotency guard: if the row already exists (a prior run or a
    // concurrent run), we skip — so the same user can never be emailed twice.
    try {
      await prisma.trialEmailLog.create({
        data: { userId: r.userId, emailKey, sentAt: new Date() },
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
      console.error(`FAILED ${r.email} (${emailKey}): ${JSON.stringify(res.error)}`);
    } else {
      await prisma.trialEmailLog.update({
        where: { userId_emailKey: { userId: r.userId, emailKey } },
        data: { resendId: res.data?.id ?? null },
      });
      sent++;
      console.log(`${r.email}\t${emailKey}\t${new Date().toISOString()}\t${res.data?.id ?? ""}`);
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
    case "test":
      await runTest();
      break;
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
