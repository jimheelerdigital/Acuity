import { describe, expect, it, beforeAll } from "vitest";

import { lessonSignature, verifyLessonSignature } from "./playbook";
import { parseVideoUrl } from "./watch";

describe("parseVideoUrl", () => {
  it("canonicalizes YouTube links", async () => {
    expect(await parseVideoUrl("https://youtu.be/abc123?si=x")).toEqual({ url: "https://www.youtube.com/watch?v=abc123", platform: "youtube" });
    expect(await parseVideoUrl("https://m.youtube.com/watch?v=abc123&t=4")).toEqual({ url: "https://www.youtube.com/watch?v=abc123", platform: "youtube" });
    expect(await parseVideoUrl("https://youtube.com/shorts/Ab_c-1?feature=share")).toEqual({ url: "https://www.youtube.com/shorts/Ab_c-1", platform: "youtube" });
  });
  it("finds Instagram links inside shared text", async () => {
    expect(await parseVideoUrl("look https://www.instagram.com/reel/DAbc/?igsh=1 wow")).toEqual({ url: "https://www.instagram.com/reel/DAbc/", platform: "instagram" });
    expect(await parseVideoUrl("https://instagram.com/someone/reels/DAbc/")).toEqual({ url: "https://www.instagram.com/reel/DAbc/", platform: "instagram" });
  });
  it("strips TikTok tracking params", async () => {
    expect(await parseVideoUrl("https://www.tiktok.com/@a.b/video/123?is_from_webapp=1")).toEqual({ url: "https://www.tiktok.com/@a.b/video/123", platform: "tiktok" });
  });
  it("rejects anything else", async () => {
    expect(await parseVideoUrl("https://example.com/v/1")).toBeNull();
    expect(await parseVideoUrl("https://www.youtube.com/@channel")).toBeNull();
    expect(await parseVideoUrl("no link here")).toBeNull();
  });
});

describe("lesson approval links", () => {
  beforeAll(() => {
    process.env.VIDEO_INBOX_SECRET = "test-secret";
  });
  it("accepts its own signature and nothing else", () => {
    const sig = lessonSignature("lesson1", "approve");
    expect(verifyLessonSignature("lesson1", "approve", sig)).toBe(true);
    expect(verifyLessonSignature("lesson1", "reject", sig)).toBe(false);
    expect(verifyLessonSignature("lesson2", "approve", sig)).toBe(false);
    expect(verifyLessonSignature("lesson1", "approve", "nope")).toBe(false);
  });
});
