/**
 * Meta match keys carried through Stripe Checkout (2026-10-19, per Keenan:
 * Purchase event match quality was 5.0/10).
 *
 * The Purchase is reported to Meta from the Stripe webhook, where there's no
 * browser: no IP, user agent or _fbp/_fbc cookies, so Meta could only match
 * on hashed email. checkoutMatchMetadata() captures those keys while the
 * buyer is still in the browser (checkout creation) and stores them on the
 * Checkout Session's metadata; matchKeysFromSession() reads them back in the
 * webhook.
 *
 * Never blocks a payment: capture failures return {}, and every value fits
 * Stripe's metadata limits (key ≤ 40 chars, value ≤ 500 chars).
 */
import type { NextRequest } from "next/server";

import { extractFbCookies, getClientIp } from "@/lib/meta-capi";

const MAX = 480;

const KEYS = { ip: "meta_ip", ua: "meta_ua", fbp: "meta_fbp", fbc: "meta_fbc", country: "meta_country" } as const;

const clip = (v: string | null | undefined) => (v ? v.slice(0, MAX) : undefined);

/** Metadata entries to spread into a Checkout Session's `metadata`. */
export function checkoutMatchMetadata(req: NextRequest): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    const ip = clip(getClientIp(req.headers));
    const ua = clip(req.headers.get("user-agent"));
    const { fbp, fbc } = extractFbCookies(req.headers.get("cookie"));
    const country = req.headers.get("x-vercel-ip-country");
    if (ip) out[KEYS.ip] = ip;
    if (ua) out[KEYS.ua] = ua;
    if (fbp) out[KEYS.fbp] = clip(fbp)!;
    if (fbc) out[KEYS.fbc] = clip(fbc)!;
    if (country && /^[A-Za-z]{2}$/.test(country)) out[KEYS.country] = country.toLowerCase();
    return out;
  } catch {
    return {};
  }
}

/** Match keys for the CAPI Purchase, from a completed Checkout Session. */
export function matchKeysFromSession(session: {
  metadata?: Record<string, string> | null;
  customer_details?: { name?: string | null; address?: { country?: string | null; postal_code?: string | null } | null } | null;
}): { ip?: string; userAgent?: string; fbp?: string; fbc?: string; country?: string; zip?: string; firstName?: string; lastName?: string } {
  const m = session.metadata ?? {};
  const addr = session.customer_details?.address;
  const name = session.customer_details?.name?.trim() ?? "";
  const [first, ...rest] = name ? name.split(/\s+/) : [];
  return {
    ip: m[KEYS.ip] || undefined,
    userAgent: m[KEYS.ua] || undefined,
    fbp: m[KEYS.fbp] || undefined,
    fbc: m[KEYS.fbc] || undefined,
    // Card country / ZIP from Stripe beat the IP country when present.
    country: addr?.country?.toLowerCase() || m[KEYS.country] || undefined,
    zip: addr?.postal_code || undefined,
    firstName: first || undefined,
    lastName: rest.length ? rest[rest.length - 1] : undefined,
  };
}
