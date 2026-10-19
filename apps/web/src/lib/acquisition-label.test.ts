import { describe, expect, it } from "vitest";
import { acquisitionLabel } from "./acquisition-label";

describe("acquisitionLabel", () => {
  it("splits UGC Meta ads from the creator's own Instagram", () => {
    expect(acquisitionLabel({ source: "ugc", medium: "creator", campaign: "ugc-therapyandthings", content: "video1" })).toBe(
      "UGC Meta ad · @therapyandthings · video1"
    );
    expect(acquisitionLabel({ source: "ugc", medium: "creator", campaign: "ugc-therapyandthings", content: null })).toBe(
      "UGC organic · @therapyandthings's Instagram"
    );
  });
  it("keeps the old label for everything else", () => {
    expect(acquisitionLabel({ source: "meta", medium: "paid", content: "abc" })).toBe("meta / paid");
    expect(acquisitionLabel({ source: null })).toBe("direct");
  });
});
