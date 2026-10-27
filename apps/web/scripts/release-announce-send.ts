/**
 * Release announcement send, for any release in
 * src/emails/announcements/releases.ts (generalised from
 * ripple-1-9-send.ts, 2026-10-23).
 *
 * PREFER /admin/release-email (2026-10-27): same rails, the Resend key
 * stays in Vercel, and the suppression list is read live from Resend
 * (lib/release-announce.ts). This CLI needs RESEND_API_KEY locally plus a
 * hand-exported suppression file.
 *
 * Sends REAL email to REAL users. Hard stop between each stage:
 *
 *   1) dry-run  (default)  prints the recipient list. NOTHING is sent.
 *   2) test [--to=addr]    ONE copy to jim@heelerdigital.com (or --to).
 *                          No DB writes, no dedup.
 *   3) live --yes          the real list. Every send is claimed in
 *                          TrialEmailLog (emailKey release_<version>) BEFORE
 *                          the network call, so a re-run never double-sends.
 *
 * RELEASE GATE (iOS): `live` refuses unless the App Store's public lookup
 * says <version> is the live version, so the email can't go out before
 * users can actually get the update. Android has no public lookup: pass
 * --skip-release-gate once you've confirmed it's live on Google Play.
 *
 *   cd apps/web
 *   npx tsx scripts/release-announce-send.ts 1.9.5                # dry-run
 *   npx tsx scripts/release-announce-send.ts 1.9.5 test           # one test copy
 *   npx tsx scripts/release-announce-send.ts 1.9.5 preview        # writes HTML to /tmp, sends nothing
 *   npx tsx scripts/release-announce-send.ts 1.9.5 live --yes     # LIVE
 *
 * Audience: users of that platform (devicePlatform or pushTokenPlatform),
 * not unsubscribed, not in the suppression file.
 */

// Load env BEFORE any "@/..." import so prisma is built with valid creds.
import "./load-env";

import { resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { releaseAnnouncement, type ReleaseVars as AnnouncementVars } from "@/emails/announcements/release";
import { releaseEmailFor } from "@/emails/announcements/releases";

// ── Config ───────────────────────────────────────────────────────────────
const VERSION = process.argv.slice(2).find((a) => /^\d+\.\d+(\.\d+)?$/.test(a)) ?? "";
const RELEASE = releaseEmailFor(VERSION);
if (!RELEASE) {
  console.error(`No release email for "${VERSION}". Add it to src/emails/announcements/releases.ts. Usage: release-announce-send.ts <version> [dry-run|test|preview|live --yes]`);
  process.exit(1);
}
const EMAIL_KEY = `release_${VERSION}`;
const APP_STORE_LOOKUP = "https://itunes.apple.com/lookup?id=6762633410&country=us";
const DEFAULT_TEST_TO = "jim@heelerdigital.com";
const APP_ORIGIN = "https://goripple.io";
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS ?? 600); // ~2/s Resend limit
// Same export of bounced + complained + unsubscribed addresses as 1.9.
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
  return releaseAnnouncement(RELEASE!, vars);
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
  // Single segment: this release's platform, not unsubscribed.
  const platform = RELEASE!.platform;
  const candidates = await prisma.user.findMany({
    where: {
      onboardingUnsubscribed: false,
      OR: [{ devicePlatform: platform }, { pushTokenPlatform: platform }],
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
  console.log(`\nRIPPLE ${VERSION} — one email, ${RELEASE!.platform} users  [${rows.length} recipients]`);
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
  const { subject, html } = releaseAnnouncement(RELEASE!, vars);
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
  if (!flags.has("--skip-release-gate")) {
    if (RELEASE!.platform !== "ios") {
      console.error("Refusing to send: no public Google Play version lookup. Confirm it's live, then pass --skip-release-gate.");
      process.exit(1);
    }
    const live = await liveAppStoreVersion();
    if (live !== VERSION) {
      console.error(`Refusing to send: the App Store shows "${live ?? "unknown"}", not "${VERSION}". Re-run once ${VERSION} is live.`);
      process.exit(1);
    }
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

/** The version the App Store is serving right now (public lookup API). */
async function liveAppStoreVersion(): Promise<string | null> {
  try {
    const res = await fetch(APP_STORE_LOOKUP, { cache: "no-store" });
    const json = (await res.json()) as { results?: Array<{ version?: string }> };
    return json.results?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

/** Renders the email to a local HTML file to look at. Sends nothing. */
function runPreview(): void {
  const { subject, html } = releaseAnnouncement(RELEASE!, { firstName: "Jimmy", unsubscribeUrl: `${APP_ORIGIN}/api/emails/unsubscribe?token=preview` });
  const out = `/tmp/release-${VERSION}.html`;
  writeFileSync(out, html);
  console.log(`Subject: ${subject}\nWrote ${out}`);
}

// ── Entry ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.find((a) => !a.startsWith("--") && a !== VERSION) ?? "dry-run";
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
    case "preview":
      runPreview();
      break;
    case "live":
      await runLive(flags);
      break;
    default:
      console.error(`Unknown mode "${mode}". Use: <version> dry-run | test | preview | live --yes`);
      process.exit(1);
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma?.$disconnect());
