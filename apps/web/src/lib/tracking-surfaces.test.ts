import { describe, expect, it } from "vitest";

import { isPrivateAppSurface } from "./tracking-surfaces";

describe("isPrivateAppSurface", () => {
  it("blocks the signed-in journal", () => {
    for (const p of ["/home", "/entries/abc", "/insights", "/support/crisis", "/onboarding", "/account"]) expect(isPrivateAppSurface(p)).toBe(true);
  });
  it("keeps funnels and marketing tracked", () => {
    for (const p of ["/", "/start", "/start-bwk", "/start-test", "/for/anxiety", "/upgrade", "/blog/x", "/homework"]) expect(isPrivateAppSurface(p)).toBe(false);
  });
});
