import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  AD_FORMAT_KEYS,
  AD_SLOTS,
  MEN_SLOTS,
  PHOTO_FORMATS,
  videoTemplatesForWeek,
  hookStylesForWeek,
  parseVideoAds,
  SAY_CATCH_FORMAT,
  buildAdImagePrompt,
  decodeAdCopy,
  stripAdCopy,
  parseBatchAds,
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

describe("parseBatchAds", () => {
  const ad = (over: Record<string, unknown> = {}) => ({
    theme: "t", hypothesis: "h", targetPersona: "p", valueSurface: "problem",
    headline: "Still holding everyone's to-do list?", primaryText: "x", description: "d",
    cta: "SIGN_UP", imageScene: "s", solutionLine: "Say it once.",
    benefits: ["a", "b", "c"], said: "Emma's slip is due Friday.", caught: ["x", "y", "z"],
    format: "say-catch", strategy: "explore", ...over,
  });

  it("repairs a format name in valueSurface (the 2026-09-24 women's failure)", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i === 8 ? { valueSurface: "app-proof" } : {}));
    const out = parseBatchAds(JSON.stringify(ads));
    expect(out).toHaveLength(10);
    expect(out[8].valueSurface).toBe("mechanism");
  });

  it("drops a broken ad instead of failing the batch", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i === 3 ? { caught: ["only one"] } : {}));
    expect(parseBatchAds(JSON.stringify(ads))).toHaveLength(9);
  });

  it("still fails when most ads are broken", () => {
    const ads = Array.from({ length: 10 }, (_, i) => ad(i < 6 ? { headline: undefined } : {}));
    expect(() => parseBatchAds(JSON.stringify(ads))).toThrow(/only 4 valid/);
  });
});

describe("weekly slots (2026-09-29 research rebuild)", () => {
  it("every slot uses an offered format", () => {
    for (const sl of AD_SLOTS) expect(AD_FORMAT_KEYS).toContain(sl.format);
  });
  it("a batch spans at least 6 format families with at most one photo slot", () => {
    expect(AD_SLOTS).toHaveLength(10);
    expect(new Set(AD_SLOTS.map((sl) => sl.format)).size).toBeGreaterThanOrEqual(6);
    expect(AD_SLOTS.filter((sl) => PHOTO_FORMATS.includes(sl.format)).length).toBeLessThanOrEqual(1);
  });
  it("parses text-wall and weekly-report copy", () => {
    const base = { theme: "t", hypothesis: "h", targetPersona: "p", valueSurface: "mechanism", headline: "Things only I remember", primaryText: "x", description: "d", cta: "SIGN_UP", imageScene: "n/a", solutionLine: "s", benefits: ["a", "b", "c"], said: "s", caught: ["a", "b", "c"] };
    const raw = JSON.stringify({ ads: [
      { ...base, archetype: "confession", lines: ["one", "two", "three", ""] },
      { ...base, archetype: "pattern_reveal", stats: [{ value: "14", label: "handled" }, { value: "3", label: "slipped" }, { value: "4 wks", label: "same worry" }], insight: "Money came up every Sunday." },
    ] });
    const ads = parseBatchAds(raw, 2);
    expect(ads[0].lines).toEqual(["one", "two", "three"]);
    expect(ads[1].stats).toHaveLength(3);
  });
});

describe("weekly video ads (2026-09-29)", () => {
  it("picks 3 templates a week, always including voice_to_list, rotating the rest", () => {
    const a = videoTemplatesForWeek(new Date("2026-10-04"));
    const b = videoTemplatesForWeek(new Date("2026-10-11"));
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(a[0]).toBe("voice_to_list");
    expect(a).not.toEqual(b);
  });
  it("keeps valid scripts and drops ones a template can't render", () => {
    const raw = JSON.stringify({ videos: [
      { template: "voice_to_list", theme: "t", hypothesis: "h", hook: "The list in my head", endHeadline: "Say it. Ripple sorts it.", primaryText: "p", description: "d", said: "renew the registration, email school Friday", caught: ["Renew registration", "Email school — Fri", "Came up again: you remember it all"] },
      { template: "habit_week", theme: "t", hypothesis: "h", hook: "I said I'd walk", endHeadline: "e", primaryText: "p", description: "d", habit: "Walk", days: [true, false], flag: "x" },
    ] });
    const out = parseVideoAds(raw, ["voice_to_list", "habit_week", "pattern_weeks"]);
    expect(out.map((o) => o.script.template)).toEqual(["voice_to_list"]);
  });
  it("round-trips the video script and URL through the AD_COPY tag", () => {
    const video = { template: "pattern_weeks" as const, hook: "h", endHeadline: "e", weeks: ["a x", "b x", "c x"], phrase: "x", insight: "i" };
    const prompt = buildAdImagePrompt("video-pattern_weeks", { headline: "e", description: "d", cta: "SIGN_UP", imageScene: "", video, videoUrl: "https://x/v.mp4" }, "women");
    expect(decodeAdCopy(prompt).video?.weeks).toHaveLength(3);
    expect(decodeAdCopy(prompt).videoUrl).toBe("https://x/v.mp4");
  });
});

describe("opening hook styles (2026-09-29)", () => {
  it("uses 3 different hook styles a week and rotates them", () => {
    const a = hookStylesForWeek(new Date("2026-10-04"));
    const b = hookStylesForWeek(new Date("2026-10-11"));
    expect(new Set(a).size).toBe(3);
    expect(a).not.toEqual(b);
  });
  it("falls back to a caption when a style's fields are missing", () => {
    const raw = JSON.stringify({ videos: [
      { template: "voice_to_list", hookStyle: "number", theme: "t", hypothesis: "h", hook: "things on my fridge", endHeadline: "e", openerScene: "fridge", primaryText: "p", description: "d", said: "sign the form", caught: ["a", "b", "c"] },
    ] });
    expect(parseVideoAds(raw, ["voice_to_list"])[0].script.hookStyle).toBe("caption");
  });
});

describe("Jev draft picking (2026-09-30)", () => {
  it("picks the highest-ranked viable draft, and falls back to the first without Jev", async () => {
    const { pickBest } = await import("./jev-judge");
    const v = (rank: number, viable = true) => ({ concrete: 1, clear: 1, policyRisk: viable ? 0.1 : 0.9, duplicate: 0.1, winner: rank, rank, viable });
    expect(pickBest(["a", "b", "c"], [v(0.4), v(0.9, false), v(0.7)]).item).toBe("c");
    expect(pickBest(["a", "b"], [null, null]).item).toBe("a");
    expect(pickBest(["a", "b"], [v(0.2, false), v(0.5, false)]).item).toBe("b");
  });
});

describe("men's lane slots (2026-09-30)", () => {
  it("are BWK-shaped, valid and as varied as the women's", () => {
    expect(MEN_SLOTS).toHaveLength(10);
    for (const sl of MEN_SLOTS) expect(AD_FORMAT_KEYS).toContain(sl.format);
    expect(new Set(MEN_SLOTS.map((sl) => sl.format)).size).toBeGreaterThanOrEqual(6);
    expect(MEN_SLOTS.filter((sl) => PHOTO_FORMATS.includes(sl.format)).length).toBeLessThanOrEqual(1);
    expect(MEN_SLOTS.map((s) => s.key)).toContain("scoreboard");
    expect(MEN_SLOTS.filter((s) => s.iteration)).toHaveLength(2);
  });
});
