/**
 * UK/EU 14-day-withdrawal acknowledgement for purchases made on a
 * RevenueCat Paywall.
 *
 * RevenueCat Paywalls run the purchase themselves, so the acknowledgement
 * can't be a tick-box that disables our own Subscribe button any more.
 * Instead RcPaywall intercepts the purchase (onPurchasePackageInitiated),
 * shows WithdrawalAckModal, and only lets the purchase continue once the
 * acknowledgement is captured here.
 *
 * Evidence is written twice:
 *   1. ConsentRecord via /api/consent/record (the ledger of record). That API
 *      needs a signed-in user, so for purchase-before-account (onboarding)
 *      the record is queued locally and flushed right after sign-in
 *      (flushPendingWithdrawalAck, called from auth-context).
 *   2. RevenueCat customer attributes withdrawal_ack_at / _version, which
 *      carry the exact client timestamp and follow the anonymous RC id when
 *      it's aliased to the real account.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { recordConsent } from "@/lib/consent";
import { syncRevenueCatAttributes } from "@/lib/revenuecat";

const PENDING_KEY = "ripple.pendingWithdrawalAck.v1";

export type AckPlan = "monthly" | "annual";

interface PendingAck {
  consentText: string;
  wordingVersion: string;
  plan: AckPlan | null;
  acknowledgedAt: string;
}

export function planForPackageType(packageType: string | undefined): AckPlan | null {
  if (packageType === "MONTHLY") return "monthly";
  if (packageType === "ANNUAL") return "annual";
  return null;
}

/**
 * Capture the acknowledgement. Throws if a signed-in user's ConsentRecord
 * can't be written — callers must then NOT continue the purchase (never take
 * money without the acknowledgement on file).
 */
export async function captureWithdrawalAck(args: {
  signedIn: boolean;
  consentText: string;
  wordingVersion: string;
  plan: AckPlan | null;
}): Promise<void> {
  const acknowledgedAt = new Date().toISOString();

  if (args.signedIn) {
    await recordConsent({
      consentType: "distance_contract_immediate_performance",
      granted: true,
      consentText: args.consentText,
      wordingVersion: args.wordingVersion,
      ...(args.plan ? { plan: args.plan } : {}),
    });
  } else {
    const pending: PendingAck = {
      consentText: args.consentText,
      wordingVersion: args.wordingVersion,
      plan: args.plan,
      acknowledgedAt,
    };
    // Local queue must succeed for an anonymous purchase to proceed.
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  }

  // Best-effort second copy on the RevenueCat customer.
  await syncRevenueCatAttributes({
    withdrawal_ack_at: acknowledgedAt,
    withdrawal_ack_version: args.wordingVersion,
  });
}

/** Write a queued (pre-account) acknowledgement once the user is signed in. */
export async function flushPendingWithdrawalAck(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    const p = JSON.parse(raw) as PendingAck;
    await recordConsent({
      consentType: "distance_contract_immediate_performance",
      granted: true,
      consentText: p.consentText,
      wordingVersion: p.wordingVersion,
      ...(p.plan ? { plan: p.plan } : {}),
    });
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch {
    // Leave it queued; the next sign-in / app start retries.
  }
}
