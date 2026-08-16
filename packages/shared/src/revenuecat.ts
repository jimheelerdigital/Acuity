/**
 * RevenueCat migration — single source of truth for flags + identifiers.
 *
 * Lives in @acuity/shared because BOTH the web server (webhook receiver,
 * entitlement resolver, import script) and the Expo app (SDK configure,
 * purchase flow) must agree on the same three flag names, the same
 * entitlement identifier, and the same product-id map. A drift between
 * the two sides is exactly how a half-migrated billing system grants the
 * wrong access.
 *
 * ── Migration strategy: OBSERVER MODE FIRST ─────────────────────────
 * RevenueCat watches and we verify its data matches the DB before it
 * controls anything. The three flags below are the staged switches:
 *
 *   RC_OBSERVER         mobile SDK configured in "purchases completed by
 *                       your app" mode. RC observes StoreKit/Play
 *                       transactions; our own react-native-iap flow still
 *                       performs every purchase. Writes NOTHING to our DB.
 *
 *   RC_SOURCE_OF_TRUTH  the RC webhook is allowed to WRITE
 *                       subscriptionStatus / subscriptionSource, and the
 *                       entitlement resolver reads RC state. Until this is
 *                       on, the webhook logs and returns 200 without
 *                       touching the database.
 *
 *   RC_SDK_PURCHASES    purchases go through RC's SDK
 *                       (getOfferings → purchasePackage) instead of
 *                       react-native-iap. Independent of the two above:
 *                       you can observe without purchasing through RC, and
 *                       you must NOT enable this before RC_SOURCE_OF_TRUTH
 *                       or a purchase would succeed with nothing writing
 *                       the entitlement.
 *
 * ALL THREE DEFAULT OFF. There is no code path that turns one on
 * implicitly — flipping one is an explicit env change plus a redeploy.
 * Cutover order + the dual-read fallback plan: docs/REVENUECAT_MIGRATION.md
 */

// ─── Flags ───────────────────────────────────────────────────────────

export const RC_FLAG_KEYS = [
  "RC_OBSERVER",
  "RC_SOURCE_OF_TRUTH",
  "RC_SDK_PURCHASES",
] as const;

export type RcFlagKey = (typeof RC_FLAG_KEYS)[number];

export type RcFlags = Record<RcFlagKey, boolean>;

/**
 * Every flag is off unless the environment explicitly turns it on.
 * Exported so tests and the docs can assert the default posture.
 */
export const RC_FLAG_DEFAULTS: RcFlags = {
  RC_OBSERVER: false,
  RC_SOURCE_OF_TRUTH: false,
  RC_SDK_PURCHASES: false,
};

/**
 * Truthy env parsing, deliberately strict + allow-list based.
 *
 * Only "1" / "true" / "on" / "yes" (case-insensitive, trimmed) enable a
 * flag. Anything else — including "0", "false", "", undefined, and typos
 * like "ture" — is OFF. Fail-closed is the whole point: a malformed value
 * on a billing flag must never be interpreted as "go live".
 */
export function parseRcFlag(raw: string | undefined | null): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/**
 * Resolve all three flags from a caller-supplied reader.
 *
 * The reader indirection exists because the two runtimes source env
 * differently:
 *   - web/server  → `(k) => process.env[k]` (dynamic access is fine)
 *   - Expo/mobile → must use STATIC `process.env.EXPO_PUBLIC_RC_*` member
 *     access, because Metro inlines EXPO_PUBLIC_* at build time only for
 *     static property reads. `process.env[someVar]` is NOT inlined and
 *     resolves to undefined in a release bundle — which would read as
 *     "flag off" (safe here, but silently unflippable).
 * See apps/mobile/lib/revenuecat/flags.ts for the static-read adapter.
 */
export function resolveRcFlags(
  read: (key: RcFlagKey) => string | undefined | null
): RcFlags {
  return {
    RC_OBSERVER: parseRcFlag(read("RC_OBSERVER")),
    RC_SOURCE_OF_TRUTH: parseRcFlag(read("RC_SOURCE_OF_TRUTH")),
    RC_SDK_PURCHASES: parseRcFlag(read("RC_SDK_PURCHASES")),
  };
}

// ─── Identifiers ─────────────────────────────────────────────────────

/**
 * The RevenueCat *entitlement* identifier. One entitlement, granted by
 * every product (monthly + annual, iOS + Android + Stripe). Configured in
 * the RC dashboard → Entitlements. Must match exactly or
 * `customerInfo.entitlements.active["pro"]` is always undefined and every
 * paying user reads as free.
 */
export const RC_ENTITLEMENT_PRO = "pro";

/**
 * RC *offering* identifiers. An offering is a set of packages shown on the
 * paywall. `default` is RC's conventional current-offering id; the
 * grandfathered offering exists so the 17 existing subscribers keep seeing
 * their original pricing (see RC_GRANDFATHER below).
 *
 * These are config, not constants-in-code, precisely so the purchase flow
 * compiles and runs before the real offerings exist in the dashboard.
 */
export const RC_OFFERINGS = {
  /** Current default offering — new pricing ($8.99 / $79.99). */
  default: "default",
  /** Legacy pricing offering for grandfathered subscribers ($4.99 / $39.99). */
  grandfathered: "grandfathered",
} as const;

export type RcOfferingId = (typeof RC_OFFERINGS)[keyof typeof RC_OFFERINGS];

/**
 * Package identifiers within an offering. RC ships well-known values
 * ($rc_monthly / $rc_annual) for the standard durations; using those keeps
 * the dashboard setup conventional and lets `getOfferings()` results be
 * looked up without a custom mapping.
 */
export const RC_PACKAGES = {
  monthly: "$rc_monthly",
  annual: "$rc_annual",
} as const;

// ─── Store source attribution ────────────────────────────────────────

/**
 * RC reports which store a subscription came from. Map it onto the
 * `subscriptionSource` vocabulary our DB already uses, so the RC webhook
 * writes values every existing reader already understands and the
 * cross-source demotion guard (NOT_IAP_SOURCE_WHERE) keeps working
 * unchanged.
 *
 * RC store values: APP_STORE, MAC_APP_STORE, PLAY_STORE, AMAZON,
 * STRIPE, RC_BILLING, PADDLE, PROMOTIONAL.
 *
 * PROMOTIONAL is RC's "granted via dashboard" — it maps to our `comp`
 * marker, which is intentionally non-demotable.
 */
export const RC_STORE_TO_SOURCE: Record<string, string> = {
  APP_STORE: "apple",
  MAC_APP_STORE: "apple",
  PLAY_STORE: "google_play",
  STRIPE: "stripe",
  RC_BILLING: "stripe",
  PROMOTIONAL: "comp",
};

/**
 * Map an RC `store` value onto our subscriptionSource. Returns null for an
 * unrecognized store rather than guessing — the caller must then leave
 * subscriptionSource UNCHANGED (never overwrite a known source with a
 * guess; that is how a row loses its provider attribution and becomes
 * unverifiable by the drift monitor).
 */
export function rcStoreToSource(store: string | null | undefined): string | null {
  if (typeof store !== "string") return null;
  return RC_STORE_TO_SOURCE[store.trim().toUpperCase()] ?? null;
}
