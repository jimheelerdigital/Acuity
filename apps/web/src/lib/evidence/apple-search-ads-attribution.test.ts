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
    // 2026-10-21: the SDK starts at launch (startMetaSdk) and the ATT prompt
    // moved to requestMetaTracking; attribution runs from its finally.
    const req = meta.slice(meta.indexOf("export async function requestMetaTracking("));
    const attIdx = req.indexOf("requestTrackingPermissionsAsync");
    const finallyIdx = req.indexOf("} finally {");
    const callIdx = req.indexOf("linkAdIdentifiers()", finallyIdx);
    expect(attIdx).toBeGreaterThan(-1);
    expect(finallyIdx).toBeGreaterThan(attIdx);
    expect(callIdx).toBeGreaterThan(finallyIdx);
    const link = meta.slice(meta.indexOf("function linkAdIdentifiers("), meta.indexOf("export async function startMetaSdk("));
    expect(link).toContain("enableAppleSearchAdsAttribution()");
  });
});
