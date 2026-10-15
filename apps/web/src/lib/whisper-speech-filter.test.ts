import { describe, expect, it } from "vitest";

import { filterWhisperVerbose, isLikelyHallucinated } from "./whisper-speech-filter";

describe("whisper speech filter", () => {
  it("keeps confident speech", () => {
    const r = filterWhisperVerbose({
      duration: 12,
      segments: [
        { text: " I need to mow the lawn", no_speech_prob: 0.01, avg_logprob: -0.2, compression_ratio: 1.2 },
        { text: " and call the dentist.", no_speech_prob: 0.02, avg_logprob: -0.3, compression_ratio: 1.1 },
      ],
    });
    expect(r.text).toBe("I need to mow the lawn and call the dentist.");
    expect(r.dropped).toBe(0);
  });

  it("drops a segment Whisper invented from silence (Whisper's own rule)", () => {
    const r = filterWhisperVerbose({
      duration: 3,
      segments: [{ text: " I need to have better days.", no_speech_prob: 0.82, avg_logprob: -1.4, compression_ratio: 1.0 }],
    });
    expect(r.text).toBe("");
    expect(r.dropped).toBe(1);
  });

  it("keeps quiet-but-confident speech (high no_speech but good logprob)", () => {
    expect(isLikelyHallucinated({ text: "hi", no_speech_prob: 0.7, avg_logprob: -0.4 })).toBe(false);
  });

  it("drops looping text", () => {
    expect(isLikelyHallucinated({ text: "Thank you. Thank you. Thank you.", compression_ratio: 3.1 })).toBe(true);
  });

  it("drops everything from audio too short to be a debrief", () => {
    const r = filterWhisperVerbose({ duration: 1.1, segments: [{ text: " Hello there.", no_speech_prob: 0.1, avg_logprob: -0.2 }] });
    expect(r.text).toBe("");
  });

  it("passes plain-text responses through unchanged", () => {
    expect(filterWhisperVerbose("  hello world ").text).toBe("hello world");
  });
});
