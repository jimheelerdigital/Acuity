import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PATTERN_INSIGHTS_MIN_ENTRIES,
  THEME_MAP_MIN_ENTRIES,
  THEME_MAP_MIN_THEMES,
  lockedFeatureCopy,
  userProgression,
} from "@acuity/shared";

/**
 * Pins the unlock ladder Jimmy lowered on 2026-10-27 (Pattern Insights
 * 7 → 5 entries, Theme Map 10 → 7 entries + 3 themes). If one of these
 * changes, every surface that quotes the number has to change with it.
 */
const NOW = new Date("2026-10-27T12:00:00Z");

function progressionWith(entries: number, themes: number) {
  return userProgression({
    now: NOW,
    user: { id: "u1", createdAt: new Date("2026-10-01T12:00:00Z") },
    entries: Array.from({ length: entries }, (_, i) => ({
      id: `e${i}`,
      createdAt: new Date(NOW.getTime() - i * 3_600_000),
      dimensionId: null,
    })),
    themes: Array.from({ length: themes }, (_, i) => ({ id: `t${i}` })),
    goals: [],
  });
}

describe("unlock thresholds", () => {
  it("are 5 entries for Pattern Insights and 7 entries + 3 themes for the Theme Map", () => {
    expect(PATTERN_INSIGHTS_MIN_ENTRIES).toBe(5);
    expect(THEME_MAP_MIN_ENTRIES).toBe(7);
    expect(THEME_MAP_MIN_THEMES).toBe(3);
  });

  it("unlock Pattern Insights at exactly 5 entries", () => {
    expect(progressionWith(4, 0).unlocked.patternInsights).toBe(false);
    expect(progressionWith(5, 0).unlocked.patternInsights).toBe(true);
  });

  it("unlock the Theme Map at 7 entries only once 3 themes exist", () => {
    expect(progressionWith(6, 5).unlocked.themeMap).toBe(false);
    expect(progressionWith(7, 2).unlocked.themeMap).toBe(false);
    expect(progressionWith(7, 3).unlocked.themeMap).toBe(true);
  });

  it("locked-card copy and progress quote the same numbers", () => {
    const pi = lockedFeatureCopy("patternInsights", progressionWith(2, 0));
    expect(pi.body).toContain("2 of 5");
    expect(pi.progress).toEqual({ current: 2, target: 5 });
    const tm = lockedFeatureCopy("themeMap", progressionWith(4, 0));
    expect(tm.body).toContain("7 entries");
    expect(tm.progress).toEqual({ current: 4, target: 7 });
  });

  it("Theme Map screens (web + mobile) read the shared constant, not a literal", () => {
    const REPO = join(__dirname, "..", "..", "..", "..");
    for (const f of [
      "apps/web/src/app/insights/theme-map/theme-map-client.tsx",
      "apps/mobile/app/insights/theme-map.tsx",
      "apps/web/src/components/theme-map/LockedState.tsx",
      "apps/mobile/components/theme-map/LockedState.tsx",
    ]) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src, f).toContain("THEME_MAP_MIN_ENTRIES");
      expect(src, f).not.toMatch(/UNLOCK_THRESHOLD = 10|of 10 entries|Math\.max\(0, 10 - count\)/);
    }
  });
});
