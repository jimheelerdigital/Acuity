/**
 * Meta SDK must start on every launch (2026-10-21, before app-install ads),
 * but the ATT prompt must still wait for onboarding.
 *
 * Regression this guards: the SDK used to start only inside the
 * "onboardingCompleted" branch, so new installs that quit early never sent
 * Meta an install / fb_mobile_activate_app event.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mobile = path.resolve(__dirname, "../../../../mobile");
const layout = readFileSync(path.join(mobile, "app/_layout.tsx"), "utf8");
const sdk = readFileSync(path.join(mobile, "lib/meta-sdk.ts"), "utf8");

function body(src: string, fn: string): string {
  const start = src.indexOf(`export async function ${fn}(`);
  expect(start, `${fn} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("Meta SDK start vs ATT prompt", () => {
  it("startMetaSdk initializes the SDK and never shows the ATT prompt", () => {
    const b = body(sdk, "startMetaSdk");
    expect(b).toContain("Settings.initializeSDK()");
    expect(b).toContain("getTrackingPermissionsAsync");
    expect(b).not.toContain("requestTrackingPermissionsAsync");
  });

  it("the ATT prompt lives only in requestMetaTracking", () => {
    expect(body(sdk, "requestMetaTracking")).toContain("requestTrackingPermissionsAsync");
    expect(sdk.match(/requestTrackingPermissionsAsync\(/g)?.length).toBe(1);
  });

  it("_layout starts the SDK unconditionally and asks for tracking only after onboarding", () => {
    expect(layout).toMatch(/useEffect\(\(\) => \{\s*void startMetaSdk\(\);\s*\}, \[\]\);/);
    expect(layout).toMatch(/if \(user\.onboardingCompleted\) \{[\s\S]{0,200}requestMetaTracking\(\)/);
    expect(layout).not.toContain("initMetaSdk(");
  });
});

describe("on-device purchase events (2026-10-21)", () => {
  const rc = readFileSync(path.join(mobile, "lib/revenuecat/index.ts"), "utf8");

  it("every RevenueCat purchase logs to Meta, trial vs paid from the entitlement periodType", () => {
    const fn = rc.slice(rc.indexOf("export async function purchaseProPackage("), rc.indexOf("export async function restoreProPurchases("));
    expect(fn).toContain("logMetaPurchase(pkg, ent?.periodType)");
    expect(rc).toMatch(/periodType === "TRIAL"\) m\.logStartTrial\(/);
    expect(rc).toContain("m.logSubscribe(price, currency)");
  });

  it("uses Meta's standard event names and never drops pre-init events", () => {
    expect(sdk).toContain("AppEvents.StartTrial");
    expect(sdk).toContain("AppEvents.Subscribe");
    expect(sdk).not.toMatch(/logEvent\("fb_mobile_start_trial"/);
    for (const fn of ["logStartTrial", "logSubscribe", "logCompletedRegistration"]) {
      const start = sdk.indexOf(`export function ${fn}(`);
      expect(sdk.slice(start, sdk.indexOf("\nexport ", start + 10)), fn).toContain("logOrQueue(");
    }
  });
});
