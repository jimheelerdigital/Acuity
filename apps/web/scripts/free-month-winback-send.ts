/**
 * Win-back free month send (2026-10-14, per Keenan). Sends REAL email to
 * REAL users, with the same staged safeguards as ripple-1-9-send.ts:
 *
 *   1) dry-run  (default)  — prints the recipient list. NOTHING is sent.
 *   2) test [--to=addr]    — sends ONE copy (default keenan@heelerdigital.com).
 *                            No DB writes, no dedup.
 *   3) live  --yes         — sends to the list. Every send is claimed in
 *                            TrialEmailLog BEFORE the network call, so a re-run
 *                            never double-sends. Rate-limited.
 *
 * Audience: churned accounts per lib/free-month.ts FREE_MONTH_ELIGIBLE_WHERE
 * (free plan now, had Pro before, not an App Store / Google Play subscriber,
 * never claimed the month), not unsubscribed, not internal, not in the
 * suppression file.
 *
 *   cd apps/web
 *   npx tsx scripts/free-month-winback-send.ts                 # dry-run
 *   npx tsx scripts/free-month-winback-send.ts test            # one test copy
 *   npx tsx scripts/free-month-winback-send.ts live --yes      # LIVE send
 */

// Load env BEFORE any "@/..." import so prisma is built with valid creds.
import "./load-env";

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { getResendClient } from "@/lib/resend";
import { signUnsubscribeToken } from "@/lib/email-tokens";
import { isInternalEmail } from "@/lib/internal-traffic";
import { FREE_MONTH_ELIGIBLE_WHERE, freeMonthUrl } from "@/lib/free-month";
import { freeMonthWinback } from "@/emails/announcements/free-month-winback";

// ── Config ───────────────────────────────────────────────────────────────
const EMAIL_KEY = "winback_free_month";
const CAMPAIGN = "winback_free_month";
const DEFAULT_TEST_TO = "keenan@heelerdigital.com";
const APP_ORIGIN = "https://goripple.io";
const SEND_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS ?? 600); // ~2/s Resend limit
const SUPPRESSION_FILE = resolve(__dirname, "free-month-winback-suppression.txt");

// Same Keenan lifecycle sender as the trial emails and the 1.9 announcement;
// replies (the answers to the three questions) land in Keenan's inbox.
const FROM = '"Keenan from Ripple" <keenan@getacuity.io>';
const REPLY_TO = "keenan@getacuity.io";

interface Recipient {
  userId: string;
  email: string;
  firstName: string | null;
  kind: "ex-paid" | "trial-ran-out";
  alreadySent: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** First name, or null when the stored name is really an email handle ("chantia.brown"). */
function firstNameOf(name: string | null, email: string): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  if (!n || /[@._\d]/.test(n) || n.toLowerCase() === email.split("@")[0].toLowerCase()) return null;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function unsubUrl(userId: string): string {
  const token = signUnsubscribeToken(userId, "onboarding");
  return `${APP_ORIGIN}/api/emails/unsubscribe?token=${encodeURIComponent(token)}`;
}

function render(r: Pick<Recipient, "userId" | "firstName">): { subject: string; html: string } {
  return freeMonthWinback({
    firstName: r.firstName,
    claimUrl: freeMonthUrl(r.userId, CAMPAIGN),
    unsubscribeUrl: unsubUrl(r.userId),
  });
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
  const candidates = await prisma.user.findMany({
    where: { ...FREE_MONTH_ELIGIBLE_WHERE, onboardingUnsubscribed: false },
    select: { id: true, email: true, name: true, stripeSubscriptionId: true, subscriptionSource: true },
    orderBy: { createdAt: "asc" },
  });
  const sent = new Set(
    (
      await prisma.trialEmailLog.findMany({
        where: { userId: { in: candidates.map((c) => c.id) }, emailKey: EMAIL_KEY },
        select: { userId: true },
      })
    ).map((r) => r.userId!)
  );
  return candidates
    .filter((u) => !isInternalEmail(u.email) && !suppression.has(u.email.toLowerCase()))
    .map((u) => ({
      userId: u.id,
      email: u.email,
      firstName: firstNameOf(u.name, u.email),
      kind: u.stripeSubscriptionId || u.subscriptionSource === "stripe" ? ("ex-paid" as const) : ("trial-ran-out" as const),
      alreadySent: sent.has(u.id),
    }));
}

// ── Modes ────────────────────────────────────────────────────────────────
async function runDryRun(): Promise<void> {
  const suppression = loadSuppression();
  const recipients = await buildRecipients(suppression);
  console.log("\n=== DRY RUN — nothing will be sent ===");
  console.log(`Suppression file: ${existsSync(SUPPRESSION_FILE) ? `${suppression.size} addresses` : "NOT FOUND"}`);
  console.log(`Sender: ${FROM}  (reply-to ${REPLY_TO})\n`);
  for (const r of recipients) {
    console.log(`${r.email.slice(0, 40).padEnd(42)}${(r.firstName ?? "—").padEnd(14)}${r.kind.padEnd(16)}${r.alreadySent ? "ALREADY-SENT (skip)" : "queued"}`);
  }
  const queued = recipients.filter((r) => !r.alreadySent);
  console.log("\n── Summary ──");
  console.log(
    `${recipients.length} total, ${queued.length} to send ` +
      `(ex-paid ${queued.filter((r) => r.kind === "ex-paid").length}, trial ran out ${queued.filter((r) => r.kind === "trial-ran-out").length})`
  );
}

async function runTest(to: string): Promise<void> {
  // A real account's id so the button opens a real page (it shows "already
  // Pro" / "not available" for an account that can't claim; nothing changes
  // until the button on that page is pressed).
  const me = await prisma.user.findFirst({ where: { email: to }, select: { id: true } });
  const userId = me?.id ?? "test-user-id";
  const { subject, html } = render({ userId, firstName: "Keenan" });
  console.log(`\n=== TEST SEND → ${to} (no DB writes) ===`);
  const res = await getResendClient().emails.send({
    from: FROM,
    replyTo: REPLY_TO,
    to,
    subject: `[TEST] ${subject}`,
    html,
    headers: { "List-Unsubscribe": `<${unsubUrl(userId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  console.log(`sent: id=${res.data?.id ?? "ERR"} err=${JSON.stringify(res.error)}`);
}

async function runLive(flags: Set<string>): Promise<void> {
  if (!flags.has("--yes")) {
    console.error("LIVE send requires explicit confirmation. Re-run with: live --yes");
    process.exit(1);
  }
  const suppression = loadSuppression();
  const recipients = (await buildRecipients(suppression)).filter((r) => !r.alreadySent);
  console.log(`\n=== LIVE SEND — ${recipients.length} recipients ===`);

  const resend = getResendClient();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const r of recipients) {
    // Claim BEFORE sending: @@unique([userId, emailKey]) makes a second run skip.
    try {
      await prisma.trialEmailLog.create({ data: { userId: r.userId, emailKey: EMAIL_KEY, sentAt: new Date() } });
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
      headers: { "List-Unsubscribe": `<${unsubUrl(r.userId)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (res.error) {
      // The claim row stays with a null resendId: review by hand, never auto-retried.
      failed++;
      console.error(`FAILED ${r.email}: ${JSON.stringify(res.error)}`);
    } else {
      await prisma.trialEmailLog.update({
        where: { userId_emailKey: { userId: r.userId, emailKey: EMAIL_KEY } },
        data: { resendId: res.data?.id ?? null },
      });
      sent++;
      console.log(`${r.email}\t${res.data?.id ?? ""}`);
    }
    await sleep(SEND_INTERVAL_MS);
  }
  console.log(`\n── Done ── sent=${sent} skipped=${skipped} failed=${failed}`);
}

// ── Entry ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args.find((a) => !a.startsWith("--")) ?? "dry-run";
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  if (mode === "dry-run") await runDryRun();
  else if (mode === "test") {
    const toFlag = [...flags].find((f) => f.startsWith("--to="));
    await runTest(toFlag ? toFlag.slice(5) : DEFAULT_TEST_TO);
  } else if (mode === "live") await runLive(flags);
  else {
    console.error(`Unknown mode "${mode}". Use: dry-run | test | live --yes`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
