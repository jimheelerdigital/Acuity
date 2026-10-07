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
 *              2 hours before the Apple account appeared, AND the names don't
 *              conflict (one side has no name). Two different names = never.
 * For each match, once:
 *   1. URGENT email to the PAID address (apple_duplicate_rescue) with a
 *      one-tap link that opens the app signed into the paid account. Safe
 *      even on a wrong guess: only the inbox owner can use it, and it just
 *      gets a paying customer into their own account.
 *   2. URGENT alert to the founders with both accounts and a signed
 *      "link these accounts" button (/api/admin/link-apple), which moves the
 *      Apple ID onto the paid account so Sign in with Apple works from then on.
 * 2026-10-06 (Keenan): VERY STRONG matches (name match + Apple account within
 * 2h of paying, isVeryStrong) now move the Apple ID automatically
 * (linkAppleAccounts, same guards as the button: dupe has 0 debriefs, paid
 * account has no Apple ID yet) and the founder email reports it as fixed.
 * Everything else (name match >2h later, timing-only POSSIBLE) still waits
 * for the button in the founder email, because a wrong
 * guess there would put a stranger into someone's paid account.
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

/**
 * Do the two accounts carry DIFFERENT names? (2026-10-02, per Keenan: a
 * "possible" alert paired "Melissa" with "Sheryl Farrer".) True only when
 * both sides have a usable name and no token overlaps, so a missing name
 * never counts as a conflict. Pure, for tests.
 */
export function namesConflict(dupeName: string | null, paid: { name: string | null; email: string }): boolean {
  const a = tokens(dupeName);
  const b = tokens(paid.name);
  if (!a.length || !b.length) return false;
  return !nameMatches(dupeName, paid);
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
    // A timing-only guess is allowed only when nothing contradicts it: if
    // both accounts have names and they differ, they're different people.
    const near = before.filter(
      (p) => d.createdAt.getTime() - p.paidAt.getTime() <= POSSIBLE_GAP_MS && !namesConflict(d.name, p)
    );
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

// ── Moving the Apple sign-in ──────────────────────────────────────────────
const AUTO_LINK_GAP_MS = 2 * 3600_000;

/**
 * Safe to link without a founder: the Apple name matches the paid account
 * AND the Apple account appeared within 2h of the payment (LeJean: 2 min).
 * A name match a day later could be a different person with the same first
 * name, so that still goes to the founders first. Pure, for tests.
 */
export function isVeryStrong(m: DupeMatch): boolean {
  const gap = m.dupe.createdAt.getTime() - m.paid.paidAt.getTime();
  return m.confidence === "strong" && gap >= 0 && gap <= AUTO_LINK_GAP_MS;
}

export type LinkResult =
  | { ok: true; paidEmail: string }
  | { ok: false; reason: "not_found" | "already_linked" | "no_apple_id" | "paid_has_apple_id" | "dupe_has_debriefs"; detail: string };

/**
 * Move the Apple sign-in from the empty duplicate onto the paid account, so
 * Sign in with Apple opens the paid account from then on. Refuses unless the
 * duplicate still holds an Apple ID and has 0 debriefs, and the paid account
 * has no Apple ID yet. Undo = move appleSubject back by hand.
 */
export async function linkAppleAccounts(fromUserId: string, toUserId: string, how: "manual" | "auto"): Promise<LinkResult> {
  const { prisma } = await import("@/lib/prisma");
  const [dupe, paid] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId }, select: { id: true, email: true, appleSubject: true, totalRecordings: true } }),
    prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, email: true, appleSubject: true } }),
  ]);
  if (!dupe || !paid) return { ok: false, reason: "not_found", detail: "One of the two accounts no longer exists." };
  if (paid.appleSubject && !dupe.appleSubject) return { ok: false, reason: "already_linked", detail: `Sign in with Apple already opens ${paid.email}.` };
  if (!dupe.appleSubject) return { ok: false, reason: "no_apple_id", detail: `${dupe.email} has no Apple sign-in on it.` };
  if (paid.appleSubject) return { ok: false, reason: "paid_has_apple_id", detail: `${paid.email} already has a different Apple sign-in. Linking by hand needed.` };
  if (dupe.totalRecordings > 0) return { ok: false, reason: "dupe_has_debriefs", detail: `${dupe.email} has ${dupe.totalRecordings} debrief(s), so it isn't an empty duplicate. Linking by hand needed.` };

  const subject = dupe.appleSubject;
  await prisma.$transaction([
    prisma.user.update({ where: { id: dupe.id }, data: { appleSubject: null } }),
    prisma.user.update({ where: { id: paid.id }, data: { appleSubject: subject } }),
    prisma.onboardingEvent.create({ data: { userId: paid.id, event: "apple_dupe_linked", value: `${dupe.id}:${how}` } }),
  ]);
  return { ok: true, paidEmail: paid.email };
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
    // Very strong matches link on their own (2026-10-06, per Keenan: "if the
    // name matches and it's a very strong match, do it automatically";
    // "anything mismatched send me email first"). Everything else waits for
    // the button in the founder email.
    const link = isVeryStrong(m) ? await linkAppleAccounts(m.dupe.id, m.paid.id, "auto") : null;
    // Linked → "you're all set, sign back in with Apple"; not linked → the
    // original "use this email" rescue (2026-10-07).
    const result = await sendTrialEmail(m.paid.id, link?.ok ? "apple_duplicate_linked" : "apple_duplicate_rescue");
    await alertFounders(m, result.sent ? "sent" : `not sent (${result.reason ?? "unknown"})`, link);
  }
  return matches;
}

async function alertFounders(m: DupeMatch, rescue: string, link: LinkResult | null): Promise<void> {
  try {
    const { getResendClient } = await import("@/lib/resend");
    const origin = (process.env.NEXTAUTH_URL ?? "https://goripple.io").replace(/\/$/, "");
    const linkUrl = `${origin}/api/admin/link-apple?t=${encodeURIComponent(signLinkApple(m.dupe.id, m.paid.id))}`;
    const linked = !!link?.ok;
    const t = (d: Date) => d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" });
    const { error } = await getResendClient().emails.send({
      from: "hello@goripple.io",
      to: ["keenan@heelerdigital.com", "jim@heelerdigital.com"],
      replyTo: "keenan@heelerdigital.com",
      subject: linked
        ? `Fixed automatically: duplicate Apple account linked to ${m.paid.email}`
        : `🚨 URGENT: paid customer stuck in a duplicate Apple account — ${m.paid.email} (${m.confidence})`,
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
          ${linked
            ? `<p style="margin:20px 0 8px;color:#15803d;font-weight:700;line-height:1.6;">Linked automatically ✓ (name match, Apple account within 2h of paying)</p>
          <p style="margin:0;color:#374151;line-height:1.6;">Sign in with Apple now opens the paid account. Next time they sign in with Apple (or tap the rescue link) they'll see their membership. Wrong person? Tell Claude to move the Apple sign-in back to ${m.dupe.email}.</p>`
            : `${link && !link.ok ? `<p style="margin:20px 0 8px;color:#b45309;line-height:1.6;">Tried to link automatically, but didn't: ${link.detail}</p>` : ""}
          <p style="margin:20px 0 8px;color:#374151;line-height:1.6;">If this is the same person, link the accounts so Sign in with Apple opens the paid one from now on:</p>
          <p style="margin:0 0 16px;"><a href="${linkUrl}" style="display:inline-block;background:#C4451C;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;">Link these accounts</a></p>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Only moves the Apple sign-in, only if the Apple account has no debriefs. Link works for 14 days. Not the same person? Ignore this; the rescue email is harmless.</p>`}
        </div>`,
    });
    if (error) throw new Error(`${error.name}: ${error.message}`);
  } catch (err) {
    console.error("[apple-dupe] founder alert failed:", err instanceof Error ? err.message : err);
  }
}
