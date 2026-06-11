import Constants from "expo-constants";
import { Platform } from "react-native";

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
const IOS_MONTHLY_PRODUCT_ID = "com.heelerdigital.acuity.pro.monthly";
const IOS_ANNUAL_PRODUCT_ID = "com.heelerdigital.acuity.pro.annual";
const ANDROID_MONTHLY_PRODUCT_ID = "acuity_pro_monthly";
const ANDROID_ANNUAL_PRODUCT_ID = "acuity_pro_annual";

const IS_ANDROID = Platform.OS === "android";

export const IAP_MONTHLY_PRODUCT_ID = IS_ANDROID
  ? ANDROID_MONTHLY_PRODUCT_ID
  : IOS_MONTHLY_PRODUCT_ID;
export const IAP_ANNUAL_PRODUCT_ID = IS_ANDROID
  ? ANDROID_ANNUAL_PRODUCT_ID
  : IOS_ANNUAL_PRODUCT_ID;

export const IAP_ALL_PRODUCT_IDS = [
  IAP_MONTHLY_PRODUCT_ID,
  IAP_ANNUAL_PRODUCT_ID,
] as const;

export type IapProductId =
  | typeof IOS_MONTHLY_PRODUCT_ID
  | typeof IOS_ANNUAL_PRODUCT_ID
  | typeof ANDROID_MONTHLY_PRODUCT_ID
  | typeof ANDROID_ANNUAL_PRODUCT_ID;

const ALL_KNOWN_PRODUCT_IDS: readonly string[] = [
  IOS_MONTHLY_PRODUCT_ID,
  IOS_ANNUAL_PRODUCT_ID,
  ANDROID_MONTHLY_PRODUCT_ID,
  ANDROID_ANNUAL_PRODUCT_ID,
];

export function isIapProductId(value: string): value is IapProductId {
  return ALL_KNOWN_PRODUCT_IDS.includes(value);
}
