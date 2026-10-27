import { describe, expect, it } from "vitest";

import { compareVersions, isPublished, releaseSlug } from "./published";

describe("release-note pages are public only once users can get the update", () => {
  it("compares versions numerically", () => {
    expect(compareVersions("1.9.6", "1.9.5")).toBe(1);
    expect(compareVersions("1.10", "1.9.6")).toBe(1);
    expect(compareVersions("1.9.6", "1.9.6")).toBe(0);
    expect(compareVersions("1.9", "1.9.0")).toBe(0);
  });

  it("hides an iOS version the App Store isn't serving yet", () => {
    expect(isPublished({ version: "1.9.6", platform: "ios" }, "1.9.5")).toBe(false);
    expect(isPublished({ version: "1.9.5", platform: "ios" }, "1.9.5")).toBe(true);
    expect(isPublished({ version: "1.9.5", platform: "ios" }, "1.9.6")).toBe(true);
  });

  it("hides iOS releases when the lookup fails, but previews show everything", () => {
    expect(isPublished({ version: "1.9.5", platform: "ios" }, null)).toBe(false);
    expect(isPublished({ version: "1.9.6", platform: "ios" }, "1.9.5", true)).toBe(true);
  });

  it("always shows Android (no public lookup) and suffixes its slug", () => {
    expect(isPublished({ version: "1.9.0", platform: "android" }, null)).toBe(true);
    expect(releaseSlug({ version: "1.9.0", platform: "android" })).toBe("1.9.0-android");
    expect(releaseSlug({ version: "1.9.6", platform: "ios" })).toBe("1.9.6");
  });
});
