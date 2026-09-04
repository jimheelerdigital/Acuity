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

/** Profiles that intentionally configure the RC SDK in observer mode. */
const OBSERVER_PROFILES = [
  "observer",
  "observer-internal",
  "pricing",
  // Extends `pricing`, so it inherits the soak as well as new pricing.
  "v10-pricing",
] as const;

/** Profiles that intentionally ship V2 prices. Exact list — see below. */
const NEW_PRICING_PROFILES = ["pricing", "v10-pricing"];

describe.each(OBSERVER_PROFILES)("eas.json %s profile", (profile) => {
  const env = () => resolvedEnv(profile);

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

  it("advances no RC stage past observation", () => {
    // NEW_PRICING is deliberately NOT asserted here — `pricing` is in
    // this list because it configures the SDK in observer mode, and it
    // sets NEW_PRICING on purpose. Per-profile pricing expectations live
    // in the "no EAS profile can advance the RC migration" block below.
    expect(env().EXPO_PUBLIC_RC_SOURCE_OF_TRUTH).toBeUndefined();
    expect(env().EXPO_PUBLIC_RC_SDK_PURCHASES).toBeUndefined();
  });

  it("points at production and the rc-observer channel", () => {
    expect(resolvedChannel(profile)).toBe("rc-observer");
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
    const env = resolvedEnv("production");
    expect(env.EXPO_PUBLIC_RC_OBSERVER).toBeUndefined();
    expect(env.EXPO_PUBLIC_NEW_PRICING).toBeUndefined();
  });
});

describe("no EAS profile can advance the RC migration past observer", () => {
  it("SOURCE_OF_TRUTH and SDK_PURCHASES stay unset on EVERY profile", () => {
    // These two are the stages that let RC write entitlements and take
    // money. Neither is in scope for any build that exists today, and
    // `pricing` turning on new pricing must not drag them along.
    for (const name of Object.keys(eas.build)) {
      const env = resolvedEnv(name);
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

  it("new pricing is set ONLY on the profiles built to carry it", () => {
    // Deliberately an exact list, not a subset check: a leak into
    // production/observer/v10 must fail here. `v10-pricing` is on the list
    // because it extends `pricing` on purpose, for QA that needs both the
    // v10 flow and V2 prices in one binary.
    const withPricing = Object.keys(eas.build).filter(
      (n) => resolvedEnv(n).EXPO_PUBLIC_NEW_PRICING !== undefined
    );
    expect(withPricing.sort()).toEqual([...NEW_PRICING_PROFILES].sort());
  });

  it("the v10 onboarding flag stays off everywhere except its own profiles", () => {
    const withV10 = Object.keys(eas.build).filter(
      (n) => resolvedEnv(n).EXPO_PUBLIC_ONBOARDING_V10 !== undefined
    );
    expect(withV10.sort()).toEqual(["v10", "v10-pricing"]);
    // The store build must never carry it.
    expect(resolvedEnv("production").EXPO_PUBLIC_ONBOARDING_V10).toBeUndefined();
  });

  it("observer, observer-internal and production stay on legacy pricing", () => {
    for (const name of ["observer", "observer-internal", "production"]) {
      expect(
        resolvedEnv(name).EXPO_PUBLIC_NEW_PRICING,
        `${name} must stay on legacy pricing`
      ).toBeUndefined();
    }
  });
});

describe("the `pricing` profile — new pricing WITHOUT disturbing the soak", () => {
  const env = () => resolvedEnv("pricing");

  it("extends observer rather than re-declaring the soak config", () => {
    expect(eas.build.pricing?.extends).toBe("observer");
    // Only the one new var is declared literally; everything else is
    // inherited. Re-listing would be a second copy to drift.
    expect(Object.keys(eas.build.pricing?.env ?? {})).toEqual([
      "EXPO_PUBLIC_NEW_PRICING",
    ]);
  });

  it("turns new pricing ON", () => {
    expect(env().EXPO_PUBLIC_NEW_PRICING).toBe("1");
  });

  it("KEEPS the observer soak running — flag and both SDK keys", () => {
    // The whole point: enabling pricing must not interrupt observation.
    expect(env().EXPO_PUBLIC_RC_OBSERVER).toBe("1");
    expect(env().EXPO_PUBLIC_RC_IOS_KEY).toBe("appl_OiPWlxyTKxSsBGnaFdXiOqsgeOT");
    expect(env().EXPO_PUBLIC_RC_ANDROID_KEY).toBe("goog_LpHyZxOdnrjVfxTMRjoVfCjnEft");
    expect(rcConfigureMode(flagsForProfile("pricing"))).toBe("observer");
  });

  it("advances no other RC stage", () => {
    expect(env().EXPO_PUBLIC_RC_SOURCE_OF_TRUTH).toBeUndefined();
    expect(env().EXPO_PUBLIC_RC_SDK_PURCHASES).toBeUndefined();
    expect(rcUnsafePurchaseConfig(flagsForProfile("pricing"))).toBe(false);
  });

  it("has a matching submit profile — submit does not inherit from build", () => {
    const easFull = JSON.parse(readFileSync(EAS_PATH, "utf8")) as {
      submit?: Record<string, { extends?: string }>;
    };
    expect(easFull.submit?.pricing).toBeDefined();
    expect(easFull.submit?.pricing?.extends).toBe("production");
  });
});

describe("the `v10-pricing` profile — both flags in one QA binary", () => {
  const env = () => resolvedEnv("v10-pricing");

  it("extends `pricing` and declares only the v10 flag", () => {
    expect(eas.build["v10-pricing"]?.extends).toBe("pricing");
    expect(Object.keys(eas.build["v10-pricing"]?.env ?? {})).toEqual([
      "EXPO_PUBLIC_ONBOARDING_V10",
    ]);
  });

  it("carries BOTH flags — the combination no other profile had", () => {
    // This pairing is what makes the parser split reachable, so it is also
    // what the single-parser fix has to hold up under. See
    // lib/evidence/new-pricing-flag-parity.test.ts.
    expect(env().EXPO_PUBLIC_ONBOARDING_V10).toBe("true");
    expect(env().EXPO_PUBLIC_NEW_PRICING).toBe("1");
  });

  it("still keeps the observer soak running", () => {
    expect(env().EXPO_PUBLIC_RC_OBSERVER).toBe("1");
    expect(rcConfigureMode(flagsForProfile("v10-pricing"))).toBe("observer");
  });

  it("advances no other RC stage", () => {
    expect(env().EXPO_PUBLIC_RC_SOURCE_OF_TRUTH).toBeUndefined();
    expect(env().EXPO_PUBLIC_RC_SDK_PURCHASES).toBeUndefined();
    expect(rcUnsafePurchaseConfig(flagsForProfile("v10-pricing"))).toBe(false);
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
