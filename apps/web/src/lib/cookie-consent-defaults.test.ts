import { afterEach, describe, expect, it, vi } from "vitest";

import { effectiveConsent } from "@/lib/cookie-consent-defaults";

// Node test env: stub just enough of window / localStorage / navigator / Intl.
function setup({ tz, gpc = false, stored }: { tz: string; gpc?: boolean; stored?: object }) {
  const store = new Map<string, string>();
  if (stored) store.set("acuity_consent", JSON.stringify(stored));
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null } });
  vi.stubGlobal("navigator", { globalPrivacyControl: gpc });
  const real = Intl.DateTimeFormat;
  vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
    (() => ({ resolvedOptions: () => ({ ...new real().resolvedOptions(), timeZone: tz }) })) as unknown as typeof Intl.DateTimeFormat,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("effectiveConsent", () => {
  it("defaults on for US visitors", () => {
    setup({ tz: "America/Chicago" });
    expect(effectiveConsent()).toEqual({ analytics: true, marketing: true });
  });

  it("defaults off for Europe/UK time zones", () => {
    setup({ tz: "Europe/London" });
    expect(effectiveConsent()).toEqual({ analytics: false, marketing: false });
    setup({ tz: "Atlantic/Canary" });
    expect(effectiveConsent()).toEqual({ analytics: false, marketing: false });
  });

  it("defaults off when the browser sends Global Privacy Control", () => {
    setup({ tz: "America/Los_Angeles", gpc: true });
    expect(effectiveConsent()).toEqual({ analytics: false, marketing: false });
  });

  it("an explicit stored choice wins over the default", () => {
    setup({ tz: "America/New_York", stored: { version: 1, acceptedAt: "x", analytics: true, marketing: false } });
    expect(effectiveConsent()).toEqual({ analytics: true, marketing: false });
    setup({ tz: "Europe/Paris", stored: { version: 1, acceptedAt: "x", analytics: true, marketing: true } });
    expect(effectiveConsent()).toEqual({ analytics: true, marketing: true });
  });
});
