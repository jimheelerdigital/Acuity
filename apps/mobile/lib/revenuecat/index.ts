import { Platform } from "react-native";

import {
  RC_ENTITLEMENT_PRO,
  RC_PACKAGES,
  offeringIdForTier,
  pricingTierFor,
  type PricingConfig,
} from "@acuity/shared";

import { rcApiKeyFor, rcFlags } from "@/lib/revenuecat/flags";

/**
 * RevenueCat client wrapper — observer mode first, purchases later.
 *
 * ── Why every entry point is a no-op by default ──────────────────────
 * `react-native-purchases` is imported LAZILY, inside the functions, never
 * at module scope. Two reasons, both load-bearing:
 *
 *   1. Importing it pulls in the native module. Any build that predates the
 *      dependency (every binary currently in the App Store, and Expo Go)
 *      would throw on import. A lazy import means this file is completely
 *      safe to ship in a build where nothing turns the flags on.
 *   2. It makes "does nothing live" verifiable rather than aspirational:
 *      with the flags off, `Purchases` is never even loaded, so there is no
 *      network call, no keychain write, and no StoreKit observation.
 *
 * ── The three modes ──────────────────────────────────────────────────
 *   flags all off              → configureRevenueCat() returns "disabled".
 *                                Nothing happens. Today's state.
 *   RC_OBSERVER on             → SDK configured with
 *                                purchasesAreCompletedBy: MY_APP. RC watches
 *                                the transactions react-native-iap makes and
 *                                populates its own backend. Our own IAP flow
 *                                is untouched and still authoritative.
 *   RC_SDK_PURCHASES on        → SDK configured with
 *                                purchasesAreCompletedBy: REVENUECAT and
 *                                purchases go through purchaseProPackage().
 *
 * NEVER enable RC_SDK_PURCHASES before RC_SOURCE_OF_TRUTH: a purchase would
 * succeed at the store with nothing on our side writing the entitlement.
 * `configureRevenueCat` logs a loud warning if it sees that combination.
 */

// ─── Lazy module handle ──────────────────────────────────────────────

type PurchasesModule = typeof import("react-native-purchases");

let purchasesModule: PurchasesModule | null = null;

async function loadPurchases(): Promise<PurchasesModule | null> {
  if (purchasesModule) return purchasesModule;
  try {
    purchasesModule = await import("react-native-purchases");
    return purchasesModule;
  } catch (err) {
    // Native module missing (old binary / Expo Go). Never throw upward —
    // billing observation must not be able to crash the app.
    log("native module unavailable", err);
    return null;
  }
}

function log(message: string, extra?: unknown) {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[revenuecat] ${message}`, extra ?? "");
  }
}

// ─── Configure ───────────────────────────────────────────────────────

export type RcConfigureResult =
  | "disabled"
  | "no-key"
  | "unavailable"
  | "configured-observer"
  | "configured-purchases"
  | "error";

let configured = false;

/**
 * Configure the RC SDK. Idempotent — safe to call on every app start.
 *
 * @param appUserId Our `User.id` when a session already exists. Passing it
 *   at configure time avoids a brief anonymous-id window. When null, RC
 *   generates an anonymous id and `identifyRevenueCatUser` aliases it later
 *   (that alias is what makes "pay before account, claim after" work).
 */
export async function configureRevenueCat(
  appUserId: string | null = null
): Promise<RcConfigureResult> {
  const flags = rcFlags();

  if (!flags.RC_OBSERVER && !flags.RC_SDK_PURCHASES) {
    return "disabled";
  }

  if (flags.RC_SDK_PURCHASES && !flags.RC_SOURCE_OF_TRUTH) {
    // Misconfiguration that would take real money and grant no access.
    // eslint-disable-next-line no-console
    console.warn(
      "[revenuecat] RC_SDK_PURCHASES is on but RC_SOURCE_OF_TRUTH is off — " +
        "purchases would complete at the store with nothing writing the " +
        "entitlement. Turn on RC_SOURCE_OF_TRUTH first."
    );
  }

  const platform = Platform.OS === "android" ? "android" : "ios";
  const apiKey = rcApiKeyFor(platform);
  if (!apiKey) {
    log(`no API key for ${platform} — skipping configure`);
    return "no-key";
  }

  const mod = await loadPurchases();
  if (!mod) return "unavailable";

  const Purchases = mod.default;
  const { LOG_LEVEL, PURCHASES_ARE_COMPLETED_BY_TYPE, STOREKIT_VERSION } = mod;

  try {
    if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

    if (flags.RC_SDK_PURCHASES) {
      // RC completes purchases and acknowledges them itself.
      Purchases.configure({
        apiKey,
        appUserID: appUserId,
        purchasesAreCompletedBy: PURCHASES_ARE_COMPLETED_BY_TYPE.REVENUECAT,
      });
      configured = true;
      log("configured — RC completes purchases");
      return "configured-purchases";
    }

    // OBSERVER MODE. `storeKitVersion` is REQUIRED when
    // purchasesAreCompletedBy is MY_APP, and it must match what our existing
    // purchase library actually uses or RC will mis-parse transactions.
    //
    // ⚠️ VERIFY BEFORE ENABLING: this must match react-native-iap@15's
    // StoreKit version on iOS. Overridable via
    // EXPO_PUBLIC_RC_STOREKIT_VERSION so it can be corrected without a code
    // change. See docs/REVENUECAT_MIGRATION.md §"Decisions needed".
    const skOverride = process.env.EXPO_PUBLIC_RC_STOREKIT_VERSION;
    const storeKitVersion =
      skOverride === "STOREKIT_1"
        ? STOREKIT_VERSION.STOREKIT_1
        : STOREKIT_VERSION.STOREKIT_2;

    Purchases.configure({
      apiKey,
      appUserID: appUserId,
      purchasesAreCompletedBy: {
        type: PURCHASES_ARE_COMPLETED_BY_TYPE.MY_APP,
        storeKitVersion,
      },
    });
    configured = true;
    log("configured — observer mode (our app completes purchases)");
    return "configured-observer";
  } catch (err) {
    // Never let a billing-observation failure break app start.
    log("configure failed", err);
    return "error";
  }
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

// ─── Identity: the anonymous-id → userId alias ───────────────────────

/**
 * Alias RC's current (possibly anonymous) app user id to our `User.id`.
 *
 * CALL THIS AT ACCOUNT CREATION AND AT EVERY SIGN-IN.
 *
 * This single call is what makes two otherwise-broken flows work:
 *
 *  1. **Pay before account, claim later.** A user can purchase while still
 *     anonymous; RC records the purchase against an anonymous id. When they
 *     then create an account, `logIn(user.id)` ALIASES the anonymous id to
 *     the real one and the entitlement transfers. Without the alias the
 *     purchase is stranded on an id nothing will ever look up again.
 *
 *  2. **The returning multi-provider user (our Tessa-class bug).** A user
 *     who previously subscribed on one provider and signs back in via a
 *     different auth path currently lands on a NEW account with no
 *     entitlement, because the subscription was keyed to provider-specific
 *     identifiers (appleOriginalTransactionId / stripeCustomerId) rather
 *     than to a stable app-level id. Once RC is the source of truth and
 *     every client calls logIn(user.id), the entitlement follows the
 *     app-level id across providers and platforms.
 *
 * Returns whether RC considered this a newly-created customer, which is
 * useful telemetry: `created: false` on a brand-new account means we
 * successfully claimed a pre-existing (anonymous or cross-device) purchase.
 */
export async function identifyRevenueCatUser(
  userId: string
): Promise<{ ok: boolean; created: boolean; hasPro: boolean }> {
  if (!configured) return { ok: false, created: false, hasPro: false };
  const mod = await loadPurchases();
  if (!mod) return { ok: false, created: false, hasPro: false };

  try {
    const { customerInfo, created } = await mod.default.logIn(userId);
    const hasPro = Boolean(customerInfo.entitlements.active[RC_ENTITLEMENT_PRO]);
    log(`logIn(${userId}) created=${created} hasPro=${hasPro}`);
    return { ok: true, created, hasPro };
  } catch (err) {
    log("logIn failed", err);
    return { ok: false, created: false, hasPro: false };
  }
}

/**
 * Clear the RC identity on sign-out, returning the SDK to an anonymous id.
 *
 * Important on shared devices: without this, the next user to sign in would
 * inherit the previous user's RC identity until their own logIn lands.
 */
export async function logOutRevenueCatUser(): Promise<void> {
  if (!configured) return;
  const mod = await loadPurchases();
  if (!mod) return;
  try {
    await mod.default.logOut();
    log("logOut");
  } catch (err) {
    // logOut throws if the current user is already anonymous — harmless.
    log("logOut failed (likely already anonymous)", err);
  }
}

// ─── Reading entitlement ─────────────────────────────────────────────

/**
 * Does RC currently grant the `pro` entitlement?
 *
 * NOTE: while RC_SOURCE_OF_TRUTH is off this is for OBSERVATION ONLY — the
 * app must keep gating on the server's `subscriptionStatus`. Using this as
 * the gate before cutover would make the client and server disagree.
 */
export async function hasProEntitlement(): Promise<boolean | null> {
  if (!configured) return null;
  const mod = await loadPurchases();
  if (!mod) return null;
  try {
    const info = await mod.default.getCustomerInfo();
    return Boolean(info.entitlements.active[RC_ENTITLEMENT_PRO]);
  } catch (err) {
    log("getCustomerInfo failed", err);
    return null;
  }
}

// ─── Purchase flow (behind RC_SDK_PURCHASES) ─────────────────────────

export interface RcOfferingPackages {
  offeringId: string;
  monthly: unknown | null;
  annual: unknown | null;
  /** Store-localized price strings, for paywall display. */
  monthlyPrice: string | null;
  annualPrice: string | null;
}

/**
 * Fetch the offering this user should see.
 *
 * The offering is chosen from the user's PRICING TIER, so a grandfathered
 * subscriber is shown legacy pricing and everyone else the current one —
 * the paywall never has to know grandfathering exists.
 *
 * Falls back to RC's `current` offering when the tier-specific offering
 * isn't configured in the dashboard yet, which is what lets this compile and
 * run before the real offerings exist.
 */
export async function getProOffering(
  grandfather: Parameters<typeof pricingTierFor>[0] = { paidSince: null },
  pricingConfig?: PricingConfig
): Promise<RcOfferingPackages | null> {
  if (!rcFlags().RC_SDK_PURCHASES) return null;
  const mod = await loadPurchases();
  if (!mod) return null;

  try {
    const tier = pricingTierFor(grandfather, pricingConfig);
    const wantedId = offeringIdForTier(tier);
    const offerings = await mod.default.getOfferings();
    const offering = offerings.all[wantedId] ?? offerings.current;
    if (!offering) {
      log(`no offering found for id=${wantedId} and no current offering`);
      return null;
    }

    const findPkg = (identifier: string) =>
      offering.availablePackages.find((p) => p.identifier === identifier) ?? null;

    const monthly = findPkg(RC_PACKAGES.monthly);
    const annual = findPkg(RC_PACKAGES.annual);

    return {
      offeringId: offering.identifier,
      monthly,
      annual,
      monthlyPrice: monthly?.product.priceString ?? null,
      annualPrice: annual?.product.priceString ?? null,
    };
  } catch (err) {
    log("getOfferings failed", err);
    return null;
  }
}

export type RcPurchaseResult =
  | { status: "disabled" }
  | { status: "success"; hasPro: boolean; productId: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/**
 * Purchase a package and report whether `pro` is now active.
 *
 * A user-cancelled purchase is a FIRST-CLASS RESULT, not an error: RC
 * signals it via `userCancelled` on the thrown error, and treating it as a
 * failure is how paywalls end up showing "something went wrong" to someone
 * who simply tapped Cancel.
 */
export async function purchaseProPackage(
  pkg: unknown
): Promise<RcPurchaseResult> {
  if (!rcFlags().RC_SDK_PURCHASES) return { status: "disabled" };
  const mod = await loadPurchases();
  if (!mod) return { status: "error", message: "RevenueCat unavailable" };

  try {
    const result = await mod.default.purchasePackage(
      pkg as Parameters<typeof mod.default.purchasePackage>[0]
    );
    const hasPro = Boolean(
      result.customerInfo.entitlements.active[RC_ENTITLEMENT_PRO]
    );
    return {
      status: "success",
      hasPro,
      productId: result.productIdentifier,
    };
  } catch (err) {
    const e = err as { userCancelled?: boolean; message?: string };
    if (e?.userCancelled) return { status: "cancelled" };
    log("purchasePackage failed", err);
    return { status: "error", message: e?.message ?? "Purchase failed" };
  }
}

/**
 * Restore purchases — required by App Store review for any app with IAP.
 * Returns whether `pro` is active after the restore.
 */
export async function restoreProPurchases(): Promise<boolean | null> {
  if (!rcFlags().RC_SDK_PURCHASES) return null;
  const mod = await loadPurchases();
  if (!mod) return null;
  try {
    const info = await mod.default.restorePurchases();
    return Boolean(info.entitlements.active[RC_ENTITLEMENT_PRO]);
  } catch (err) {
    log("restorePurchases failed", err);
    return null;
  }
}
