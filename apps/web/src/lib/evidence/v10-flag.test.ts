import { afterEach, describe, expect, it } from "vitest";

/**
 * The ONBOARDING_V10 flag decides which onboarding flow renders at every
 * /onboarding-new/* route. Getting its default wrong would either strand the
 * live Meta-ad funnel on an unfinished flow, or make v10 unreachable.
 *
 * The module reads `process.env.EXPO_PUBLIC_ONBOARDING_V10` at CALL time, so
 * these tests can flip it per case.
 */

const KEY = "EXPO_PUBLIC_ONBOARDING_V10";

async function flagValue(raw: string | undefined): Promise<boolean> {
  if (raw === undefined) delete process.env[KEY];
  else process.env[KEY] = raw;
  const mod = await import(
    "../../../../../apps/mobile/lib/feature-flags"
  );
  return mod.isOnboardingV10Enabled();
}

afterEach(() => {
  delete process.env[KEY];
});

describe("ONBOARDING_V10 flag", () => {
  it("defaults OFF when unset — the live flow keeps rendering", async () => {
    expect(await flagValue(undefined)).toBe(false);
  });

  it("is ON only for the literal string 'true'", async () => {
    expect(await flagValue("true")).toBe(true);
  });

  it("is OFF for everything else, including near-misses", async () => {
    // Strict equality is the module's documented contract: "Default for every
    // flag is OFF unless the env var is the literal string 'true'". A
    // malformed value must never silently enable an experimental path — this
    // one swaps the entire onboarding funnel.
    for (const v of ["1", "TRUE", "True", "yes", "on", "", " true ", "false"]) {
      expect(await flagValue(v)).toBe(false);
    }
  });
});
