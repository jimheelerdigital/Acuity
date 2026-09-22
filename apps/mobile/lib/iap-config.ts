import Constants from "expo-constants";
import { Platform } from "react-native";

import {
  DEFAULT_PRICING_CONFIG,
  allProductIds,
  pricingTierFor,
} from "@acuity/shared";

import { newPricingEnabled } from "./pricing";

/**
 * Compile-time gate for the iOS in-app purchase surface.
 *
 * Default: false (Phase 3a ships with IAP off in production builds).
 * Flip to true via app.json `extra.iapEnabled` OR via an EAS profile
 * override once SBP is enrolled, the IAP product is created in App
 * Store Connect, and the backend env vars are configured (per the
 * pre-launch readiness checklist in
 * docs/v1-1/iap-app-store-connect-setup.md §13.5).
 *
 * Why a build-time constant rather than a remote feature flag?
 * The mobile app has no feature-flag client today, and the IAP path
 * is a heavyweight surface (StoreKit init, sheet presentation, real
 * money flow). Operator-controlled-by-build is safer than runtime-
 * flipping while a user mid-flow could see inconsistent UI.
 *
 * Single source of truth — every UI surface that gates on IAP
 * availability calls `isIapEnabled()` rather than reading
 * Constants.expoConfig directly.
 *
 * The `Platform.OS === "ios"` check is layered on top by callers
 * — IAP is iOS-only at v1.1; Android remains web-only.
 */
export function isIapEnabled(): boolean {
  const extra = Constants.expoConfig?.extra as
    | { iapEnabled?: boolean }
    | undefined;
  return extra?.iapEnabled === true;
}

/**
 * Product IDs we offer at v1.2 launch (monthly + annual). Mirrors
 * `ALLOWED_PRODUCT_IDS` in apps/web/src/lib/apple-iap.ts — both must
 * update in lockstep, and the matching App Store Connect product
 * must exist before purchase will succeed end-to-end.
 *
 * Annual product price/discount is set in App Store Connect; the
 * client only knows the SKU. Default fallback strings in subscribe.tsx
 * exist only for the brief StoreKit-loading window.
 */
// Apple uses reverse-DNS product IDs; Google Play uses flat lowercase IDs.
// The ACTIVE pair (queried + purchased on THIS platform) resolves at runtime;
// IapProductId + isIapProductId accept all four so server-bound values
// typecheck + validate regardless of platform.
// ── Active tier → product ids ────────────────────────────────────────
// The tier a NEW prospect gets: V2 ($9.99/$89.99) when new pricing is on,
// LEGACY ($4.99/$39.99) otherwise. V2 uses SEPARATE product ids from
// LEGACY, so switching here NEVER reprices an existing subscriber's SKU —
// no Apple price-consent prompt / cancel risk for the grandfathered 17,
// whose active subscriptions are on the legacy ids and stay untouched.
// (Grandfathering a *lapsed* prior subscriber back to LEGACY would need a
// server-provided paidSince and is a future refinement; the active 17 are
// unaffected regardless.)
const ACTIVE_TIER = pricingTierFor(
  { paidSince: null, legacyUnknownStart: false },
  { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: newPricingEnabled() }
);

const PLATFORM: "apple" | "google" =
  Platform.OS === "android" ? "google" : "apple";

export const IAP_MONTHLY_PRODUCT_ID = ACTIVE_TIER.products.monthly[PLATFORM];
export const IAP_ANNUAL_PRODUCT_ID = ACTIVE_TIER.products.annual[PLATFORM];

export const IAP_ALL_PRODUCT_IDS = [
  IAP_MONTHLY_PRODUCT_ID,
  IAP_ANNUAL_PRODUCT_ID,
] as const;

// Any known SKU across BOTH tiers + platforms is a valid IapProductId: a
// receipt for either price must validate regardless of which tier the
// buyer purchased (legacy renewals AND new v2 purchases).
export type IapProductId = string;

const ALL_KNOWN_PRODUCT_IDS: readonly string[] = allProductIds();

export function isIapProductId(value: string): value is IapProductId {
  return ALL_KNOWN_PRODUCT_IDS.includes(value);
}
