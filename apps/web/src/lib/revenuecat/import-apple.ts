import "server-only";

/**
 * Import an Apple purchase into RevenueCat under our User.id.
 *
 * Why this exists (2026-10-16): app builds before 1.9 buy through
 * StoreKit directly and confirm via /api/iap/verify-receipt — the
 * RevenueCat SDK never sees those purchases. RevenueCat is the source of
 * truth for Apple entitlement (RC_SOURCE_OF_TRUTH; the resolver trusts RC's
 * FREE for store sources on purpose), so a paying customer on an old build
 * resolved as FREE. The rc-parity gate caught two (both app 1.6.0,
 * monthly.v2, bought 2026-10-04 / 10-06). RC's S2S "track new purchases"
 * doesn't help: it can't know our User.id, so it files them under an
 * anonymous customer.
 *
 * POST /v1/receipts with `fetch_token` = the StoreKit 2 JWSTransaction we
 * already store (appleSignedTransactionJws) — RC docs: "For iOS, the base64
 * encoded receipt file (or JWSTransaction for StoreKit2)". RC then reads the
 * full subscription from Apple (renewals included) and attaches it to
 * `app_user_id`. Idempotent on RC's side per (app_user_id, transaction).
 *
 * PUBLIC iOS key (appl_…), not the secret: /receipts is a client-facing
 * endpoint and rejects sk_ keys with 7243 — same as scripts/rc-import-receipts.ts.
 *
 * Never throws: callers are a purchase-confirm path and an admin backfill;
 * an RC hiccup must not fail either.
 */

import { RC_ENTITLEMENT_PRO } from "@acuity/shared";

const RC_RECEIPTS_URL = "https://api.revenuecat.com/v1/receipts";

export type RcImportResult =
  | { ok: true; hasPro: boolean }
  | { ok: false; code: "NO_CREDENTIALS" | "NO_TOKEN" | "HTTP_ERROR" | "BAD_BODY"; detail: string };

export async function importAppleTransactionToRc(
  args: { userId: string; signedTransactionJws: string | null | undefined },
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env
): Promise<RcImportResult> {
  const key = env.RC_PUBLIC_KEY_IOS?.trim();
  if (!key) return { ok: false, code: "NO_CREDENTIALS", detail: "RC_PUBLIC_KEY_IOS not set" };
  const jws = args.signedTransactionJws?.trim();
  if (!jws) return { ok: false, code: "NO_TOKEN", detail: "no stored JWS for this user" };

  let res: Response;
  try {
    res = await fetchImpl(RC_RECEIPTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Platform": "ios",
      },
      body: JSON.stringify({ app_user_id: args.userId, fetch_token: jws }),
      // Bounded: the purchase-confirm path awaits this.
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, code: "HTTP_ERROR", detail: `network: ${err instanceof Error ? err.message : String(err)}` };
  }

  let body: { subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> }; code?: number; message?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: "BAD_BODY", detail: `status ${res.status}, non-JSON body` };
  }
  if (!res.ok) {
    // RC error bodies carry {code, message}; neither contains the token.
    return { ok: false, code: "HTTP_ERROR", detail: `status ${res.status} code ${body.code ?? "?"} ${body.message ?? ""}`.trim() };
  }

  const ent = body.subscriber?.entitlements?.[RC_ENTITLEMENT_PRO];
  const exp = ent?.expires_date ? Date.parse(ent.expires_date) : null;
  const hasPro = ent !== undefined && (exp === null || exp > Date.now());
  return { ok: true, hasPro };
}
