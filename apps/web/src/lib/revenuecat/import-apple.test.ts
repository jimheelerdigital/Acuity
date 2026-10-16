import { describe, expect, it, vi } from "vitest";

import { importAppleTransactionToRc } from "./import-apple";

const env = { RC_PUBLIC_KEY_IOS: "appl_test_public" };
const future = new Date(Date.now() + 30 * 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();

function okFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("importAppleTransactionToRc", () => {
  it("POSTs the JWS to /v1/receipts as iOS, under our User.id, with the PUBLIC iOS key", async () => {
    const f = okFetch({ subscriber: { entitlements: { pro: { expires_date: future } } } });
    const r = await importAppleTransactionToRc({ userId: "user_1", signedTransactionJws: "eyJ.jws.sig" }, f, env);
    expect(r).toEqual({ ok: true, hasPro: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.revenuecat.com/v1/receipts");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer appl_test_public", "X-Platform": "ios" });
    expect(JSON.parse(init.body)).toEqual({ app_user_id: "user_1", fetch_token: "eyJ.jws.sig" });
  });

  it("reports hasPro=false when RC accepts the receipt but the entitlement is expired", async () => {
    const f = okFetch({ subscriber: { entitlements: { pro: { expires_date: past } } } });
    expect(await importAppleTransactionToRc({ userId: "u", signedTransactionJws: "j" }, f, env)).toEqual({ ok: true, hasPro: false });
  });

  it("does nothing without the iOS public key (never falls back to another key)", async () => {
    const f = okFetch({});
    const r = await importAppleTransactionToRc({ userId: "u", signedTransactionJws: "j" }, f, { RC_PUBLIC_KEY_STRIPE: "strp_x" });
    expect(r).toMatchObject({ ok: false, code: "NO_CREDENTIALS" });
    expect(f).not.toHaveBeenCalled();
  });

  it("does nothing when we hold no JWS", async () => {
    const f = okFetch({});
    expect(await importAppleTransactionToRc({ userId: "u", signedTransactionJws: null }, f, env)).toMatchObject({ ok: false, code: "NO_TOKEN" });
    expect(f).not.toHaveBeenCalled();
  });

  it("surfaces RC errors without throwing", async () => {
    const f = okFetch({ code: 7712, message: "The receipt is not valid." }, 400);
    expect(await importAppleTransactionToRc({ userId: "u", signedTransactionJws: "j" }, f, env)).toMatchObject({
      ok: false,
      code: "HTTP_ERROR",
      detail: expect.stringContaining("7712"),
    });
  });

  it("never throws on a network failure", async () => {
    const f = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await importAppleTransactionToRc({ userId: "u", signedTransactionJws: "j" }, f, env)).toMatchObject({ ok: false, code: "HTTP_ERROR" });
  });
});
