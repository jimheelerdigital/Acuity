import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RC_FLAG_DEFAULTS,
  rcConfigureMode,
  rcUnsafePurchaseConfig,
  resolveRcFlags,
  type RcFlagKey,
} from "@acuity/shared";

/**
 * The SHIPPED RevenueCat build — what the App Store binary actually carries.
 *
 * Replaces rc-observer-build.test.ts (2026-10-16). That file pinned the
 * observer-soak stage of the migration ("production stays RC-disabled, on
 * legacy pricing"), which ended with 1.9.0: production now buys through the
 * RC SDK, ships V2 prices and the v10 onboarding, and the server is the
 * entitlement source of truth (Vercel RC_SOURCE_OF_TRUTH — not a mobile
 * flag). The old assertions failed against the real eas.json once the
 * shipped app landed on main, so they guarded nothing.
 *
 * These read the REAL apps/mobile/eas.json, so they fail if the store build
 * drifts: loses a key (configureRevenueCat returns "no-key" and the paywall
 * has nothing to sell), drops back to observer, or picks up a QA override.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const EAS_PATH = join(REPO, "apps", "mobile", "eas.json");
const APP_JSON_PATH = join(REPO, "apps", "mobile", "app.json");

interface EasProfile {
  extends?: string;
  channel?: string;
  env?: Record<string, string>;
}

const eas = JSON.parse(readFileSync(EAS_PATH, "utf8")) as {
  build: Record<string, EasProfile>;
};

/**
 * Resolve a profile's env the way EAS actually builds it: `extends`
 * deep-merges, with the child overriding parent keys.
 *
 * This must follow the chain, not read the literal block. The `pricing`
 * profile declares ONLY `EXPO_PUBLIC_NEW_PRICING` and inherits the RC
 * observer flag and keys from `observer`. A literal read would report it
 * as RC-disabled while the shipped binary has the SDK configured — the
 * test would assert something false about the build.
 *
 * Verified against `eas config --profile pricing` (eas-cli 23.2.0), which
 * resolves all six inherited vars plus the new one.
 */
function profileChain(profile: string): EasProfile[] {
  const seen = new Set<string>();
  const chain: EasProfile[] = [];
  let cursor: string | undefined = profile;
  while (cursor && eas.build[cursor] && !seen.has(cursor)) {
    seen.add(cursor);
    chain.unshift(eas.build[cursor]);
    cursor = eas.build[cursor].extends;
  }
  return chain;
}

function resolvedEnv(profile: string): Record<string, string> {
  return Object.assign({}, ...profileChain(profile).map((p) => p.env ?? {}));
}

/** Nearest declaration of a scalar field along the extends chain. */
function resolvedChannel(profile: string): string | undefined {
  return profileChain(profile)
    .map((p) => p.channel)
    .filter((c): c is string => typeof c === "string")
    .pop();
}

/** Read a profile's env exactly as `flags.ts` reads process.env. */
function flagsForProfile(profile: string) {
  const env = resolvedEnv(profile);
  return resolveRcFlags((key: RcFlagKey) => env[`EXPO_PUBLIC_${key}`]);
}


describe("production — the App Store build", () => {
  const env = () => resolvedEnv("production");

  it("buys through the RevenueCat SDK", () => {
    expect(rcConfigureMode(flagsForProfile("production"))).toBe("purchases");
  });

  it("carries BOTH public RC SDK keys (no key = nothing to sell)", () => {
    expect(env().EXPO_PUBLIC_RC_IOS_KEY?.length ?? 0).toBeGreaterThan(0);
    expect(env().EXPO_PUBLIC_RC_ANDROID_KEY?.length ?? 0).toBeGreaterThan(0);
  });

  it("is not in observer mode", () => {
    expect(env().EXPO_PUBLIC_RC_OBSERVER).toBeUndefined();
  });

  it("ships V2 pricing and the v10 onboarding", () => {
    expect(env().EXPO_PUBLIC_NEW_PRICING).toBe("1");
    expect(env().EXPO_PUBLIC_ONBOARDING_V10).toBe("true");
  });

  it("publishes to the production update channel", () => {
    expect(resolvedChannel("production")).toBe("production");
  });

  it("leaves entitlement authority to the server on every profile", () => {
    // RC_SOURCE_OF_TRUTH is a Vercel flag read by the entitlement resolver.
    // A mobile copy would be a second, drifting switch for the same thing.
    for (const name of Object.keys(eas.build)) {
      expect(
        resolvedEnv(name).EXPO_PUBLIC_RC_SOURCE_OF_TRUTH,
        `${name} must not set EXPO_PUBLIC_RC_SOURCE_OF_TRUTH`
      ).toBeUndefined();
    }
  });
});

/** The ONLY profile allowed to carry the QA cold-start override. */
const QA_FORCE_V10_PROFILES = ["v10-qa"];

describe("the QA cold-start override is quarantined", () => {
  it("EXPO_PUBLIC_QA_FORCE_V10 is set on `v10-qa` and NOWHERE else", () => {
    // Exact list, resolved through `extends`. If this flag ever reaches
    // production/pricing/v10-pricing, a shipped build would ignore the
    // user's stored session on every cold launch.
    const withQa = Object.keys(eas.build).filter(
      (n) => resolvedEnv(n).EXPO_PUBLIC_QA_FORCE_V10 !== undefined
    );
    expect(withQa.sort()).toEqual([...QA_FORCE_V10_PROFILES].sort());
  });

  it("is absent from every store-facing profile by name", () => {
    for (const name of ["production", "testflight-async", "rc-purchases"]) {
      expect(
        resolvedEnv(name).EXPO_PUBLIC_QA_FORCE_V10,
        `${name} must not carry the QA override`
      ).toBeUndefined();
    }
  });

  it("only the exact string \"true\" can enable it", () => {
    // lib/qa/force-v10.ts checks `=== "true"` deliberately — stricter
    // than the lenient 1/true/on/yes parser used for pricing, because
    // this flag bypasses the signed-in check.
    const src = readFileSync(
      join(REPO, "apps", "mobile", "lib", "qa", "force-v10.ts"),
      "utf8"
    );
    expect(src).toContain('process.env.EXPO_PUBLIC_QA_FORCE_V10 === "true"');
    expect(resolvedEnv("v10-qa").EXPO_PUBLIC_QA_FORCE_V10).toBe("true");
  });
});


describe("rcConfigureMode — the branch configureRevenueCat takes", () => {
  const flags = (o: Partial<Record<RcFlagKey, boolean>>) => ({
    ...RC_FLAG_DEFAULTS,
    ...o,
  });

  it("defaults to disabled with nothing set", () => {
    expect(rcConfigureMode(RC_FLAG_DEFAULTS)).toBe("disabled");
  });

  it("observer when only RC_OBSERVER is on", () => {
    expect(rcConfigureMode(flags({ RC_OBSERVER: true }))).toBe("observer");
  });

  it("purchases wins over observer when both are on", () => {
    expect(
      rcConfigureMode(flags({ RC_OBSERVER: true, RC_SDK_PURCHASES: true }))
    ).toBe("purchases");
  });

  it("flags the dangerous purchases-without-source-of-truth combo", () => {
    expect(rcUnsafePurchaseConfig(flags({ RC_SDK_PURCHASES: true }))).toBe(true);
    expect(
      rcUnsafePurchaseConfig(
        flags({ RC_SDK_PURCHASES: true, RC_SOURCE_OF_TRUTH: true })
      )
    ).toBe(false);
  });

  it("fails closed on a malformed flag value", () => {
    // "ture" / "0" / "" must never read as on — a typo on a billing flag
    // must not mean "go live".
    for (const bad of ["ture", "0", "", "false", "off"]) {
      expect(
        rcConfigureMode(resolveRcFlags(() => bad)),
        `${JSON.stringify(bad)} must not enable RC`
      ).toBe("disabled");
    }
  });
});

describe("app version was bumped for the new build", () => {
  it("is past the 1.4.0 / build 45 that preceded this build", () => {
    const app = JSON.parse(readFileSync(APP_JSON_PATH, "utf8")) as {
      expo: { version: string; ios: { buildNumber: string } };
    };
    const [maj, min, patch] = app.expo.version.split(".").map(Number);
    expect(maj * 10_000 + min * 100 + patch).toBeGreaterThan(10_400);
    expect(Number(app.expo.ios.buildNumber)).toBeGreaterThan(45);
  });
});
