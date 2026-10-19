/**
 * RevenueCat Web Billing — browser side.
 *
 * Opens RevenueCat's checkout (purchases-js) for the signed-in user. The
 * server decides the offering (lib/revenuecat/web-billing.ts); this file only
 * loads the SDK, picks the monthly/annual package from that offering, runs
 * the purchase and asks the server to confirm it against RevenueCat.
 *
 * Switched on by NEXT_PUBLIC_RC_WEB_BILLING=1 + NEXT_PUBLIC_RC_WEB_BILLING_KEY
 * (the Web Billing app's PUBLIC key — rcb_… live, rcb_sb_… sandbox). With
 * either unset, every surface keeps its Stripe checkout, so turning this off
 * is an env change, not a deploy of different code.
 */

export type WebCheckoutSurface = "funnel" | "upgrade";
export type WebInterval = "monthly" | "yearly";

export type WebPurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "unauthorized" }
  | { status: "consent_required" }
  | { status: "error"; message: string };

export function isRcWebBillingEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_RC_WEB_BILLING === "1" &&
    !!process.env.NEXT_PUBLIC_RC_WEB_BILLING_KEY
  );
}

interface CheckoutConfig {
  appUserId: string;
  email: string | null;
  offeringId: string;
}

export interface StartWebPurchaseOptions {
  surface: WebCheckoutSurface;
  interval: WebInterval;
  /** Where RevenueCat renders its checkout. Omit for its full-page overlay. */
  htmlTarget?: HTMLElement;
  /** Called once the checkout is on screen (for "checkout started" events). */
  onCheckoutShown?: () => void;
}

export async function startRcWebPurchase(
  opts: StartWebPurchaseOptions
): Promise<WebPurchaseOutcome> {
  const apiKey = process.env.NEXT_PUBLIC_RC_WEB_BILLING_KEY;
  if (!apiKey) return { status: "error", message: "Checkout isn't configured." };

  // 1. Server-side config (user id, email, which offering).
  let config: CheckoutConfig;
  try {
    const res = await fetch(`/api/revenuecat/web-checkout?surface=${opts.surface}`, {
      cache: "no-store",
    });
    if (res.status === 401) return { status: "unauthorized" };
    if (res.status === 409) return { status: "consent_required" };
    if (!res.ok) return { status: "error", message: `Couldn't start checkout (${res.status}).` };
    config = (await res.json()) as CheckoutConfig;
  } catch {
    return { status: "error", message: "Couldn't reach checkout. Check your connection and try again." };
  }

  // 2. SDK — loaded only when someone actually checks out.
  let mod: typeof import("@revenuecat/purchases-js");
  try {
    mod = await import("@revenuecat/purchases-js");
  } catch {
    return { status: "error", message: "Couldn't load checkout. Try again in a moment." };
  }
  const { Purchases, PurchasesError, ErrorCode } = mod;

  try {
    let purchases: InstanceType<typeof Purchases>;
    if (Purchases.isConfigured()) {
      purchases = Purchases.getSharedInstance();
      if (purchases.getAppUserId() !== config.appUserId) {
        await purchases.changeUser(config.appUserId);
      }
    } else {
      purchases = Purchases.configure({ apiKey, appUserId: config.appUserId });
    }

    // 3. Package from the server-chosen offering.
    const offerings = await purchases.getOfferings({ offeringIdentifier: config.offeringId });
    const offering = offerings.all[config.offeringId] ?? null;
    const pkg = offering
      ? opts.interval === "yearly"
        ? offering.annual
        : offering.monthly
      : null;
    if (!pkg) {
      return { status: "error", message: "That plan isn't available right now. Try again in a moment." };
    }

    // 4. Purchase. purchases-js renders into htmlTarget (or its own overlay).
    opts.onCheckoutShown?.();
    await purchases.purchase({
      rcPackage: pkg,
      customerEmail: config.email ?? undefined,
      htmlTarget: opts.htmlTarget,
      skipSuccessPage: true,
      metadata: { surface: opts.surface },
    });
  } catch (e) {
    if (e instanceof PurchasesError && e.errorCode === ErrorCode.UserCancelledError) {
      return { status: "cancelled" };
    }
    return {
      status: "error",
      message: e instanceof Error && e.message ? e.message : "Checkout failed. Try again.",
    };
  }

  // 5. Confirm on the server against RevenueCat before calling it paid.
  try {
    const res = await fetch("/api/revenuecat/web-checkout/confirm", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { paid?: boolean };
    if (body.paid) return { status: "purchased" };
  } catch {
    // fall through
  }
  return {
    status: "error",
    message: "Your payment went through but we couldn't confirm it yet. Refresh in a minute — it'll show up.",
  };
}
