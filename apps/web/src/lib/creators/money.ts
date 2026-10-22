/**
 * Pure money + date rules for the creator ledger. No I/O — everything here
 * is unit-tested in creators.test.ts.
 */
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  COMMISSION_RATE,
  COMMISSION_WINDOW_MONTHS,
  HOLD_DAYS,
  MILESTONE_TIERS,
  PAYOUT_ANCHOR_FRIDAY,
} from "./config";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 25% of net revenue, rounded to the cent. Never negative. */
export function commissionFor(netRevenueCents: number): number {
  if (!Number.isFinite(netRevenueCents) || netRevenueCents <= 0) return 0;
  return Math.round(netRevenueCents * COMMISSION_RATE);
}

/** net = amount actually paid (already after discounts) minus tax. */
export function netRevenue(amountPaidCents: number, taxCents: number): number {
  return Math.max(0, amountPaidCents - Math.max(0, taxCents));
}

export function payableAt(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + HOLD_DAYS * DAY_MS);
}

/** firstPaidAt + 12 calendar months (UTC). */
export function windowEndFor(firstPaidAt: Date): Date {
  const d = new Date(firstPaidAt.getTime());
  d.setUTCMonth(d.getUTCMonth() + COMMISSION_WINDOW_MONTHS);
  return d;
}

/**
 * Does a payment at `occurredAt` earn commission? Inside the window means on
 * or before windowEnd; the first payment (no window yet) always counts.
 */
export function insideWindow(occurredAt: Date, windowEnd: Date | null): boolean {
  if (!windowEnd) return true;
  return occurredAt.getTime() <= windowEnd.getTime();
}

/**
 * Clawback for a (possibly partial) refund: the matching share of the
 * original commission, capped at what has not already been clawed back.
 * Returns a NEGATIVE number (or 0).
 */
export function clawbackFor(params: {
  commissionCents: number;
  paymentAmountCents: number;
  refundAmountCents: number;
  alreadyClawedCents: number;
}): number {
  const { commissionCents, paymentAmountCents, refundAmountCents, alreadyClawedCents } = params;
  if (commissionCents <= 0 || refundAmountCents <= 0) return 0;
  const share =
    paymentAmountCents > 0 ? Math.min(1, refundAmountCents / paymentAmountCents) : 1;
  const want = Math.round(commissionCents * share);
  const remaining = commissionCents - Math.abs(alreadyClawedCents);
  const amount = Math.max(0, Math.min(want, remaining));
  return amount === 0 ? 0 : -amount;
}

/** Milestone tiers a creator has reached for a month's customer count. */
export function milestonesReached(paidCustomers: number) {
  return MILESTONE_TIERS.filter((t) => paidCustomers >= t.customers);
}

/** "YYYY-MM" in UTC. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Payout schedule: every other Friday from the anchor ───────────────

function anchor(): Date {
  return new Date(`${PAYOUT_ANCHOR_FRIDAY}T00:00:00Z`);
}

/** Is `d` (UTC calendar date) a payout Friday? */
export function isPayoutFriday(d: Date): boolean {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const diff = Math.round((day - anchor().getTime()) / DAY_MS);
  return diff >= 0 && diff % 14 === 0;
}

/** The next payout Friday on or after `from` (UTC midnight). */
export function nextPayoutDate(from: Date = new Date()): Date {
  const day = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const a = anchor().getTime();
  if (day <= a) return new Date(a);
  const steps = Math.ceil((day - a) / (14 * DAY_MS));
  return new Date(a + steps * 14 * DAY_MS);
}

/**
 * The cutoff a run on payout Friday `runDate` covers: rows payable as of the
 * END of the Thursday before (i.e. before Friday 00:00 UTC).
 */
export function payoutCutoff(runDate: Date): Date {
  return new Date(Date.UTC(runDate.getUTCFullYear(), runDate.getUTCMonth(), runDate.getUTCDate()));
}

export function runKeyFor(runDate: Date): string {
  return payoutCutoff(runDate).toISOString().slice(0, 10);
}

// ── Referral codes ────────────────────────────────────────────────────

export function generateCreatorCode(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

/** Uppercase, strip anything outside the alphabet; null if not a valid shape. */
export function normalizeCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== CODE_LENGTH) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function firstNameOf(displayName: string | null | undefined, handle?: string | null): string {
  const n = (displayName ?? "").trim().split(/\s+/)[0];
  if (n && /[a-z]/i.test(n)) return n.replace(/[^\p{L}'-]/gu, "") || n;
  return handle ? `@${handle}` : "a creator";
}
