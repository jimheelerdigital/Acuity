import { describe, it, expect } from "vitest";
import {
  CINEMATIC_FORMATS,
  CINEMATIC_PERSPECTIVES,
  buildCinematicHiddenPrompt,
  cinematicModels,
  cinematicSlug,
  decodeCinematicPrompt,
  encodeCinematicPrompt,
  isCinematicSlug,
  pickPerspectives,
  type CinematicConcept,
} from "./cinematic-shot";
import { mythicModeFromSlug } from "./performance-loop";

// 2026-10-04: the mythic-colossus lane's daily cinematic shot; the video
// builder reads its motion prompt back off the cover slide.
const concept: CinematicConcept = {
  title: "THE WATCHER IN THE FOG",
  creature: "ancient slate-blue dragon",
  size: "head the size of a cathedral",
  location: "volcanic cliff in fog",
  perspective: "from low behind the tiny human",
  still: "A colossal dragon head in fog facing a tiny man on a lava cliff.",
  hidden: "a wall of dense blue-grey fog, a faint vast shadow inside it",
  motion: "The drone glides down.\nThe eyelid opens.\nSound: wind, a deep rumble. No dialogue, no text.",
  captionQuestion: "Would you stay on that ridge?",
};

describe("cinematic shot", () => {
  it("round-trips the stored prompt, including a multi-line motion", () => {
    const d = decodeCinematicPrompt(
      encodeCinematicPrompt(concept, "STILL PROMPT", { start: "https://x/start.jpg", end: "https://x/end.jpg" })
    );
    expect(d.startFrame).toBe("https://x/start.jpg");
    expect(d.endFrame).toBe("https://x/end.jpg");
    expect(decodeCinematicPrompt(encodeCinematicPrompt(concept, "S")).startFrame).toBeNull();
    expect(d.creature).toBe("ancient slate-blue dragon (head the size of a cathedral)");
    expect(d.perspective).toBe("from low behind the tiny human");
    expect(d.motion).toBe(concept.motion);
  });

  it("slugs are recognized and count as their own post type", () => {
    const slug = cinematicSlug("THE MOUNTAIN WAKES!");
    expect(slug).toBe("mythic-cinematic-the-mountain-wakes");
    expect(isCinematicSlug(slug)).toBe(true);
    expect(isCinematicSlug("mythic-size-how-big")).toBe(false);
    expect(mythicModeFromSlug(slug)).toBe("cinematic");
  });

  it("picks distinct perspectives and avoids recent ones", () => {
    const recent = CINEMATIC_PERSPECTIVES.slice(0, 4);
    const picked = pickPerspectives(recent, 4, () => 0.3);
    expect(new Set(picked).size).toBe(4);
    for (const p of picked) expect(recent).not.toContain(p);
  });

  it("has a disguise edit for never-a-mountain and a removal edit otherwise", () => {
    expect(buildCinematicHiddenPrompt(concept, "never-a-mountain")).toMatch(/disguise/);
    expect(buildCinematicHiddenPrompt(concept, "encounter")).toMatch(/remove/);
    expect(CINEMATIC_FORMATS.bond.reveal).toBe(false);
  });

  it("leads with 4K and falls back to pro", () => {
    delete process.env.CINEMATIC_QUALITY;
    expect(cinematicModels()).toEqual(["kling-video/v3.0/4k/image-to-video", "kling-video/v3.0/pro/image-to-video"]);
    process.env.CINEMATIC_QUALITY = "pro";
    expect(cinematicModels()).toEqual(["kling-video/v3.0/pro/image-to-video"]);
    delete process.env.CINEMATIC_QUALITY;
  });
});
