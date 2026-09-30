import { configureRevenueCat } from "@/lib/revenuecat";
import { rcFlags } from "@/lib/revenuecat/flags";

/**
 * RevenueCat Web → App: Redemption Links.
 *
 * A customer who buys on the web (a RevenueCat Funnel or Purchase Link,
 * checkout via RevenueCat Billing / Stripe) without an app account gets a
 * one-time link (60-min expiry) shaped like
 *
 *   rc-76f36e2f98://redeem_web_purchase?redemption_token=…
 *
 * Tapping it opens Ripple. We hand the URL to the RC SDK, which attaches
 * the web purchase to this install's RC App User ID:
 *   - signed in  → the purchase lands on the account now;
 *   - signed out → it lands on the anonymous RC id, and the normal
 *     sign-up/sign-in path (auth-context → Purchases.logIn(user.id))
 *     aliases it onto the account — the same purchase-before-account
 *     path the v10 onboarding paywall already relies on.
 *
 * The scheme is the one RevenueCat generated for the web config
 * "Ripple Web (RevenueCat Billing)" (app76f36e2f98). It must also be
 * registered in app.json (iOS CFBundleURLSchemes + Android intentFilters)
 * or the OS never delivers the link to the app.
 *
 * Flow: app/+native-intent.tsx sees every incoming URL first. A redemption
 * URL is queued here and swallowed (so expo-router never tries to route it
 * and shows "Unmatched route"); components/web-redemption-handler.tsx
 * drains the queue once auth has resolved and the SDK is configured.
 */
export const RC_WEB_REDEMPTION_SCHEME = "rc-76f36e2f98";
const REDEEM_PATH = "redeem_web_purchase";

let pendingUrl: string | null = null;
const seenUrls = new Set<string>();
const listeners = new Set<() => void>();

export function isWebRedemptionUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return (
    url.toLowerCase().startsWith(`${RC_WEB_REDEMPTION_SCHEME}://`) &&
    url.includes(REDEEM_PATH)
  );
}

/** Called from +native-intent. Tokens are single-use, so dedupe. */
export function queueWebRedemption(url: string): void {
  if (seenUrls.has(url)) return;
  seenUrls.add(url);
  pendingUrl = url;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      // A listener must never break link handling.
    }
  });
}

export function takePendingWebRedemption(): string | null {
  const url = pendingUrl;
  pendingUrl = null;
  return url;
}

export function onWebRedemptionQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type WebRedemptionOutcome =
  | { kind: "success" }
  | { kind: "belongs-to-other-user" }
  | { kind: "invalid-token" }
  | { kind: "expired"; obfuscatedEmail: string }
  | { kind: "error" }
  | { kind: "unavailable" };

/**
 * Redeem a queued link. Configures the SDK first (idempotent — returns the
 * cached result if the app-start configure already ran) so a cold-start
 * link can't race the SDK. Never throws.
 */
export async function redeemWebPurchaseUrl(
  url: string,
  appUserId: string | null
): Promise<WebRedemptionOutcome> {
  if (!rcFlags().RC_SDK_PURCHASES) return { kind: "unavailable" };
  const mode = await configureRevenueCat(appUserId);
  if (mode !== "configured-purchases" && mode !== "configured-observer") {
    return { kind: "unavailable" };
  }
  try {
    const mod = await import("react-native-purchases");
    const Purchases = mod.default;
    const { WebPurchaseRedemptionResultType } = mod;
    const redemption = await Purchases.parseAsWebPurchaseRedemption(url);
    if (!redemption) return { kind: "invalid-token" };
    const result = await Purchases.redeemWebPurchase(redemption);
    switch (result.result) {
      case WebPurchaseRedemptionResultType.SUCCESS:
        return { kind: "success" };
      case WebPurchaseRedemptionResultType.PURCHASE_BELONGS_TO_OTHER_USER:
        return { kind: "belongs-to-other-user" };
      case WebPurchaseRedemptionResultType.INVALID_TOKEN:
        return { kind: "invalid-token" };
      case WebPurchaseRedemptionResultType.EXPIRED:
        return { kind: "expired", obfuscatedEmail: result.obfuscatedEmail };
      default:
        return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}
