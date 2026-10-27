/**
 * Release announcement email: shared by the admin page
 * (/admin/release-email → POST /api/admin/release-email) and the CLI
 * (scripts/release-announce-send.ts). 2026-10-27.
 *
 * The admin route is the normal way to send. The Resend key stays in
 * Vercel, and the suppression list comes straight from Resend's API, so
 * there's no hand-exported file.
 *
 * Safety rails, the same everywhere:
 *  - RELEASE GATE: an iOS live send refuses unless the App Store's public
 *    lookup serves that version.
 *  - Every send is claimed in TrialEmailLog (emailKey release_<version>)
 *    BEFORE the network call. @@unique([userId, emailKey]) makes a re-run,
 *    or a second click, skip anyone already claimed.
 *  - Suppressed (bounced / complained / manual) and unsubscribed users are
 *    excluded.
 */
import type { PrismaClient } from "@prisma/client";

import {
  releaseAnnouncement,
  type ReleaseEmail,
  type ReleaseVars,
} from "@/emails/announcements/release";
import { signUnsubscribeToken } from "@/lib/email-tokens";

export const RELEASE_FROM = '"Keenan from Ripple" <keenan@getacuity.io>';
export const RELEASE_REPLY_TO = "keenan@getacuity.io";
export const APP_STORE_LOOKUP = "https://itunes.apple.com/lookup?id=6762633410&country=us";
const APP_ORIGIN = "https://goripple.io";
const RESEND_API = "https://api.resend.com";

export const releaseEmailKey = (version: string) => `release_${version}`;

export type ReleaseRecipient = {
  userId: string;
  email: string;
  firstName: string | null;
  createdAt: Date;
  alreadySent: boolean;
};

export function firstNameOf(name: string | null): string | null {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || null;
}

export function unsubscribeUrlFor(userId: string): string {
  const token = signUnsubscribeToken(userId, "onboarding");
  return `${APP_ORIGIN}/api/emails/unsubscribe?token=${encodeURIComponent(token)}`;
}

export function renderRelease(
  release: ReleaseEmail,
  userId: string,
  firstName: string | null
): { subject: string; html: string; unsubscribeUrl: string } {
  const unsubscribeUrl = unsubscribeUrlFor(userId);
  const vars: ReleaseVars = { firstName, unsubscribeUrl };
  return { ...releaseAnnouncement(release, vars), unsubscribeUrl };
}

/** The version the App Store is serving right now, or null if unknown. */
export async function liveAppStoreVersion(
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  try {
    const res = await fetchImpl(APP_STORE_LOOKUP, { cache: "no-store" });
    const json = (await res.json()) as { results?: Array<{ version?: string }> };
    return json.results?.[0]?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * Every suppressed address on the Resend account (bounce, complaint,
 * manual), lower-cased. Throws if Resend can't be read: a live send must
 * not go out with an unknown suppression list.
 * API: GET /suppressions, cursor paging with `after`, max 100 per page.
 */
export async function fetchResendSuppressions(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  maxPages = 200
): Promise<Set<string>> {
  const out = new Set<string>();
  let after: string | null = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${RESEND_API}/suppressions`);
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Resend suppressions request failed (${res.status})`);
    }
    const body = (await res.json()) as {
      has_more?: boolean;
      data?: Array<{ id: string; email: string }>;
    };
    const rows = body.data ?? [];
    for (const r of rows) if (r.email) out.add(r.email.trim().toLowerCase());
    if (!body.has_more || rows.length === 0) return out;
    after = rows[rows.length - 1].id;
  }
  throw new Error("Resend suppressions: too many pages");
}

/**
 * The audience: this release's platform (devicePlatform or
 * pushTokenPlatform), not unsubscribed, not suppressed. `alreadySent`
 * marks users claimed by an earlier run.
 */
export async function buildReleaseRecipients(
  db: Pick<PrismaClient, "user" | "trialEmailLog">,
  release: ReleaseEmail,
  suppression: Set<string>
): Promise<{ recipients: ReleaseRecipient[]; suppressedCount: number }> {
  const candidates = await db.user.findMany({
    where: {
      onboardingUnsubscribed: false,
      OR: [{ devicePlatform: release.platform }, { pushTokenPlatform: release.platform }],
    },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (candidates.length === 0) return { recipients: [], suppressedCount: 0 };

  const sentRows = await db.trialEmailLog.findMany({
    where: {
      userId: { in: candidates.map((c) => c.id) },
      emailKey: releaseEmailKey(release.version),
    },
    select: { userId: true },
  });
  const sent = new Set(sentRows.map((r) => r.userId));

  let suppressedCount = 0;
  const recipients: ReleaseRecipient[] = [];
  for (const u of candidates) {
    if (suppression.has(u.email.toLowerCase())) {
      suppressedCount++;
      continue;
    }
    recipients.push({
      userId: u.id,
      email: u.email,
      firstName: firstNameOf(u.name),
      createdAt: u.createdAt,
      alreadySent: sent.has(u.id),
    });
  }
  return { recipients, suppressedCount };
}

/** Minimal surface of the Resend client used here (mockable). */
export type ReleaseMailer = {
  emails: {
    send: (p: {
      from: string;
      replyTo: string;
      to: string;
      subject: string;
      html: string;
      headers: Record<string, string>;
    }) => Promise<{ data?: { id?: string } | null; error?: unknown }>;
  };
};

function sendOne(
  mailer: ReleaseMailer,
  to: string,
  subject: string,
  html: string,
  unsubscribeUrl: string
) {
  return mailer.emails.send({
    from: RELEASE_FROM,
    replyTo: RELEASE_REPLY_TO,
    to,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/** One "[TEST]" copy. No DB writes, no claim. */
export async function sendReleaseTest(
  mailer: ReleaseMailer,
  release: ReleaseEmail,
  to: string
): Promise<{ id: string | null; error: unknown }> {
  const { subject, html, unsubscribeUrl } = renderRelease(release, "test-user-id", "Jimmy");
  const res = await sendOne(mailer, to, `[TEST] ${subject}`, html, unsubscribeUrl);
  return { id: res.data?.id ?? null, error: res.error ?? null };
}

export type LiveSendResult = {
  sent: number;
  skipped: number;
  failed: number;
  remaining: number;
  failures: string[];
};

/**
 * Send to everyone not yet claimed. Claims each user BEFORE sending, so
 * a re-run never double-sends. Stops at `deadline` (ms epoch) and reports
 * `remaining`, so a timed-out request can simply be run again.
 */
export async function sendReleaseLive(opts: {
  db: Pick<PrismaClient, "trialEmailLog">;
  mailer: ReleaseMailer;
  release: ReleaseEmail;
  recipients: ReleaseRecipient[];
  intervalMs?: number;
  deadline?: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<LiveSendResult> {
  const { db, mailer, release } = opts;
  const intervalMs = opts.intervalMs ?? 600; // ~2/s Resend limit
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const emailKey = releaseEmailKey(release.version);
  const queue = opts.recipients.filter((r) => !r.alreadySent);
  const result: LiveSendResult = { sent: 0, skipped: 0, failed: 0, remaining: 0, failures: [] };

  for (let i = 0; i < queue.length; i++) {
    if (opts.deadline && Date.now() > opts.deadline) {
      result.remaining = queue.length - i;
      break;
    }
    const r = queue[i];
    try {
      await db.trialEmailLog.create({
        data: { userId: r.userId, emailKey, sentAt: new Date() },
      });
    } catch {
      result.skipped++; // claimed by an earlier/concurrent run
      continue;
    }
    const { subject, html, unsubscribeUrl } = renderRelease(release, r.userId, r.firstName);
    const res = await sendOne(mailer, r.email, subject, html, unsubscribeUrl);
    if (res.error) {
      // Claim row stays with a null resendId: flags the send for manual
      // review instead of an automatic (possibly double) retry.
      result.failed++;
      result.failures.push(r.email);
    } else {
      await db.trialEmailLog.update({
        where: { userId_emailKey: { userId: r.userId, emailKey } },
        data: { resendId: res.data?.id ?? null },
      });
      result.sent++;
    }
    if (i < queue.length - 1) await sleep(intervalMs);
  }
  return result;
}
