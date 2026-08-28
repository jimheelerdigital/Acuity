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
 * The RevenueCat OBSERVER build must observe — and change nothing else.
 *
 * ── What this build is ───────────────────────────────────────────────
 * The `observer` EAS profile supplies the two PUBLIC RC SDK keys plus
 * EXPO_PUBLIC_RC_OBSERVER=1. That configures the SDK with
 * `purchasesAreCompletedBy: MY_APP`, so RC watches the transactions
 * react-native-iap already makes and populates its own backend. Our IAP
 * flow stays authoritative and the app keeps reading the DB.
 *
 * ── The two ways this could go wrong ─────────────────────────────────
 * 1. It silently does nothing. Observer mode needs BOTH the flag and a
 *    platform key — `configureRevenueCat` returns "no-key" and never loads
 *    the native module if the key is missing. A profile with the flag and
 *    no key looks enabled and observes nothing.
 * 2. It does too much. RC_SDK_PURCHASES without RC_SOURCE_OF_TRUTH takes
 *    real money at the store with nothing writing the entitlement, and
 *    EXPO_PUBLIC_NEW_PRICING would quote $9.99 against $4.99 pages.
 *
 * These tests read the REAL apps/mobile/eas.json rather than a fixture, so
 * they fail if the shipped profile drifts from the intent described above.
 *
 * `rcConfigureMode` is the same function `configureRevenueCat` branches on
 * (apps/mobile/lib/revenuecat/index.ts), so asserting it here is asserting
 * the real decision — not a re-implementation of it.
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

/** Read a profile's env exactly as `flags.ts` reads process.env. */
function flagsForProfile(profile: string) {
  const env = eas.build[profile]?.env ?? {};
  return resolveRcFlags((key: RcFlagKey) => env[`EXPO_PUBLIC_${key}`]);
}

const OBSERVER_PROFILES = ["observer", "observer-internal"] as const;

describe.each(OBSERVER_PROFILES)("eas.json %s profile", (profile) => {
  const env = () => eas.build[profile]?.env ?? {};

  it("exists and carries both PUBLIC RC SDK keys", () => {
    expect(eas.build[profile]).toBeDefined();
    // Without a key for the running platform, configureRevenueCat returns
    // "no-key" and never imports the native module — an observer build that
    // observes nothing.
    expect(env().EXPO_PUBLIC_RC_IOS_KEY).toBe("appl_OiPWlxyTKxSsBGnaFdXiOqsgeOT");
    expect(env().EXPO_PUBLIC_RC_ANDROID_KEY).toBe("goog_LpHyZxOdnrjVfxTMRjoVfCjnEft");
  });

  it("resolves to OBSERVER mode — not disabled, not purchases", () => {
    const flags = flagsForProfile(profile);
    expect(flags).toEqual({
      RC_OBSERVER: true,
      RC_SOURCE_OF_TRUTH: false,
      RC_SDK_PURCHASES: false,
    });
    expect(rcConfigureMode(flags)).toBe("observer");
  });

  it("is not the take-money-grant-nothing combination", () => {
    expect(rcUnsafePurchaseConfig(flagsForProfile(profile))).toBe(false);
  });

  it("leaves pricing and source-of-truth untouched", () => {
    // The three vars that would make this build user-visible.
    expect(env().EXPO_PUBLIC_NEW_PRICING).toBeUndefined();
    expect(env().EXPO_PUBLIC_RC_SOURCE_OF_TRUTH).toBeUndefined();
    expect(env().EXPO_PUBLIC_RC_SDK_PURCHASES).toBeUndefined();
  });

  it("points at production and the rc-observer channel", () => {
    expect(eas.build[profile].channel).toBe("rc-observer");
    expect(env().EXPO_PUBLIC_API_URL).toBe("https://goripple.io");
  });
});

describe("every other EAS profile stays RC-disabled", () => {
  const others = Object.keys(eas.build).filter(
    (p) => !OBSERVER_PROFILES.includes(p as (typeof OBSERVER_PROFILES)[number])
  );

  it.each(others)("%s resolves to disabled", (profile) => {
    expect(rcConfigureMode(flagsForProfile(profile))).toBe("disabled");
  });

  it("in particular the store production profile is untouched", () => {
    // production is what ships to the App Store. Observer is a separate
    // profile that extends it; enabling RC here would put the SDK in the
    // public build.
    expect(flagsForProfile("production")).toEqual(RC_FLAG_DEFAULTS);
    const env = eas.build.production.env ?? {};
    expect(env.EXPO_PUBLIC_RC_OBSERVER).toBeUndefined();
    expect(env.EXPO_PUBLIC_NEW_PRICING).toBeUndefined();
  });
});

describe("no EAS profile can enable new pricing or source-of-truth", () => {
  it("holds across every profile", () => {
    for (const [name, profile] of Object.entries(eas.build)) {
      const env = profile.env ?? {};
      expect(
        env.EXPO_PUBLIC_NEW_PRICING,
        `${name} must not set EXPO_PUBLIC_NEW_PRICING`
      ).toBeUndefined();
      expect(
        env.EXPO_PUBLIC_RC_SOURCE_OF_TRUTH,
        `${name} must not set EXPO_PUBLIC_RC_SOURCE_OF_TRUTH`
      ).toBeUndefined();
      expect(
        env.EXPO_PUBLIC_RC_SDK_PURCHASES,
        `${name} must not set EXPO_PUBLIC_RC_SDK_PURCHASES`
      ).toBeUndefined();
    }
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
