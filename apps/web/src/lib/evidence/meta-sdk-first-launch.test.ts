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
