import "server-only";

/**
 * Server-side adapter for the RC migration flags.
 *
 * The flag names, parsing rules and defaults live in @acuity/shared
 * (packages/shared/src/revenuecat.ts) so web and mobile cannot drift. This
 * file only supplies the env source for the Node/Vercel runtime.
 *
 * Read fresh on every call rather than cached at module load: Vercel keeps
 * a warm Lambda across requests, so caching would mean a flag change needs
 * a redeploy *and* a cold start to take effect. Billing flags must be
 * flippable predictably — the cost is three `process.env` reads.
 */

import {
  resolveRcFlags,
  type RcFlagKey,
  type RcFlags,
} from "@acuity/shared";

export function rcFlags(): RcFlags {
  return resolveRcFlags((key: RcFlagKey) => process.env[key]);
}

/** Convenience single-flag read. */
export function isRcFlagOn(key: RcFlagKey): boolean {
  return rcFlags()[key];
}

/**
 * RC API credentials, all optional until Jim provisions them.
 *
 * - RC_SECRET_KEY  : server-side secret (webhook verification is separate;
 *                    this one authenticates our REST calls TO RevenueCat —
 *                    the import script and the entitlement read path).
 * - RC_WEBHOOK_AUTH: the exact value RevenueCat sends in the
 *                    `Authorization` header of every webhook, configured in
 *                    the RC dashboard. Ours to choose.
 * - RC_PROJECT_ID  : RC project, used by some v2 API endpoints.
 *
 * Never throws on missing values — callers decide whether absence is fatal
 * (the import script) or a no-op (the webhook with the flag off).
 */
export interface RcCredentials {
  secretKey: string | null;
  webhookAuth: string | null;
  projectId: string | null;
  /**
   * PUBLIC app-specific key used for RC's CLIENT-FACING v1 endpoints.
   *
   * ⚠️ Non-obvious and easy to get wrong: `GET /v1/subscribers` — which is
   * how we read a customer's entitlement state — is one of the endpoints RC
   * classes as client-facing, alongside POST /receipts, POST /attributes,
   * POST /attribution and GET /offerings. Sending the `sk_` SECRET key to
   * any of them fails with HTTP 400 / code 7243 ("Secret API keys should
   * not be used in your app").
   *
   * Discovered 2026-08-19 when the receipt import hit 7243 on all 12 rows.
   * The same mistake was latent here and would have surfaced only when
   * RC_SOURCE_OF_TRUTH was flipped — i.e. at cutover, on live traffic.
   *
   * Any app's public key in the project works for a server-side read; we
   * prefer the Stripe/web app's since this code runs on the web server, and
   * fall back to the iOS key.
   */
  publicReadKey: string | null;
}

function firstNonEmpty(...vals: Array<string | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function rcCredentials(): RcCredentials {
  return {
    // Secret key: for genuinely server-side endpoints only (v2 reads,
    // entitlement grants). NOT for /subscribers or /receipts.
    secretKey: process.env.RC_SECRET_KEY ?? null,
    webhookAuth: process.env.RC_WEBHOOK_AUTH ?? null,
    projectId: process.env.RC_PROJECT_ID ?? null,
    publicReadKey: firstNonEmpty(
      process.env.RC_PUBLIC_KEY_STRIPE,
      process.env.RC_PUBLIC_KEY_IOS
    ),
  };
}
