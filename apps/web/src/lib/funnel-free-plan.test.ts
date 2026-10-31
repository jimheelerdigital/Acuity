import { describe, expect, it } from "vitest";

import { isWebFunnelPath } from "./funnel-free-plan";

describe("isWebFunnelPath", () => {
  it("matches the web funnels", () => {
    for (const p of ["/start", "/start/", "/start-bwk", "/start-test", "/start-test-bwk", "/start-planner", "/start-test?utm_source=fb"]) {
      expect(isWebFunnelPath(p)).toBe(true);
    }
  });
  it("ignores everything else", () => {
    for (const p of [undefined, null, "", "/signup", "/", "/starter", "/start-test/../signup", "/for/anxiety", "https://goripple.io/start"]) {
      expect(isWebFunnelPath(p)).toBe(false);
    }
  });
});
