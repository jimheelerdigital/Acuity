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
 * The single product ID we offer at v1.1 launch.
 * Mirrors `ALLOWED_PRODUCT_IDS` in apps/web/src/lib/apple-iap.ts —
 * if you add a new product, both must update in lockstep.
 */
export const IAP_MONTHLY_PRODUCT_ID = "com.heelerdigital.acuity.pro.monthly";
