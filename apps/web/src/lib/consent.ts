/**
 * Consent ledger — shared constants + write helper for the v1.4 GDPR
 * slice. Backs the append-only `ConsentRecord` table.
 *
 * Two consent surfaces write here today:
 *   - special_category_processing            (Art. 9(2)(a), mobile onboarding)
 *   - distance_contract_immediate_performance (Consumer Contracts Regs 2013
 *     Reg. 36–37 / EU Dir. 2011/83 Art. 16(m), checkout / IAP)
 *
 * Append-only: a withdrawal/decline is a NEW row with granted=false; we
 * never update or delete a prior grant. "Current state" for a
 * (userId, consentType) pair = the latest row by createdAt.
 */

export const CONSENT_TYPES = [
  "special_category_processing",
  "distance_contract_immediate_performance",
  "marketing",
  "cookies",
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_PLATFORMS = ["ios", "android", "web"] as const;
export type ConsentPlatform = (typeof CONSENT_PLATFORMS)[number];

/**
 * Privacy/Terms version in effect. Bump alongside the LAST_UPDATED date
 * on /privacy and /terms whenever consent-relevant wording changes — and
 * re-prompt for fresh consent if the underlying processing changes.
 */
export const CURRENT_POLICY_VERSION = "2026-06-03";

/** Wording version tags for each consent surface. Bump on copy change. */
export const WORDING_VERSIONS = {
  special_category_processing: "art9-v1",
  distance_contract_immediate_performance: "withdrawal-v1",
} as const;

/**
 * Canonical web-side wording. Mobile ships its own copy and sends the
 * exact text it displayed; both are stored verbatim in `consentText`.
 */
export const CONSENT_WORDING = {
  distance_contract_immediate_performance:
    "I want my paid Acuity features to start now, and I understand that " +
    "by starting immediately I lose my 14-day right to cancel for any " +
    "content fully delivered, and that if I cancel within 14 days I'll be " +
    "refunded less a proportionate amount for the service already provided.",
} as const;

/**
 * How recent a grant must be to gate a checkout attempt. Ties the stored
 * acknowledgement to the purchase the user is making right now rather
 * than reusing a stale grant from a previous, abandoned session.
 */
export const CONSENT_GATE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

type WriteConsentArgs = {
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  consentText: string;
  wordingVersion: string;
  platform: ConsentPlatform;
  policyVersion?: string;
  appVersion?: string | null;
  plan?: string | null;
  region?: string | null;
};

/**
 * Append a ConsentRecord. Always inserts — never updates — to preserve
 * the immutable audit trail.
 */
export async function writeConsentRecord(args: WriteConsentArgs) {
  const { prisma } = await import("@/lib/prisma");
  return prisma.consentRecord.create({
    data: {
      userId: args.userId,
      consentType: args.consentType,
      granted: args.granted,
      consentText: args.consentText,
      wordingVersion: args.wordingVersion,
      policyVersion: args.policyVersion ?? CURRENT_POLICY_VERSION,
      platform: args.platform,
      appVersion: args.appVersion ?? null,
      plan: args.plan ?? null,
      region: args.region ?? null,
    },
  });
}

/**
 * True if the user has a `granted=true` row of the given type within the
 * recency window. Used to gate checkout on a fresh acknowledgement.
 */
export async function hasRecentGrant(
  userId: string,
  consentType: ConsentType,
  windowMs: number = CONSENT_GATE_WINDOW_MS
): Promise<boolean> {
  const { prisma } = await import("@/lib/prisma");
  const latest = await prisma.consentRecord.findFirst({
    where: { userId, consentType },
    orderBy: { createdAt: "desc" },
    select: { granted: true, createdAt: true },
  });
  if (!latest || !latest.granted) return false;
  return Date.now() - latest.createdAt.getTime() <= windowMs;
}
