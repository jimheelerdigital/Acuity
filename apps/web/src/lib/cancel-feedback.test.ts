import { beforeAll, describe, expect, it } from "vitest";

import { CANCEL_REASONS, reasonLabel, signWhyToken, verifyWhyToken } from "./cancel-feedback";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});

describe("cancel feedback links", () => {
  it("round-trips a user id", () => {
    expect(verifyWhyToken(signWhyToken("user_123"))).toBe("user_123");
  });
  it("rejects tampered or missing tokens", () => {
    const t = signWhyToken("user_123");
    const forged = `${Buffer.from("user_999").toString("base64url")}.${t.split(".")[1]}`;
    expect(verifyWhyToken(forged)).toBeNull();
    expect(verifyWhyToken("nope")).toBeNull();
    expect(verifyWhyToken(undefined)).toBeNull();
  });
  it("labels known reasons and leads with the app sign-in problem", () => {
    expect(CANCEL_REASONS[0].id).toBe("no-app");
    expect(reasonLabel("price")).toBe("It's too expensive");
  });
});
