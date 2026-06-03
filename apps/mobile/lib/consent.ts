/**
 * Mobile consent helper (v1.4 GDPR slice). Writes to the append-only
 * `ConsentRecord` ledger via POST /api/consent/record so we can evidence
 * explicit consent under UK/EU GDPR Art. 7(1).
 *
 * Two surfaces use this:
 *   - onboarding Art. 9 special-category consent (special_category_processing)
 *   - IAP 14-day-withdrawal acknowledgement (distance_contract_immediate_performance)
 *
 * The exact wording shown on each surface lives here so the stored
 * `consentText` matches the screen verbatim. Bump the *_WORDING_VERSION
 * whenever the copy changes; the API also re-prompts on a version bump.
 */

import { api, appVersion, devicePlatform } from "@/lib/api";

export const POLICY_VERSION = "2026-06-03";

// ── Article 9 — special-category processing (onboarding) ──────────────
export const ART9_WORDING_VERSION = "art9-v1";
export const ART9_CONSENT_TEXT =
  "I understand my voice entries may contain special-category " +
  "information (such as health, religious or political beliefs, or " +
  "sexuality), and I explicitly consent to Acuity transcribing and " +
  "analysing that content to provide the service. I can withdraw this " +
  "consent at any time by deleting entries or my account.";

// ── 14-day withdrawal acknowledgement (checkout / IAP) ────────────────
export const WITHDRAWAL_WORDING_VERSION = "withdrawal-v1";
export const WITHDRAWAL_CONSENT_TEXT =
  "I want my paid Acuity features to start now, and I understand that " +
  "by starting immediately I lose my 14-day right to cancel for any " +
  "content fully delivered, and that if I cancel within 14 days I'll be " +
  "refunded less a proportionate amount for the service already provided.";

type RecordArgs = {
  consentType:
    | "special_category_processing"
    | "distance_contract_immediate_performance";
  granted: boolean;
  consentText: string;
  wordingVersion: string;
  plan?: "monthly" | "annual";
};

/**
 * Append a ConsentRecord. Throws on failure so callers can decide
 * whether to block (IAP, where the record evidences a paid contract) or
 * fail soft (onboarding, where trapping the user would be worse).
 */
export async function recordConsent(args: RecordArgs): Promise<void> {
  await api.post("/api/consent/record", {
    consentType: args.consentType,
    granted: args.granted,
    consentText: args.consentText,
    wordingVersion: args.wordingVersion,
    policyVersion: POLICY_VERSION,
    platform: devicePlatform,
    appVersion,
    plan: args.plan,
  });
}
