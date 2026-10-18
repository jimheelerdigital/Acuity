import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Apple Search Ads attribution goes through RevenueCat (Miro "Apple Ads
 * attribution", 2026-10-17): the SDK posts the AdServices token, RC asks
 * Apple for the campaign. Two things have to stay true for that to work:
 *   1. the app calls Purchases.enableAdServicesAttributionTokenCollection()
 *   2. it does so AFTER the ATT prompt resolves (initMetaSdk's finally),
 *      otherwise Apple only ever returns the Standard payload.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const MOBILE = join(REPO, "apps", "mobile");

describe("Apple Search Ads attribution via RevenueCat", () => {
  const rc = readFileSync(join(MOBILE, "lib", "revenuecat", "index.ts"), "utf8");
  const meta = readFileSync(join(MOBILE, "lib", "meta-sdk.ts"), "utf8");

  it("the RC wrapper enables AdServices token collection", () => {
    expect(rc).toMatch(/enableAdServicesAttributionTokenCollection\(\)/);
    expect(rc).toMatch(/export async function enableAppleSearchAdsAttribution/);
  });

  it("it is triggered after the ATT decision, independent of Meta init succeeding", () => {
    const attIdx = meta.indexOf("requestTrackingPermissionsAsync");
    const finallyIdx = meta.indexOf("} finally {");
    const callIdx = meta.indexOf("enableAppleSearchAdsAttribution()");
    expect(attIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(attIdx);
    expect(callIdx).toBeGreaterThan(finallyIdx);
  });
});
