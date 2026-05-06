/**
 * Mobile-side StoreKit 2 wrapper — TEMPORARILY STUBBED.
 *
 * 2026-05-05: react-native-iap removed from package.json + app.json
 * plugins to unblock the OAuth-fix EAS build. The package's
 * RNIap.podspec declares an explicit `RCT-Folly` dependency that's
 * incompatible with Expo SDK 54's prebuilt React Native pattern,
 * causing `pod install` to fail with:
 *
 *   Unable to find a specification for `RCT-Folly` depended upon by `RNIap`
 *
 * Documented workarounds (deferred — try in a follow-up slice when
 * we have time + EAS credits to iterate):
 *   1. Add `with-folly-no-coroutines: true` to the react-native-iap
 *      plugin options in app.json. Documented at
 *      https://hyochan.github.io/react-native-iap/docs/installation/
 *   2. Migrate to expo-iap (https://hyochan.github.io/expo-iap/),
 *      same author, Expo Module API, designed for SDK 54+. API differs
 *      slightly from react-native-iap; this wrapper would need updating.
 *
 * Production impact of this stub: ZERO. The IAP code path is gated
 * behind `isIapEnabled()` which returns false in production
 * (`extra.iapEnabled: false` in app.json). All wrapper functions
 * return their flag-off / no-product / unavailable states. The
 * Subscribe sheet, Profile menu's "Subscribe" item, Paywall's
 * "Subscribe in app" CTA, and the dual-CTA on locked cards all
 * self-hide or render the "Continue on web" fallback path.
 *
 * When react-native-iap is re-enabled (or replaced with expo-iap):
 *   1. Restore the dependency in package.json.
 *   2. Re-add the config plugin to app.json (or its replacement).
 *   3. Restore the `import("react-native-iap")` body of this file
 *      (recoverable from git history at commit 9aec449).
 *   4. Verify locally via `expo prebuild` + `pod install` BEFORE
 *      kicking an EAS build.
 */

import { Platform } from "react-native";

import {
  classifyVerifyResponse,
  type PurchaseErrorKind,
  type RestoreOutcome,
  type VerifyReceiptOutcome,
} from "@acuity/shared";

import { api } from "@/lib/api";
import { IAP_MONTHLY_PRODUCT_ID, isIapEnabled } from "@/lib/iap-config";

// Public surface preserved so call sites in subscribe.tsx,
// restore-purchases-button.tsx, and pro-locked-card.tsx still
// typecheck unchanged. Every function short-circuits to a
// flag-off / unavailable response.

void classifyVerifyResponse;
void api;
void IAP_MONTHLY_PRODUCT_ID;

export interface IapProduct {
  productId: string;
  title: string;
  description: string;
  localizedPrice: string;
  currency: string;
}

export type PurchaseResult =
  | { kind: "success"; transactionId: string; receipt: string }
  | { kind: "error"; errorKind: PurchaseErrorKind; message: string | null };

export type PurchaseUpdateListener = (purchase: {
  transactionId: string;
  receipt: string;
}) => void;

export async function initIap(): Promise<boolean> {
  // Stubbed — no native module to connect to.
  void Platform;
  void isIapEnabled;
  return false;
}

export async function disconnectIap(): Promise<void> {
  // Stubbed — nothing to disconnect.
}

export async function getMonthlyProduct(): Promise<IapProduct | null> {
  // Stubbed — no products are fetchable without the native module.
  return null;
}

export async function purchaseMonthly(): Promise<PurchaseResult> {
  // Stubbed — purchases are unreachable. The Subscribe sheet's
  // flag-off fallback (UnavailableScreen) ensures users hit the
  // "Continue on web" path instead of this function.
  return {
    kind: "error",
    errorKind: "store-unknown",
    message: "In-app purchases unavailable",
  };
}

export async function verifyAndFinish(_input: {
  transactionId: string;
  receipt: string;
}): Promise<VerifyReceiptOutcome> {
  void _input;
  return {
    kind: "transient-error",
    message: "In-app purchases unavailable",
    retryable: false,
  };
}

export async function restorePurchases(): Promise<RestoreOutcome> {
  // The RestorePurchasesButton component already self-hides when
  // !isIapEnabled(); this stub is a belt-and-suspenders fallback.
  return { kind: "error", message: "In-app purchases unavailable" };
}

export async function subscribeToPurchaseUpdates(
  _listener: PurchaseUpdateListener
): Promise<() => void> {
  void _listener;
  return () => {};
}
