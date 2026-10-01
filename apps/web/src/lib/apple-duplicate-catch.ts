/**
 * Catch "paid on the web, then Sign in with Apple made a second account"
 * (2026-10-01, per Keenan: "set up a system to auto-catch this from here on
 * out and send an urgent email in those cases automatically").
 *
 * What happens: she pays in the funnel as aubrey@me.com, opens the app,
 * taps Sign in with Apple and picks Hide My Email. Apple hands us
 * xyz@privaterelay.appleid.com, nothing matches, and the app creates a new
 * empty TRIAL account. Her membership is invisible in the app.
 *
 * Every 15 minutes (recovery orchestrator) this looks for new Apple
 * accounts (48h) that aren't paying, and matches each to a web-paid account
 * that has never been in the app and paid shortly before:
 *   strong   — a name from Apple matches the paid account's name or email
 *              (e.g. "Aubrey Tondreault" ↔ atondreault@me.com), paid ≤48h before
 *   possible — no name match, but exactly one such paid account paid in the
 *              2 hours before the Apple account appeared
 * For each match, once:
 *   1. URGENT email to the PAID address (apple_duplicate_rescue) with a
 *      one-tap link that opens the app signed into the paid account. Safe
 *      even on a wrong guess: only the inbox owner can use it, and it just
 *      gets a paying customer into their own account.
 *   2. URGENT alert to the founders with both accounts and a signed
 *      "link these accounts" button (/api/admin/link-apple), which moves the
 *      Apple ID onto the paid account so Sign in with Apple works from then on.
 * The Apple ID is never moved automatically: a wrong guess there would put
 * a stranger into someone's paid account.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

const DUPE_WINDOW_MS = 48 * 3600_000;
const STRONG_GAP_MS = 48 * 3600_000;
const POSSIBLE_GAP_MS = 2 * 3600_000;
export const FLAG_EVENT = "apple_dupe_flagged";

export interface DupeAccount {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}
export interface PaidAccount {
  id: string;
  email: string;
  name: string | null;
  paidAt: Date;
}
export interface DupeMatch {
  dupe: DupeAccount;
  paid: PaidAccount;
  confidence: "strong" | "possible";
  why: string;
}

function tokens(s: string | null | undefined): string[] {
  return (s ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);
}

/** Does a name from Apple point at this paid account? Pure, for tests. */
export function nameMatches(dupeName: string | null, paid: { name: string | null; email: string }): string | null {
  const local = paid.email.toLowerCase().split("@")[0].replace(/[^a-z]/g, "");
  const paidNames = tokens(paid.name);
  for (const t of tokens(dupeName)) {
    if (paidNames.includes(t)) return `name "${t}" matches`;
    if (t.length >= 4 && local.includes(t)) return `"${t}" is in ${paid.email}`;
  }
  return null;
}

/** Pick at most one paid account per dupe. Pure, for tests. */
export function matchDuplicates(dupes: DupeAccount[], paid: PaidAccount[]): DupeMatch[] {
  const out: DupeMatch[] = [];
  const used = new Set<string>();
  for (const d of dupes) {
    const before = paid.filter((p) => !used.has(p.id) && p.paidAt <= d.createdAt);
    const strong = before
      .filter((p) => d.createdAt.getTime() - p.paidAt.getTime() <= STRONG_GAP_MS)
      .map((p) => ({ p, why: nameMatches(d.name, p) }))
      .filter((x): x is { p: PaidAccount; why: string } => !!x.why)
      .sort((a, b) => b.p.paidAt.getTime() - a.p.paidAt.getTime());
    if (strong.length) {
      used.add(strong[0].p.id);
      out.push({ dupe: d, paid: strong[0].p, confidence: "strong", why: strong[0].why });
      continue;
    }
    const near = before.filter((p) => d.createdAt.getTime() - p.paidAt.getTime() <= POSSIBLE_GAP_MS);
    if (near.length === 1) {
      used.add(near[0].id);
      const mins = Math.round((d.createdAt.getTime() - near[0].paidAt.getTime()) / 60_000);
      out.push({ dupe: d, paid: near[0], confidence: "possible", why: `only web payment in the 2h before (${mins} min earlier), no name to confirm` });
    }
  }
  return out;
}

// ── Signed one-click link for the founders' alert ─────────────────────────
const LINK_TTL_MS = 14 * 24 * 3600_000;

function linkSig(payload: string): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET unset");
  return createHmac("sha256", `link-apple:${secret}`).update(payload).digest();
}

export function signLinkApple(fromUserId: string, toUserId: string): string {
  const payload = Buffer.from(`${fromUserId}.${toUserId}.${Date.now() + LINK_TTL_MS}`).toString("base64url");
  return `${payload}.${linkSig(payload).toString("base64url")}`;
}

export function verifyLinkApple(token: string | null | undefined): { from: string; to: string } | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = linkSig(payload);
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const [from, to, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!from || !to || !(Number(exp) > Date.now())) return null;
  return { from, to };
}

// ── The sweep ─────────────────────────────────────────────────────────────
export async function runAppleDuplicateCatch(opts: { dryRun?: boolean } = {}): Promise<DupeMatch[]> {
  const { prisma } = await import("@/lib/prisma");
  const { isInternalEmail } = await import("@/lib/internal-traffic");
  const now = Date.now();

  const dupes = (
    await prisma.user.findMany({
      where: {
        appleSubject: { not: null },
        createdAt: { gte: new Date(now - DUPE_WINDOW_MS) },
        subscriptionStatus: { not: "PRO" },
        stripeCustomerId: null,
        isAdmin: false,
      },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    })
  ).filter((u) => !isInternalEmail(u.email));
  if (!dupes.length) return [];

  const paidRows = (
    await prisma.user.findMany({
      where: {
        subscriptionStatus: "PRO",
        stripeSubscriptionId: { not: null },
        appleSubject: null,
        isAdmin: false,
        createdAt: { gte: new Date(now - DUPE_WINDOW_MS - STRONG_GAP_MS) },
      },
      select: { id: true, email: true, name: true, createdAt: true },
    })
  ).filter((u) => !isInternalEmail(u.email));
  if (!paidRows.length) return [];

  const ids = paidRows.map((p) => p.id);
  const events = await prisma.onboardingEvent.findMany({
    where: { userId: { in: ids }, event: { in: ["app_signed_in", "funnel_payment_completed", "meta_capi_purchase_ok", FLAG_EVENT] } },
    select: { userId: true, event: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const inApp = new Set(events.filter((e) => e.event === "app_signed_in").map((e) => e.userId));
  const flagged = new Set(events.filter((e) => e.event === FLAG_EVENT).map((e) => e.userId));
  const paidAt = new Map<string, Date>();
  for (const e of events) {
    if ((e.event === "funnel_payment_completed" || e.event === "meta_capi_purchase_ok") && e.userId && !paidAt.has(e.userId)) paidAt.set(e.userId, e.createdAt);
  }
  const paid: PaidAccount[] = paidRows
    .filter((p) => !inApp.has(p.id) && !flagged.has(p.id))
    .map((p) => ({ id: p.id, email: p.email, name: p.name, paidAt: paidAt.get(p.id) ?? p.createdAt }));

  const matches = matchDuplicates(dupes, paid);
  if (opts.dryRun) return matches;

  const { sendTrialEmail } = await import("@/lib/trial-emails");
  for (const m of matches) {
    // Flag first so a send failure never turns into an email every 15 minutes.
    await prisma.onboardingEvent.create({ data: { userId: m.paid.id, event: FLAG_EVENT, value: `${m.dupe.id}:${m.confidence}` } });
    const result = await sendTrialEmail(m.paid.id, "apple_duplicate_rescue");
    await alertFounders(m, result.sent ? "sent" : `not sent (${result.reason ?? "unknown"})`);
  }
  return matches;
}

async function alertFounders(m: DupeMatch, rescue: string): Promise<void> {
  try {
    const { getResendClient } = await import("@/lib/resend");
    const origin = (process.env.NEXTAUTH_URL ?? "https://goripple.io").replace(/\/$/, "");
    const linkUrl = `${origin}/api/admin/link-apple?t=${encodeURIComponent(signLinkApple(m.dupe.id, m.paid.id))}`;
    const t = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const { error } = await getResendClient().emails.send({
      from: "hello@goripple.io",
      to: ["keenan@heelerdigital.com", "jim@heelerdigital.com"],
      replyTo: "keenan@heelerdigital.com",
      subject: `🚨 URGENT: paid customer stuck in a duplicate Apple account — ${m.paid.email} (${m.confidence})`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#C4451C;margin:0 0 12px;">Paid on the web, then Sign in with Apple made a second account</h2>
          <p style="margin:0 0 16px;color:#374151;line-height:1.6;">Their membership won't show in the app until they use the paid account.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:6px 0;color:#666;">Paid account</td><td style="padding:6px 0;font-weight:600;">${m.paid.email}${m.paid.name ? ` (${m.paid.name})` : ""} · paid ${t(m.paid.paidAt)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Apple account</td><td style="padding:6px 0;font-weight:600;">${m.dupe.email}${m.dupe.name ? ` (${m.dupe.name})` : ""} · created ${t(m.dupe.createdAt)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Match</td><td style="padding:6px 0;">${m.confidence.toUpperCase()}: ${m.why}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Rescue email</td><td style="padding:6px 0;">${rescue} (one-tap sign-in link to the paid address)</td></tr>
          </table>
          <p style="margin:20px 0 8px;color:#374151;line-height:1.6;">If this is the same person, link the accounts so Sign in with Apple opens the paid one from now on:</p>
          <p style="margin:0 0 16px;"><a href="${linkUrl}" style="display:inline-block;background:#C4451C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;">Link these accounts</a></p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Only moves the Apple sign-in, only if the Apple account has no debriefs. Link works for 14 days. Not the same person? Ignore this; the rescue email is harmless.</p>
        </div>`,
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
  } catch (err) {
    console.error("[apple-dupe] founder alert failed:", err instanceof Error ? err.message : err);
  }
}
