/**
 * 1.9.5 What's New (2026-10-22). App Store users upgrade 1.9.3 → 1.9.5
 * (1.9.4 never shipped), so the 1.9.5 entry must exist, be newest, and
 * cover the notable features with tour stops. No billing / analytics
 * plumbing in user-facing copy (Jimmy: "Rev Cat is obviously not something
 * we'd promote to end users").
 *
 * The entry has to be in the BINARY: the sheet decides on first launch of a
 * new version, before an over-the-air update can apply.
 */
import { describe, expect, it } from "vitest";

import { WHATS_NEW_RELEASES } from "../../../../mobile/lib/whats-new-content";
import { cardForItem, fullTour } from "../../../../mobile/components/tour/whats-new-tour";
import { TOUR_STEP_INDEX, WHATS_NEW_STEP_INDEX } from "../../../../mobile/components/tour/steps";

const r195 = WHATS_NEW_RELEASES.find((r) => r.version === "1.9.5");
const ctx = { hasOpenTasks: true, hasTaskRow: true };

describe("What's New 1.9.5", () => {
  it("exists and is the newest entry", () => {
    expect(r195).toBeTruthy();
    expect(WHATS_NEW_RELEASES[0].version).toBe("1.9.5");
  });

  it("covers the notable features", () => {
    const ids = r195!.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["type-or-snap", "widget-checkoff", "siri-due-dates", "roadmap"]));
  });

  it("tour stops resolve to real spotlight targets", () => {
    const byId = Object.fromEntries(r195!.items.map((i) => [i.id, cardForItem(i, ctx)]));
    expect(byId["type-or-snap"]?.target).toBe(TOUR_STEP_INDEX.mic);
    expect(byId["widget-checkoff"]?.target).toBe(WHATS_NEW_STEP_INDEX.widgets);
    expect(byId["siri-due-dates"]?.target).toBe(WHATS_NEW_STEP_INDEX.actionButton);
    const tour = fullTour(r195!.items, ctx);
    expect(tour.cards.length).toBe(4); // 3 stops + closing card
  });

  it("says nothing about billing plumbing or analytics", () => {
    const copy = JSON.stringify(r195);
    expect(copy).not.toMatch(/revenuecat|revenue cat|analytics|install id|meta sdk|tracking/i);
  });
});
