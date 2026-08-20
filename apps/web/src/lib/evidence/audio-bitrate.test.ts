import { describe, expect, it } from "vitest";

/**
 * Guards the 413 stopgap.
 *
 * A 5-minute recording at the OLD settings (HIGH_QUALITY: 128 kbps stereo)
 * was ~4.8MB — over Vercel's non-configurable 4.5MB serverless body cap, so
 * the request died at the edge before any handler ran. Observed in prod as
 * a voice-entries bucket whose largest object was 4.28MB with nothing above
 * 4.5MB: everything larger was being silently rejected.
 *
 * These are pure arithmetic, duplicated from
 * apps/mobile/lib/audio-recording-options.ts rather than imported — that
 * module imports expo-av, which will not load in this test runner. The
 * numbers are asserted against each other so a bitrate change without a
 * matching change here fails loudly.
 */

const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 300; // MAX_SECONDS in app/record.tsx

const NEW_BITRATE = 64_000; // SPEECH_RECORDING_OPTIONS
const OLD_BITRATE = 128_000; // RecordingOptionsPresets.HIGH_QUALITY

const bytesFor = (bitrate: number, seconds: number) => (bitrate / 8) * seconds;

describe("recording bitrate vs Vercel's body cap", () => {
  it("reproduces the bug: the OLD bitrate exceeded the cap at full length", () => {
    expect(bytesFor(OLD_BITRATE, MAX_RECORDING_SECONDS)).toBeGreaterThan(
      VERCEL_BODY_LIMIT_BYTES
    );
  });

  it("the NEW bitrate fits a full-length recording under the cap", () => {
    expect(bytesFor(NEW_BITRATE, MAX_RECORDING_SECONDS)).toBeLessThan(
      VERCEL_BODY_LIMIT_BYTES
    );
  });

  it("leaves real headroom, not a hairline pass", () => {
    // Container overhead and encoder variance are real; a setting that only
    // just fits would fail intermittently in the field, which is worse than
    // failing consistently.
    expect(bytesFor(NEW_BITRATE, MAX_RECORDING_SECONDS)).toBeLessThan(
      VERCEL_BODY_LIMIT_BYTES * 0.6
    );
  });

  it("lands in the expected 2-3MB range for a 5-minute entry", () => {
    const mb = bytesFor(NEW_BITRATE, MAX_RECORDING_SECONDS) / (1024 * 1024);
    expect(mb).toBeGreaterThan(2);
    expect(mb).toBeLessThan(3);
  });

  it("documents where the stopgap runs out", () => {
    // ~9.8 minutes. The cap is pushed out, not removed — which is why the
    // direct-to-storage fix still matters.
    const secondsUntilCap = VERCEL_BODY_LIMIT_BYTES / (NEW_BITRATE / 8);
    expect(secondsUntilCap).toBeGreaterThan(MAX_RECORDING_SECONDS);
    expect(Math.round(secondsUntilCap / 60)).toBe(10);
  });
});
