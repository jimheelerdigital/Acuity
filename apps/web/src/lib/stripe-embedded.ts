/**
 * Stripe Embedded Checkout on the funnel paywalls (2026-09-24 on
 * /start-test; 2026-09-25 on /start and /start-bwk too, per Keenan: "embed
 * the stripe… instead of it being a redirect"). Funnels only: the in-app
 * /upgrade page keeps its hosted redirect on purpose (Keenan, same day).
 *
 * The server side is /api/onboarding/create-checkout with `embedded: true`,
 * which returns a client secret (ui_mode "embedded") instead of a redirect
 * URL. After payment Stripe sends the whole page to the same
 * `<funnel>?step=download&payment=success&session_id=…` return URL the hosted
 * checkout used, so the success handling is unchanged. If Stripe.js or the
 * session can't load, callers fall back to the hosted redirect.
 */

type EmbeddedInstance = { mount: (el: HTMLElement | string) => void; destroy: () => void };

declare global {
  interface Window {
    Stripe?: (pk: string) => {
      initEmbeddedCheckout: (opts: { fetchClientSecret: () => Promise<string> }) => Promise<EmbeddedInstance>;
    };
  }
}

export function loadStripeJs(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Stripe) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://js.stripe.com/v3"]');
    const s = existing ?? document.createElement("script");
    s.src = "https://js.stripe.com/v3";
    s.async = true;
    s.onload = () => resolve(!!window.Stripe);
    s.onerror = () => resolve(false);
    if (!existing) document.head.appendChild(s);
    setTimeout(() => resolve(!!window.Stripe), 8000);
  });
}

/**
 * Mount Embedded Checkout into `el`. `endpoint` must return { clientSecret }
 * for the POSTed `body` plus `embedded: true` (the funnels use
 * /api/onboarding/create-checkout with { interval, funnel }). Resolves with the instance (call
 * destroy() on unmount). Throws "unauthorized" when the session has ended, or
 * another Error when embedding isn't possible, so the caller can fall back to
 * the hosted redirect.
 */
export async function mountEmbeddedCheckout(el: HTMLElement, endpoint: string, body: Record<string, unknown>): Promise<EmbeddedInstance> {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!pk) throw new Error("no_publishable_key");
  if (!(await loadStripeJs()) || !window.Stripe) throw new Error("stripe_js_unavailable");
  const stripe = window.Stripe(pk);
  const checkout = await stripe.initEmbeddedCheckout({
    fetchClientSecret: async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, embedded: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string };
      if (!data.clientSecret) throw new Error(res.status === 401 ? "unauthorized" : data.error ?? "No client secret");
      return data.clientSecret;
    },
  });
  checkout.mount(el);
  return checkout;
}
