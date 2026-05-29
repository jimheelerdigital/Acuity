import Constants from "expo-constants";

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
export const IAP_MONTHLY_PRODUCT_ID = "com.heelerdigital.acuity.pro.monthly";
export const IAP_ANNUAL_PRODUCT_ID = "com.heelerdigital.acuity.pro.annual";

export const IAP_ALL_PRODUCT_IDS = [
  IAP_MONTHLY_PRODUCT_ID,
  IAP_ANNUAL_PRODUCT_ID,
] as const;

export type IapProductId = (typeof IAP_ALL_PRODUCT_IDS)[number];

export function isIapProductId(value: string): value is IapProductId {
  return (IAP_ALL_PRODUCT_IDS as readonly string[]).includes(value);
}
