import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

import { checkoutMatchMetadata, matchKeysFromSession } from "./meta-match";

const req = (headers: Record<string, string>) => new NextRequest("https://goripple.io/api/onboarding/create-checkout", { method: "POST", headers });

describe("checkoutMatchMetadata", () => {
  it("captures ip, user agent, Meta cookies and country within Stripe's limits", () => {
    const m = checkoutMatchMetadata(
      req({
        "x-forwarded-for": "203.0.113.7, 10.0.0.1",
        "user-agent": "Mozilla/5.0 (iPhone) " + "x".repeat(900),
        cookie: "_fbp=fb.1.123.456; other=1; _fbc=fb.1.789.AbCdEf",
        "x-vercel-ip-country": "US",
      })
    );
    expect(m.meta_ip).toBe("203.0.113.7");
    expect(m.meta_ua!.length).toBeLessThanOrEqual(500);
    expect(m.meta_fbp).toBe("fb.1.123.456");
    expect(m.meta_fbc).toBe("fb.1.789.AbCdEf");
    expect(m.meta_country).toBe("us");
    for (const [k, v] of Object.entries(m)) {
      expect(k.length).toBeLessThanOrEqual(40);
      expect(v.length).toBeLessThanOrEqual(500);
    }
  });

  it("returns nothing (never throws) when the request has no details", () => {
    expect(checkoutMatchMetadata(req({}))).toEqual({});
  });
});

describe("matchKeysFromSession", () => {
  it("prefers the card's country and splits the cardholder name", () => {
    const k = matchKeysFromSession({
      metadata: { meta_ip: "203.0.113.7", meta_ua: "UA", meta_fbp: "fbp", meta_fbc: "fbc", meta_country: "ca", userId: "u1" },
      customer_details: { name: "Jane Q Doe", address: { country: "US", postal_code: "78701-1234" } },
    });
    expect(k).toEqual({ ip: "203.0.113.7", userAgent: "UA", fbp: "fbp", fbc: "fbc", country: "us", zip: "78701-1234", firstName: "Jane", lastName: "Doe" });
  });

  it("copes with an old session that has no match metadata", () => {
    const k = matchKeysFromSession({ metadata: { userId: "u1" }, customer_details: null });
    expect(Object.values(k).every((v) => v === undefined)).toBe(true);
  });
});

describe("sendConversionEvent payload", () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events_received: 1 }), text: async () => "{}" });
  beforeEach(() => {
    vi.stubEnv("META_PIXEL_ID", "pixel");
    vi.stubEnv("META_ACCESS_TOKEN", "token");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends hashed external_id, country and 5-digit US zip alongside ip/ua/fbp/fbc", async () => {
    vi.doMock("@/lib/internal-traffic", () => ({
      INTERNAL_UA: /never-match/,
      isInternalEmail: () => false,
      isInternalUser: async () => false,
      isInternalSession: async () => false,
    }));
    vi.doMock("@/lib/prisma", () => ({ prisma: { onboardingEvent: { create: vi.fn() } } }));
    const { sendConversionEvent } = await import("./meta-capi");
    await sendConversionEvent({
      eventName: "Purchase",
      eventId: "purchase_cs_1",
      userData: { email: "a@b.co", externalId: "user_1", country: "us", zip: "78701-1234", ip: "203.0.113.7", userAgent: "UA", fbp: "fbp1", fbc: "fbc1" },
      customData: { value: 9.99, currency: "USD" },
    });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/events"));
    expect(call).toBeTruthy();
    const body = JSON.parse(String((call![1] as RequestInit).body));
    const ud = body.data[0].user_data;
    const { createHash } = await import("crypto");
    const h = (v: string) => createHash("sha256").update(v).digest("hex");
    expect(ud.external_id).toEqual([h("user_1")]);
    expect(ud.country).toEqual([h("us")]);
    expect(ud.zp).toEqual([h("78701")]);
    expect(ud.client_ip_address).toBe("203.0.113.7");
    expect(ud.client_user_agent).toBe("UA");
    expect(ud.fbp).toBe("fbp1");
    expect(ud.fbc).toBe("fbc1");
  });
});
