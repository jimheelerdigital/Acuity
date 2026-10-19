import { describe, expect, it } from "vitest";
import { buildHistory, monthBanBlock, monthRepeats, optionKeys } from "./mythic-variety";

describe("mythic 30-day variety rule", () => {
  it("keys an option on element family + thing", () => {
    expect(optionKeys("3. Isvald the Frost Dragon")).toEqual({ types: ["frost dragon"], names: ["isvald"] });
    expect(optionKeys("Vex & Torran the Magma Drakes").types).toEqual(["fire dragon"]);
    expect(optionKeys("The Abyss Trident").types).toEqual(["shadow trident"]);
  });

  it("ignores size labels", () => {
    expect(optionKeys("The Storm Dragon — 60m wingspan").types).toEqual(["storm dragon"]);
  });

  it("catches synonyms and one-letter name variants", () => {
    const h = buildHistory(["Isvald the Frost Dragon", "Vorrath the Ember Dragon"]);
    const r = monthRepeats(["The Glacier Wyrm", "Vorath the Lantern Wyrm", "Zephyrax the Clockwork Dragon"], h);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain("frost dragon");
    expect(r[1]).toContain("Vorath");
  });

  it("lets genuinely new concepts through", () => {
    const h = buildHistory(["Isvald the Frost Dragon"]);
    expect(monthRepeats(["Zephyrax the Clockwork Dragon", "The Salt-Glass Trident"], h)).toEqual([]);
  });

  it("puts every used type in the prompt block", () => {
    const block = monthBanBlock(buildHistory(["Isvald the Frost Dragon", "Kael the Frost Dragon"]));
    expect(block).toContain("frost dragon (2x)");
    expect(block).toContain("Isvald");
    expect(monthBanBlock(buildHistory([]))).toBe("");
  });
});
