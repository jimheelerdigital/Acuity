import { DEFAULT_PRICING_CONFIG } from "@acuity/shared";
import { isNewPricingEnabled } from "@/lib/feature-flags";
import { getProOffering, type RcOfferingPackages } from "@/lib/revenuecat";

/**
 * Fetch the paywall's RevenueCat offering ahead of time.
 *
 * The paywall used to start its store request only when it opened, on top
 * of the account set-up — ~5s from entering the sign-up code to seeing
 * prices (Keenan, build 173). Started from the results screen instead, it
 * is usually ready before she gets there. A failed fetch is not cached, so
 * the paywall's own "Try again" really retries.
 */
let pending: Promise<RcOfferingPackages | null> | null = null;

export function prefetchOffering(): Promise<RcOfferingPackages | null> {
  if (!pending) {
    pending = getProOffering(
      { paidSince: null },
      { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: isNewPricingEnabled() }
    )
      .then((o) => {
        if (!o || !(o.annual || o.monthly)) pending = null;
        return o;
      })
      .catch(() => {
        pending = null;
        return null;
      });
  }
  return pending;
}

/** Drop the cache (after a failure) so the next call goes to the store. */
export function resetOfferingCache(): void {
  pending = null;
}
