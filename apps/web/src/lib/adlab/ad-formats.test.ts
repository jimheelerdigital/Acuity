import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  AD_FORMAT_KEYS,
  SAY_CATCH_FORMAT,
  buildAdImagePrompt,
  decodeAdCopy,
  stripAdCopy,
} from "./weekly-batch";

// 2026-09-24: every ad carries the pain → fix bridge; the extra copy rides
// in the stored prompt and must never reach the image model.
const copy = {
  headline: "Still holding everyone's to-do list?",
  description: "7-day free trial.",
  cta: "SIGN_UP",
  imageScene: "A kitchen counter buried in permission slips at 11pm.",
  solutionLine: "Say it once. Ripple turns it into your to-do list.",
  benefits: ["Tasks pulled from what you say", "Reminders you didn't have to set", "A week you can actually see"],
  said: "Emma's slip is due Friday and I need to call about Mom's refill.",
  caught: ["Sign Emma's slip — Friday", "Call about Mom's refill", "Third week: no time for you"],
};

describe("ad formats v2", () => {
  it("offers say-catch and retires app-in-scene", () => {
    expect(AD_FORMAT_KEYS).toContain(SAY_CATCH_FORMAT);
    expect(AD_FORMAT_KEYS).not.toContain("app-in-scene");
  });

  it("round-trips the extra copy and strips it before the image model", () => {
    const prompt = buildAdImagePrompt("hook-overlay", copy, "women");
    expect(decodeAdCopy(prompt)).toMatchObject({ said: copy.said, caught: copy.caught, benefits: copy.benefits });
    const clean = stripAdCopy(prompt);
    expect(clean).not.toContain("[[AD_COPY");
    expect(clean).toContain(copy.solutionLine);
  });

  it("checklist formats use this ad's benefits, not the fixed group props", () => {
    const prompt = stripAdCopy(buildAdImagePrompt("notes-app", copy, "women"));
    for (const b of copy.benefits) expect(prompt).toContain(b);
  });

  it("old creatives without the new fields still build", () => {
    const { solutionLine, benefits, said, caught, ...old } = copy;
    void solutionLine; void benefits; void said; void caught;
    const prompt = stripAdCopy(buildAdImagePrompt("statement-card", old, "men"));
    expect(prompt).toContain(old.description);
  });
});
