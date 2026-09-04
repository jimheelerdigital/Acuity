import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_PRICING_CONFIG,
  LEGACY_TIER,
  PLACEHOLDER_V2_PRODUCT_IDS,
  V2_TIER,
  allProductIds,
  pricingTierFor,
} from "@acuity/shared";

/**
 * The V2 SKUs are real now — and that must remain a paperwork change.
 *
 * ── What changed ─────────────────────────────────────────────────────
 * The $9.99 / $89.99 products exist in App Store Connect, Play Console,
 * Stripe and RevenueCat. `pricing-plans.ts` records the real ids and
 * `PLACEHOLDER_V2_PRODUCT_IDS` is false.
 *
 * ── What must NOT have changed ───────────────────────────────────────
 * Anything a user can see or be charged. `newPricingEnabled` is still
 * false, so every price quoted and every Stripe Price checked out is
 * LEGACY's. The dangerous version of this commit is the one where a real
 * V2 price id becomes REACHABLE before the pricing decision ships — a
 * $9.99 charge against a page advertising $4.99.
 *
 * The tests below pin both halves: the ids are the real ones, and no code
 * path with the flag off can reach them.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");

/** Every .ts/.tsx under a directory, skipping build output. */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (["node_modules", ".next", ".expo", "ios", "android", ".git"].includes(e)) {
      continue;
    }
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}

async function freshPricing() {
  vi.resetModules();
  return import("@/lib/pricing");
}

const V2_MONTHLY_STRIPE = "price_1U7bBOD9XJakJqj51IdGWDVN";
const V2_ANNUAL_STRIPE = "price_1U7bBRD9XJakJqj5uhZY4rgc";

describe("the V2 catalog holds the real store identifiers", () => {
  it("records the Apple product ids", () => {
    // Immutable once created — a typo here is a product that does not
    // exist, and StoreKit returns nothing rather than an error.
    expect(V2_TIER.products.monthly.apple).toBe(
      "com.heelerdigital.acuity.pro.monthly.v2"
    );
    expect(V2_TIER.products.annual.apple).toBe(
      "com.heelerdigital.acuity.pro.annual.v2"
    );
  });

  it("records the Google product ids and their base plans", () => {
    expect(V2_TIER.products.monthly.google).toBe("acuity_pro_monthly_v2");
    expect(V2_TIER.products.monthly.googleBasePlan).toBe("monthly-autorenew");
    expect(V2_TIER.products.annual.google).toBe("acuity_pro_annual_v2");
    expect(V2_TIER.products.annual.googleBasePlan).toBe("annual-yearly");
  });

  it("records the Stripe Price ids, and they are not LEGACY's", () => {
    expect(V2_TIER.products.monthly.stripe).toBe(V2_MONTHLY_STRIPE);
    expect(V2_TIER.products.annual.stripe).toBe(V2_ANNUAL_STRIPE);
    // Reusing a LEGACY Price would charge $4.99 under a V2 label.
    expect(V2_TIER.products.monthly.stripe).not.toBe(
      LEGACY_TIER.products.monthly.stripe
    );
    expect(V2_TIER.products.annual.stripe).not.toBe(
      LEGACY_TIER.products.annual.stripe
    );
  });

  it("no longer claims the ids are placeholders", () => {
    expect(PLACEHOLDER_V2_PRODUCT_IDS).toBe(false);
  });

  it("leaves LEGACY completely untouched", () => {
    expect(LEGACY_TIER.monthlyCents).toBe(499);
    expect(LEGACY_TIER.annualCents).toBe(3999);
    expect(LEGACY_TIER.products.monthly.stripe).toBe(
      "price_1Tb335D9XJakJqj5nwTjb4cf"
    );
    expect(LEGACY_TIER.products.annual.stripe).toBe(
      "price_1TcSPvD9XJakJqj5C2dITYrR"
    );
  });
});

describe("PLACEHOLDER_V2_PRODUCT_IDS cannot change behaviour", () => {
  it("is read by nothing outside its own declaration", () => {
    // This is the whole safety argument for flipping it: it is a comment
    // with a type. If someone ever gates a code path on it, this fails and
    // the flip stops being free.
    const files = [
      ...walk(join(REPO, "apps/web/src")),
      ...walk(join(REPO, "apps/mobile")),
      ...walk(join(REPO, "packages/shared/src")),
    ].filter((f) => !f.endsWith(join("packages", "shared", "src", "pricing-plans.ts")));

    const readers = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!src.includes("PLACEHOLDER_V2_PRODUCT_IDS")) return false;
      // This test file mentions it only to assert on it.
      return f !== __filename;
    });

    expect(
      readers.map((f) => f.slice(REPO.length + 1)),
      "PLACEHOLDER_V2_PRODUCT_IDS gained a consumer — it is no longer inert"
    ).toEqual([]);
  });
});

describe("with newPricingEnabled OFF, everything still resolves LEGACY", () => {
  it("pricingTierFor() returns LEGACY for every kind of user", () => {
    const users = [
      { paidSince: null },
      { paidSince: null, legacyUnknownStart: false },
      { paidSince: new Date("2020-01-01T00:00:00Z") },
      { paidSince: new Date("2099-01-01T00:00:00Z") },
      { paidSince: null, legacyUnknownStart: true },
    ];
    for (const u of users) {
      expect(pricingTierFor(u).id, JSON.stringify(u)).toBe("legacy");
      expect(pricingTierFor(u, DEFAULT_PRICING_CONFIG).id).toBe("legacy");
    }
  });

  it("the default config still has the flag off", () => {
    expect(DEFAULT_PRICING_CONFIG.newPricingEnabled).toBe(false);
    expect(DEFAULT_PRICING_CONFIG.grandfatherExisting).toBe(true);
  });

  it("the paywall still quotes $4.99 / $39.99", async () => {
    vi.stubEnv("NEW_PRICING_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_NEW_PRICING_ENABLED", "");
    const p = await freshPricing();
    expect(p.displayTier().id).toBe("legacy");
    expect(p.displayMonthly()).toBe("$4.99");
    expect(p.displayAnnual()).toBe("$39.99");
    vi.unstubAllEnvs();
  });

  it("checkout still points at the LEGACY Stripe Prices", async () => {
    // The real risk of putting live Price ids in the catalog: one of them
    // becoming the default a checkout session is created with.
    vi.stubEnv("STRIPE_PRICE_MONTHLY", undefined);
    vi.stubEnv("STRIPE_PRICE_YEARLY", undefined);
    const p = await freshPricing();
    expect(p.PRICING.monthly.stripeId).toBe(LEGACY_TIER.products.monthly.stripe);
    expect(p.PRICING.annual.stripeId).toBe(LEGACY_TIER.products.annual.stripe);
    expect([p.PRICING.monthly.stripeId, p.PRICING.annual.stripeId]).not.toContain(
      V2_MONTHLY_STRIPE
    );
    expect([p.PRICING.monthly.stripeId, p.PRICING.annual.stripeId]).not.toContain(
      V2_ANNUAL_STRIPE
    );
    vi.unstubAllEnvs();
  });

  it("the receipt allow-lists have NOT been widened to the V2 products", async () => {
    // Verification gates are a separate decision from the catalog. They
    // open at cutover, not now — otherwise a forged v2 receipt would be
    // honoured before the products are supposed to be purchasable.
    const { ALLOWED_PRODUCT_IDS } = await import("@/lib/apple-iap");
    const { GOOGLE_ALLOWED_PRODUCT_IDS } = await import("@/lib/google-iap");
    expect(ALLOWED_PRODUCT_IDS.has(V2_TIER.products.monthly.apple)).toBe(false);
    expect(ALLOWED_PRODUCT_IDS.has(V2_TIER.products.annual.apple)).toBe(false);
    expect(GOOGLE_ALLOWED_PRODUCT_IDS.has(V2_TIER.products.monthly.google)).toBe(
      false
    );
    expect(GOOGLE_ALLOWED_PRODUCT_IDS.has(V2_TIER.products.annual.google)).toBe(
      false
    );
  });

  it("allProductIds() still lists all four SKUs for server-side allow-lists", () => {
    expect(allProductIds().sort()).toEqual(
      [
        "com.heelerdigital.acuity.pro.monthly",
        "com.heelerdigital.acuity.pro.annual",
        "acuity_pro_monthly",
        "acuity_pro_annual",
        "com.heelerdigital.acuity.pro.monthly.v2",
        "com.heelerdigital.acuity.pro.annual.v2",
        "acuity_pro_monthly_v2",
        "acuity_pro_annual_v2",
      ].sort()
    );
  });
});

describe("V2 is still reachable ONLY through the flag", () => {
  it("flipping newPricingEnabled is what selects V2 — not the SKUs", () => {
    const tier = pricingTierFor(
      { paidSince: null },
      { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: true }
    );
    expect(tier.id).toBe("v2");
    expect(tier.products.monthly.stripe).toBe(V2_MONTHLY_STRIPE);
    expect(tier.products.annual.stripe).toBe(V2_ANNUAL_STRIPE);
  });

  it("a grandfathered subscriber stays on LEGACY even with the flag on", () => {
    const tier = pricingTierFor(
      { paidSince: new Date("2026-01-01T00:00:00Z") },
      { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: true }
    );
    expect(tier.id).toBe("legacy");
  });
});
