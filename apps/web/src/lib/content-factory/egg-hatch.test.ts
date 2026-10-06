import { describe, expect, it } from "vitest";

import {
  decodeEggPrompt,
  dragonMotionPrompt,
  eggSlug,
  encodeEggPrompt,
  isEggSlug,
  type EggConcept,
} from "./egg-hatch";
import { mythicModeFromSlug } from "./performance-loop";

const concept: EggConcept = {
  name: "THE GLACIER DRAKE",
  element: "ice",
  egg: "A pale blue crystalline egg in a nest of shattered glacier ice, frost-blue cracks glowing.",
  dragon: "A silver-white drake with frost-rimmed scales and translucent ice-blue wings, frost drifting off its horns.",
  breath: "ice",
  captionQuestion: "Would you raise it, or run?",
};

describe("egg hatching", () => {
  it("slugs are recognised as egg posts and as the egg post type", () => {
    const slug = eggSlug(concept.name);
    expect(slug).toBe("mythic-egg-the-glacier-drake");
    expect(isEggSlug(slug)).toBe(true);
    expect(isEggSlug("mythic-cinematic-x")).toBe(false);
    expect(mythicModeFromSlug(slug)).toBe("egg");
  });

  it("round-trips the stored concept", () => {
    const d = decodeEggPrompt(encodeEggPrompt(concept, "egg prompt"));
    expect(d).toEqual({ name: "THE GLACIER DRAKE", element: "ice", breath: "ice" });
  });

  it("only breathes the concept's element and asks for sound", () => {
    const p = dragonMotionPrompt(concept);
    expect(p).toContain("ice breath");
    expect(p).not.toContain("burst of fire");
    expect(p).toContain("roar");
  });
});
