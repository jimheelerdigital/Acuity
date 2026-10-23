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
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { WHATS_NEW_RELEASES } from "../../../../mobile/lib/whats-new-content";
import { cardForItem, fullTour } from "../../../../mobile/components/tour/whats-new-tour";
import { WHATS_NEW_STEP_INDEX } from "../../../../mobile/components/tour/steps";

const r195 = WHATS_NEW_RELEASES.find((r) => r.version === "1.9.5");
const ctx = { hasOpenTasks: true, hasTaskRow: true };

describe("What's New 1.9.5", () => {
  it("exists", () => {
    expect(r195).toBeTruthy();
  });

  it("covers the notable features", () => {
    const ids = r195!.items.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["type-or-snap", "widget-checkoff", "siri-due-dates", "roadmap"]));
  });

  it("tour stops resolve to real spotlight targets", () => {
    const byId = Object.fromEntries(r195!.items.map((i) => [i.id, cardForItem(i, ctx)]));
    // Screen stop on /record (the real button), not the Home button.
    expect(byId["type-or-snap"]?.screen).toBe("record");
    expect(byId["widget-checkoff"]?.target).toBe(WHATS_NEW_STEP_INDEX.widgets);
    expect(byId["siri-due-dates"]?.target).toBe(WHATS_NEW_STEP_INDEX.actionButton);
    const tour = fullTour(r195!.items, ctx);
    expect(tour.cards.length).toBe(4); // 3 stops + closing card
  });

  it("says nothing about billing plumbing or analytics", () => {
    const copy = JSON.stringify(r195);
    expect(copy).not.toMatch(/revenuecat|revenue cat|analytics|install id|meta sdk|tracking/i);
  });

  // Jimmy 10/22: the Setup stop sat at the bottom of the screen, and the
  // type-or-snap stop only described how to reach the feature.
  const mobile = (p: string) => readFileSync(resolve(__dirname, "../../../../mobile", p), "utf8");

  it("Setup stops scroll their card into view before the spotlight measures", () => {
    const setup = mobile("app/setup.tsx");
    expect(setup).toMatch(/registerTourScroll\(\s*WHATS_NEW_STEP_INDEX\.actionButton/);
    expect(setup).toMatch(/registerTourScroll\(\s*WHATS_NEW_STEP_INDEX\.widgets/);
    expect(setup).toMatch(/<ScrollView ref=\{scrollRef\}/);
    const provider = mobile("components/tour/TourProvider.tsx");
    expect(provider).toMatch(/await goToPath\([^)]*\);\s*\/\/[^\n]*\n[^\n]*\n\s*await runTourScroll\(idx\)/);
  });

  it("type-or-snap opens /record and rings the real Type it instead button", () => {
    const provider = mobile("components/tour/TourProvider.tsx");
    expect(provider).toMatch(/card\.screen === "record"/);
    expect(provider).toMatch(/router\.push\("\/record"/);
    const record = mobile("app/record.tsx");
    expect(record).toMatch(/useWhatsNewScreenStop\(\)/);
    expect(record).toMatch(/coach=\{tourStop !== null\}/);
    expect(record).toMatch(/<CoachRing active=\{coach\}>/);
    // Leaving /record mid-stop ends the tour instead of stranding it.
    expect(record).toMatch(/useEffect\(\(\) => \(\) => tourScreenGoneRef\.current\(\), \[\]\)/);
    // The tour starts through the provider so a first-card screen stop works.
    expect(mobile("components/tour/use-whats-new-tour.ts")).toMatch(/showWhatsNewCard\(0\)/);
  });
});
