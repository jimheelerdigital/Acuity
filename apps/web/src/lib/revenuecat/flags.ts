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
}

export function rcCredentials(): RcCredentials {
  return {
    secretKey: process.env.RC_SECRET_KEY ?? null,
    webhookAuth: process.env.RC_WEBHOOK_AUTH ?? null,
    projectId: process.env.RC_PROJECT_ID ?? null,
  };
}
