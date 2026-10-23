/**
 * 1.9.6 What's New (2026-10-23): calendar connect, the task-group card,
 * Manage groups. Must ship in the binary (decided on first launch).
 * No unmeasured claims: "faster entries" stays out until the processing
 * speed-up is measured.
 */
import { describe, expect, it } from "vitest";

import { releaseFor, WHATS_NEW_RELEASES } from "../../../../mobile/lib/whats-new-content";

describe("What's New 1.9.6", () => {
  it("is the newest entry and matches the app version", async () => {
    expect(WHATS_NEW_RELEASES[0].version).toBe("1.9.6");
    const app = JSON.parse((await import("node:fs")).readFileSync(require("node:path").resolve(__dirname, "../../../../mobile/app.json"), "utf8"));
    expect(app.expo.version).toBe("1.9.6");
  });

  it("covers calendar and task groups; the Siri card is iOS-only", () => {
    const ids = WHATS_NEW_RELEASES[0].items.map((i) => i.id);
    expect(ids).toEqual(["calendar-connect", "task-group-card", "manage-groups"]);
    expect(releaseFor("1.9.6", "android")!.items.map((i) => i.id)).not.toContain("task-group-card");
  });

  it("makes no speed claim and no plumbing talk", () => {
    const copy = JSON.stringify(WHATS_NEW_RELEASES[0]);
    expect(copy).not.toMatch(/faster|sooner|revenuecat|analytics|inngest|eventkit/i);
  });
});
