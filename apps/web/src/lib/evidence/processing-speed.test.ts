/**
 * Speed up processing (Miro, 2026-10-23). Baseline from Entry.processingTimeline
 * over 57 PRO entries (10/16–10/23): median 46.7 s from save to results.
 * Transcript → Claude start was 11.2 s of that, almost all Inngest step
 * boundaries (six in a row). Those reads now run inside one step, and the
 * pre-persist cancel check runs inside the persist step.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(__dirname, "../../inngest/functions/process-entry.ts"), "utf8");

describe("process-entry step boundaries", () => {
  it("has no separate steps between the transcript and Claude", () => {
    for (const gone of [
      '"compute-entitlement"',
      '"build-memory-context"',
      '"fetch-calendar-context"',
      '"read-dispositional-flag"',
      '"cancel-check-before-extract"',
      '"set-extracting-status"',
      'step.run("extract"',
      '"cancel-check-before-persist"',
    ]) {
      expect(src, gone).not.toContain(gone);
    }
    expect(src).toContain('step.run("prepare-and-extract"');
  });

  it("still forks FREE before any context read or Claude call", () => {
    const step = src.slice(src.indexOf('step.run("prepare-and-extract"'));
    const free = step.indexOf('return { kind: "free" as const }');
    expect(free).toBeGreaterThan(0);
    expect(free).toBeLessThan(step.indexOf("buildMemoryContext"));
    expect(free).toBeLessThan(step.indexOf("extractFromTranscript("));
  });

  it("still cancels before Claude and before persisting", () => {
    const step = src.slice(src.indexOf('step.run("prepare-and-extract"'));
    expect(step.indexOf('return { kind: "canceled" as const }')).toBeLessThan(step.indexOf("extractFromTranscript("));
    expect(src).toMatch(/canceledAt: "before-extract"/);
    const persist = src.slice(src.indexOf('step.run("persist-extraction"'));
    expect(persist.indexOf("return { canceled: true }")).toBeLessThan(persist.indexOf("prisma.$transaction"));
    expect(src).toMatch(/if \(persisted\?\.canceled\) \{\s*return \{ entryId, canceled: true, canceledAt: "before-persist" \}/);
  });

  it("keeps the processing timeline marks", () => {
    for (const p of ["extract_start", "extract_done", "persist_done"]) {
      expect(src).toContain(`markPhase(prisma, entryId, "${p}")`);
    }
  });
});
