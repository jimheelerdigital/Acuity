import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.NEXTAUTH_SECRET = "test-secret";

import { signHandoff, verifyHandoff } from "./checkout-handoff";

describe("checkout handoff pass", () => {
  afterEach(() => vi.useRealTimers());
  it("round-trips the user id", () => {
    expect(verifyHandoff(signHandoff("cmuser123"))).toBe("cmuser123");
  });
  it("rejects a tampered pass", () => {
    const t = signHandoff("cmuser123");
    const forged = Buffer.from("cmattacker.9999999999999").toString("base64url") + "." + t.split(".")[1];
    expect(verifyHandoff(forged)).toBeNull();
    expect(verifyHandoff(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyHandoff("garbage")).toBeNull();
    expect(verifyHandoff(null)).toBeNull();
  });
  it("expires after 2 hours", () => {
    vi.useFakeTimers();
    const t = signHandoff("cmuser123");
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1000);
    expect(verifyHandoff(t)).toBeNull();
  });
});
