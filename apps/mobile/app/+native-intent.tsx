import {
  isWebRedemptionUrl,
  queueWebRedemption,
} from "@/lib/revenuecat/web-redemption";

/**
 * Every URL the OS hands the app passes through here before expo-router
 * resolves it (see expo-router NativeIntent).
 *
 * Only RevenueCat web-purchase Redemption Links are intercepted: they are
 * queued for components/web-redemption-handler.tsx and swallowed so the
 * router never tries to match `redeem_web_purchase` as a screen.
 *   - cold start (initial): land on "/" — AuthGate routes from there.
 *   - warm (app already open): return "" so the router does NOT navigate;
 *     the user stays where they are while the purchase is redeemed.
 *
 * Every other URL (acuity://, Google OAuth, universal links) is returned
 * unchanged — identical to having no +native-intent at all.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    if (isWebRedemptionUrl(path)) {
      queueWebRedemption(path);
      return initial ? "/" : "";
    }
  } catch {
    // Never let link parsing crash app start.
  }
  return path;
}
