/**
 * Learning-loop "brain check" (2026-10-02, fix #4 of the 30-day hands-off
 * list). Posting can keep going while the learning quietly stops: Jev fails
 * open, and the scoreboard / calibration / research-learning jobs only log
 * warnings. Each learning job stamps a marker here when it finishes OK, and
 * the daily social health check (social-health-check.ts) reports any that
 * are overdue, plus Jev's error rate, in the email Keenan already gets.
 *
 * Markers: health/learning/<job>.json in the content-factory bucket.
 */

import { readJson, writeJson } from "./performance-loop";

export type LearningJob = "scoreboard" | "gate-track" | "weekly-calibration" | "research-learning";

/** How stale each job may get before it's reported (hours). */
const MAX_AGE_HOURS: Record<LearningJob, number> = {
  scoreboard: 50, // daily 04:30 UTC
  "gate-track": 50, // daily, same function
  "weekly-calibration": 8 * 24, // Mondays 14:00 UTC
  "research-learning": 8 * 24, // Sundays 03:30 UTC
};

const LABEL: Record<LearningJob, string> = {
  scoreboard: "Performance scoreboard (daily)",
  "gate-track": "Publish-gate lane track records (daily)",
  "weekly-calibration": "Weekly Jev + publish-gate calibration (Mondays)",
  "research-learning": "Research learning: source credit + search phrases (Sundays)",
};

/** Before this, a job with no marker yet is still waiting for its first post-deploy run. */
const FIRST_RUN_GRACE_UNTIL = Date.parse("2026-10-13T00:00:00Z");

/** Jev failures above this share of yesterday's calls get reported. */
const JEV_ERROR_RATE_MAX = 0.1;

interface LearningMarker {
  at: string;
  detail?: unknown;
}

const path = (job: LearningJob) => `health/learning/${job}.json`;

/** Stamp a learning job as done. Never throws: a stamp must not fail the job. */
export async function markLearningRun(job: LearningJob, detail?: unknown): Promise<void> {
  try {
    await writeJson(path(job), { at: new Date().toISOString(), detail } satisfies LearningMarker);
  } catch (e) {
    console.warn(`[learning-health] could not stamp ${job}:`, e instanceof Error ? e.message : e);
  }
}

/** Problems for the daily health email; empty when every loop is alive. */
export async function learningProblems(now = Date.now()): Promise<string[]> {
  const out: string[] = [];
  for (const job of Object.keys(MAX_AGE_HOURS) as LearningJob[]) {
    const m = await readJson<LearningMarker>(path(job)).catch(() => null);
    const ageH = m ? (now - Date.parse(m.at)) / 3_600_000 : null;
    if (ageH == null && now < FIRST_RUN_GRACE_UNTIL) continue;
    if (ageH == null || ageH > MAX_AGE_HOURS[job]) {
      out.push(
        `Learning stopped: ${LABEL[job]} last finished ${ageH == null ? "never" : `${Math.round(ageH)}h ago`}. Posting continues, but it isn't learning from results.`
      );
    }
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const since = new Date(now - 24 * 3_600_000);
    const [total, failed] = await Promise.all([
      prisma.claudeCallLog.count({ where: { model: "jev", createdAt: { gte: since } } }),
      prisma.claudeCallLog.count({ where: { model: "jev", createdAt: { gte: since }, success: false } }),
    ]);
    if (total === 0) {
      out.push("Jev made no calls in the last 24h — every Jev check (covers, gate, picks) is being skipped.");
    } else if (failed / total > JEV_ERROR_RATE_MAX) {
      out.push(
        `Jev failed ${failed} of ${total} calls in 24h (${Math.round((100 * failed) / total)}%). Failed calls pass everything through with default settings.`
      );
    }
  } catch (e) {
    out.push(`Couldn't read Jev's call log: ${e instanceof Error ? e.message : e}`);
  }
  return out;
}
