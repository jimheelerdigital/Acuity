import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_EMERGING_THEMES,
  MIN_ENTRIES_FOR_PEEK,
  MIN_ENTRIES_PER_THEME,
  emergingPatternsCopy,
  selectEmergingThemes,
  type EmergingTheme,
} from "./emerging-patterns";

/**
 * Feature #3 Phase A — the emerging-patterns early peek.
 *
 * The show/hide rules matter more than the rendering here. This card sits
 * in the gap before the Theme Map unlocks, so it has two ways to be
 * wrong: appearing when it shouldn't (nagging a 1-entry account, or
 * duplicating the real map once that unlocks), and claiming more than two
 * entries can support.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(REPO, ...p), "utf8");

const t = (label: string, entryCount: number): EmergingTheme => ({
  label,
  entryCount,
});

const BASE = {
  entriesCount: 4,
  themeMapUnlocked: false,
  themes: [t("sleep", 3), t("work stress", 2)],
};

describe("selectEmergingThemes — when the card appears", () => {
  it("shows once there are 2+ entries and a theme seen twice", () => {
    expect(selectEmergingThemes(BASE)).toHaveLength(2);
  });

  it("shows at exactly the 2-entry floor", () => {
    expect(
      selectEmergingThemes({ ...BASE, entriesCount: MIN_ENTRIES_FOR_PEEK })
    ).toHaveLength(2);
  });
});

describe("selectEmergingThemes — when it must stay hidden", () => {
  it("hides below 2 entries", () => {
    for (const n of [0, 1]) {
      expect(
        selectEmergingThemes({ ...BASE, entriesCount: n }),
        `${n} entries must render nothing`
      ).toEqual([]);
    }
  });

  it("hides once the real Theme Map unlocks — the map replaces it", () => {
    // Showing both would present the same data twice at two different
    // confidence levels, with the weaker one higher up the page.
    expect(
      selectEmergingThemes({ ...BASE, themeMapUnlocked: true })
    ).toEqual([]);
  });

  it("hides when no theme has been seen in 2+ entries yet", () => {
    // The "render nothing" case from the brief: enough entries, but no
    // repetition. No empty state, no nag.
    expect(
      selectEmergingThemes({
        ...BASE,
        themes: [t("sleep", 1), t("work stress", 1)],
      })
    ).toEqual([]);
  });

  it("hides when the user has no themes at all (e.g. a FREE account)", () => {
    // FREE entries never run extraction, so they produce no ThemeMention
    // rows. This is the path that keeps the card PRO-only without a
    // separate entitlement check.
    expect(selectEmergingThemes({ ...BASE, themes: [] })).toEqual([]);
  });

  it("unlock wins over entry count — both gates are checked", () => {
    expect(
      selectEmergingThemes({
        entriesCount: 50,
        themeMapUnlocked: true,
        themes: [t("sleep", 20)],
      })
    ).toEqual([]);
  });
});

describe("selectEmergingThemes — what it selects", () => {
  it("drops themes below the per-theme floor", () => {
    const out = selectEmergingThemes({
      ...BASE,
      themes: [t("sleep", 3), t("one-off", 1)],
    });
    expect(out.map((x) => x.label)).toEqual(["sleep"]);
    expect(MIN_ENTRIES_PER_THEME).toBe(2);
  });

  it("shows at most two — a hint, not a list", () => {
    const out = selectEmergingThemes({
      ...BASE,
      themes: [t("a", 5), t("b", 4), t("c", 3), t("d", 2)],
    });
    expect(out).toHaveLength(MAX_EMERGING_THEMES);
    expect(out.map((x) => x.label)).toEqual(["a", "b"]);
  });

  it("orders by entry count, then alphabetically for a stable tie-break", () => {
    const out = selectEmergingThemes({
      ...BASE,
      themes: [t("zebra", 2), t("apple", 2)],
    });
    expect(out.map((x) => x.label)).toEqual(["apple", "zebra"]);
  });

  it("ignores blank labels rather than rendering an empty pill", () => {
    const out = selectEmergingThemes({
      ...BASE,
      themes: [t("   ", 4), t("sleep", 2)],
    });
    expect(out.map((x) => x.label)).toEqual(["sleep"]);
  });
});

describe("emergingPatternsCopy — hedged, and quoting no numbers", () => {
  it("returns null when there is nothing to say", () => {
    expect(emergingPatternsCopy([])).toBeNull();
    expect(emergingPatternsCopy([t("  ", 3)])).toBeNull();
  });

  it("sentence-cases the opening label without mangling the rest", () => {
    // Theme names are stored lowercase by normalizeThemeName, so an
    // un-cased opener reads as a rendering bug. Inner characters must
    // survive: "self-care" and "9-to-5" keep their structure.
    expect(emergingPatternsCopy([t("sleep", 3)])).toMatch(/^Sleep has come up/);
    expect(emergingPatternsCopy([t("self-care", 3)])).toMatch(
      /^Self-care has come up/
    );
    // A label in second position is mid-sentence — leave it alone.
    expect(emergingPatternsCopy([t("money", 4), t("sleep", 2)])).toContain(
      "and sleep have each"
    );
  });

  it("hedges a single theme without asserting a pattern", () => {
    const copy = emergingPatternsCopy([t("sleep", 4)])!;
    // Case-insensitive: the opening label is sentence-cased.
    expect(copy).toMatch(/sleep/i);
    expect(copy).toMatch(/might be nothing/i);
    expect(copy).toMatch(/it's early/i);
  });

  it("hedges two themes", () => {
    const copy = emergingPatternsCopy([t("sleep", 4), t("work stress", 2)])!;
    expect(copy).toMatch(/sleep/i);
    expect(copy).toContain("work stress");
    expect(copy).toMatch(/too early|it's early/i);
  });

  it("never quotes a count — no number-flex", () => {
    // "seen 4 times" claims precision two entries have not earned, and
    // turns a gentle observation into a scoreboard.
    for (const themes of [
      [t("sleep", 4)],
      [t("sleep", 9), t("money", 3)],
    ]) {
      const copy = emergingPatternsCopy(themes)!;
      expect(copy, `"${copy}" must contain no digits`).not.toMatch(/\d/);
    }
  });

  it("gives no advice and issues no imperative", () => {
    const copy = emergingPatternsCopy([t("sleep", 4), t("money", 2)])!;
    for (const bad of [
      "you should",
      "try to",
      "consider",
      "make sure",
      "keep it up",
      "record",
    ]) {
      expect(copy.toLowerCase(), `must not say "${bad}"`).not.toContain(bad);
    }
  });

  it("uses the approved vocabulary, not 'insights'/'intelligence'", () => {
    // DESIGN_SYSTEM.md §7.6 — memory is the product, not intelligence.
    const copy = emergingPatternsCopy([t("sleep", 4)])!;
    expect(copy).toMatch(/noticed/i);
    expect(copy).not.toMatch(/\binsight/i);
    expect(copy).not.toMatch(/\bintelligence\b/i);
  });

  it("keeps Ripple in third person, matching every other surface", () => {
    // There is no first-person Ripple voice anywhere in the product.
    const copy = emergingPatternsCopy([t("sleep", 4)])!;
    expect(copy).toContain("Ripple");
    expect(copy).not.toMatch(/\bI'm\b|\bI've\b|\bI \b/);
  });
});

describe("the unlock ladder was not touched", () => {
  it("UNLOCK_THRESHOLD is still 10", () => {
    const client = read(
      "apps",
      "web",
      "src",
      "app",
      "insights",
      "theme-map",
      "theme-map-client.tsx"
    );
    expect(client).toMatch(/const UNLOCK_THRESHOLD = 10;/);
    expect(client).toMatch(/const MIN_MENTIONS_FOR_PLANET = 2;/);
  });

  it("the themeMap progression rule is unchanged", () => {
    const prog = read("packages", "shared", "src", "userProgression.ts");
    expect(prog).toMatch(
      /themeMap: entriesCount >= 10 && themesDetected >= 3,/
    );
  });

  it("the card reads the ladder without writing to it", () => {
    const card = read(
      "apps",
      "web",
      "src",
      "app",
      "insights",
      "emerging-patterns-card.tsx"
    );
    expect(card).toContain("themeMapUnlocked");
    // Read-only surface: no writes, no extraction, no schema.
    for (const banned of ["prisma.entry.update", "prisma.theme.create", "inngest.send"]) {
      expect(card, `${banned} is out of scope`).not.toContain(banned);
    }
  });
});
