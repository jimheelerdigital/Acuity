/**
 * What's New catch-up (1.9.6): someone who skipped releases sees everything
 * new since the version they last saw, not just the newest release.
 * (Before: 1.9.3 → 1.9.6 only showed 1.9.6's three items.)
 */
import { describe, expect, it } from "vitest";

import {
  catchUpRelease,
  MAX_CATCH_UP_RELEASES,
  WHATS_NEW_RELEASES,
} from "../../../../mobile/lib/whats-new-content";
import { compareVersion } from "../../../../mobile/lib/semver";

const ids = (from: string, current: string, p: "ios" | "android" = "ios") =>
  catchUpRelease(from, current, p)?.items.map((i) => i.id) ?? null;

const own = (v: string, p: "ios" | "android" = "ios") =>
  WHATS_NEW_RELEASES.find((r) => r.version === v)!
    .items.filter((i) => !i.platform || i.platform === p)
    .map((i) => i.id);

describe("What's New catch-up", () => {
  it("one-release update shows just that release", () => {
    expect(ids("1.9.5", "1.9.6")).toEqual(own("1.9.6"));
  });

  it("1.9.3 → 1.9.6 includes 1.9.5's items after 1.9.6's", () => {
    expect(ids("1.9.3", "1.9.6")).toEqual([...own("1.9.6"), ...own("1.9.5")]);
  });

  it("labels the combined release with the running version", () => {
    expect(catchUpRelease("1.9.3", "1.9.6", "ios")!.version).toBe("1.9.6");
  });

  it("never includes releases newer than the running build", () => {
    expect(ids("1.9.3", "1.9.5")).toEqual(own("1.9.5"));
  });

  it("filters by platform", () => {
    const android = ids("1.9.3", "1.9.6", "android")!;
    expect(android).not.toContain("task-group-card");
    expect(android).not.toContain("widget-checkoff");
    expect(android).toContain("calendar-connect");
  });

  it("caps very old upgrades at the newest few releases", () => {
    const from0 = catchUpRelease("0.0.0", "1.9.6", "ios")!.items.map((i) => i.id);
    const newest = [...WHATS_NEW_RELEASES]
      .sort((a, b) => compareVersion(b.version, a.version))
      .slice(0, MAX_CATCH_UP_RELEASES)
      .flatMap((r) => own(r.version));
    expect(from0).toEqual(newest);
  });

  it("item ids are unique across the result", () => {
    const all = ids("0.0.0", "1.9.6")!;
    expect(new Set(all).size).toBe(all.length);
  });

  it("nothing new → null", () => {
    expect(catchUpRelease("1.9.6", "1.9.6", "ios")).toBeNull();
  });
});
