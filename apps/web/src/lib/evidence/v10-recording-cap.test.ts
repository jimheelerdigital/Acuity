import { describe, expect, it } from "vitest";

import { V10_MAX_RECORDING_MS } from "../../../../../apps/mobile/lib/onboarding-v10/limits";

/**
 * Enforces the 120s recording cap while v10 still uploads via multipart.
 *
 * This is a HARD RULE, not a preference: Vercel rejects request bodies over
 * 4.5MB at the platform level, BEFORE the handler runs — so the app's own
 * MAX_AUDIO_BYTES guard (25MB) cannot catch it, and the failure arrives as
 * an opaque 413 rather than try-recording/route.ts:94's tidy one.
 *
 * 120s of HIGH_QUALITY AAC is ~1.9MB. Raising the cap re-creates a live
 * production bug on the north-star path (first debrief per fresh install).
 *
 * WHEN THIS TEST BLOCKS YOU: it means you raised the cap. That is only safe
 * once `uploadDebrief` in lib/onboarding-v10/upload.ts has been swapped to
 * the shared signed-URL direct-to-storage flow covering
 * /api/mobile/try-recording — not just /api/record. At that point, delete
 * this test along with the multipart implementation.
 */

/** Vercel's serverless request body limit. */
const VERCEL_BODY_LIMIT_BYTES = 4.5 * 1024 * 1024;

/** HIGH_QUALITY AAC ≈ 128 kbps → bytes per second. */
const AAC_BYTES_PER_SECOND = (128 * 1000) / 8;

describe("v10 recording cap (multipart era)", () => {
  it("is still 120s", () => {
    expect(V10_MAX_RECORDING_MS).toBe(120_000);
  });

  it("produces audio comfortably under Vercel's 4.5MB body cap", () => {
    const estimatedBytes = (V10_MAX_RECORDING_MS / 1000) * AAC_BYTES_PER_SECOND;
    expect(estimatedBytes).toBeLessThan(VERCEL_BODY_LIMIT_BYTES);
    // Keep real headroom — encoders vary, and a cap that only just fits
    // would fail intermittently in the field rather than never.
    expect(estimatedBytes).toBeLessThan(VERCEL_BODY_LIMIT_BYTES * 0.6);
  });

  it("documents why the app-level guard cannot protect this path", () => {
    // MAX_AUDIO_BYTES is 25MB — 5.5x the platform limit — so it can never
    // fire. This assertion exists to make that relationship explicit rather
    // than folklore.
    const APP_GUARD_BYTES = 25 * 1024 * 1024;
    expect(APP_GUARD_BYTES).toBeGreaterThan(VERCEL_BODY_LIMIT_BYTES);
  });
});
