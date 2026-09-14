/**
 * Audio inclusion budget for the async data export.
 *
 * ── Why a budget exists at all ───────────────────────────────────────
 * The export streams its zip to a temp file before uploading, which is
 * what bounds PEAK MEMORY (see inngest/functions/generate-data-export.ts).
 * It does not bound DISK. A serverless invocation gets a small ephemeral
 * `/tmp`, so an account with a pathological amount of retained audio can
 * still fail — not by OOM now, but by filling the scratch volume.
 *
 * A real user already hit 105MB. That is comfortably fine. The budget is
 * for the tail beyond it: it caps how much audio goes in, keeps the JSON
 * bundles (which are the part a user actually needs for portability), and
 * records precisely what was left out so the omission is visible rather
 * than silent.
 *
 * ── Why a separate, pure module ──────────────────────────────────────
 * The decision is arithmetic over a list, and the surrounding function
 * needs Prisma, Supabase and Inngest to run at all. Splitting the
 * arithmetic out is what makes it unit-testable without any of that.
 *
 * Nothing here does I/O and nothing here is async — deliberately.
 */

/** Per-export ceiling on audio bytes. ~1 GiB. */
export const AUDIO_BYTE_BUDGET = 1024 * 1024 * 1024;

/**
 * Hard cap on file count, independent of size.
 *
 * Size alone is not enough: ten thousand tiny clips cost ten thousand
 * sequential Supabase round-trips long before they cost a gigabyte, and
 * the function's wall-clock budget runs out first. A daily recorder hits
 * ~365/year, so 5000 is roughly a decade of use.
 */
export const AUDIO_FILE_BUDGET = 5000;

export interface AudioCandidate {
  /** Entry id — used for the in-zip filename. */
  id: string;
  /** Storage object path. Candidates without one are not audio at all. */
  audioPath: string | null;
  /**
   * ESTIMATED size in bytes. There is no byte column on Entry — only
   * `duration` in seconds — so callers pass `estimateAudioBytes(duration)`.
   * Null/undefined means "no duration recorded", which counts as 0 and
   * leans on the file-count cap instead.
   */
  audioBytes?: number | null;
}

export interface AudioPlan<T extends AudioCandidate> {
  /** Files to stream into the zip, in the order given. */
  included: T[];
  /** Files deliberately left out, with the reason. */
  skipped: { id: string; reason: "byte-budget" | "file-budget" }[];
  /** Sum of known sizes for `included`. Unknown-size files count as 0. */
  plannedBytes: number;
  /** True when anything was dropped — drives the README note. */
  truncated: boolean;
}

/**
 * Decide which audio files make it into the export.
 *
 * Order is preserved: callers pass entries oldest-first, and truncation
 * therefore drops the NEWEST audio. That is the deliberate choice — a
 * user exporting their archive is likelier to be after the history they
 * can no longer see in-app than the recording they made this morning,
 * which is still one tap away in the app itself.
 *
 * A file with an unknown size (`audioBytes` null/undefined) is admitted
 * and contributes 0 to the running total. Refusing unknowns would drop
 * every pre-sizing row, which is the opposite of what an export is for;
 * the file-count cap is what keeps that case bounded.
 */
export function planAudioInclusion<T extends AudioCandidate>(
  candidates: T[],
  opts: { byteBudget?: number; fileBudget?: number } = {}
): AudioPlan<T> {
  const byteBudget = opts.byteBudget ?? AUDIO_BYTE_BUDGET;
  const fileBudget = opts.fileBudget ?? AUDIO_FILE_BUDGET;

  const included: T[] = [];
  const skipped: AudioPlan<T>["skipped"] = [];
  let plannedBytes = 0;

  for (const c of candidates) {
    if (!c.audioPath) continue; // not audio; not a skip worth reporting

    if (included.length >= fileBudget) {
      skipped.push({ id: c.id, reason: "file-budget" });
      continue;
    }

    const size = typeof c.audioBytes === "number" && c.audioBytes > 0 ? c.audioBytes : 0;

    // Strictly greater-than so a single file larger than the whole budget
    // is skipped rather than admitted and blowing it.
    if (plannedBytes + size > byteBudget) {
      skipped.push({ id: c.id, reason: "byte-budget" });
      continue;
    }

    included.push(c);
    plannedBytes += size;
  }

  return {
    included,
    skipped,
    plannedBytes,
    truncated: skipped.length > 0,
  };
}

/**
 * Bytes-per-second for the app's recording format.
 *
 * The mobile recorder writes AAC/m4a at roughly 32 kbps, i.e. ~4 KB/s.
 * Rounded UP deliberately: the budget's job is to refuse to overfill a
 * small ephemeral disk, so over-estimating is the safe direction.
 */
export const AUDIO_BYTES_PER_SECOND = 4 * 1024;

/**
 * Estimate an entry's audio size from its recorded duration.
 *
 * This is genuinely an estimate — the schema stores no byte count. It is
 * the FIRST of two layers: this one shapes the plan, and the export loop
 * enforces a hard stop on ACTUAL bytes as they stream, which is what
 * ultimately protects the scratch disk. Neither layer alone is enough:
 * estimates drift, and a runtime-only check would have already spent the
 * download before discovering the file was too big.
 */
export function estimateAudioBytes(durationSeconds: number | null | undefined): number | null {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) return null;
  if (durationSeconds <= 0) return null;
  return Math.ceil(durationSeconds * AUDIO_BYTES_PER_SECOND);
}

/** Human-readable MB, one decimal. For README copy only. */
export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The note appended to the audio README when anything was dropped.
 * Returns null when nothing was, so the caller has one condition.
 */
export function audioTruncationNote<T extends AudioCandidate>(
  plan: AudioPlan<T>
): string | null {
  if (!plan.truncated) return null;
  const byByteBudget = plan.skipped.filter((s) => s.reason === "byte-budget").length;
  const byFileBudget = plan.skipped.filter((s) => s.reason === "file-budget").length;
  const parts = [
    `NOTE: ${plan.skipped.length} recording(s) were not included in this export.`,
    ``,
    `This export includes ${plan.included.length} audio file(s), about ${formatMb(plan.plannedBytes)}.`,
  ];
  if (byByteBudget > 0) {
    parts.push(
      `${byByteBudget} were omitted because the export reached its ${formatMb(AUDIO_BYTE_BUDGET)} audio limit.`
    );
  }
  if (byFileBudget > 0) {
    parts.push(
      `${byFileBudget} were omitted because the export reached its ${AUDIO_FILE_BUDGET}-file limit.`
    );
  }
  parts.push(
    ``,
    `Every transcript, summary and extracted field is still included in full in the`,
    `.json files at the top level — nothing about your written record was truncated.`,
    `If you need the remaining audio, reply to the export email and we'll arrange it.`
  );
  return parts.join("\n");
}
