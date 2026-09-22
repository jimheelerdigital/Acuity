import "server-only";

import { EVIDENCE_RECEIPTS_FLAG, parseEvidenceFlag } from "@acuity/shared";

/**
 * Server adapter for the EVIDENCE_RECEIPTS flag.
 *
 * Read fresh per call rather than cached at module load — Vercel keeps warm
 * Lambdas across requests, so caching would mean a flag change needs both a
 * redeploy and a cold start to take effect.
 *
 * Env-based rather than the DB-backed FeatureFlag table on purpose: this
 * gates a data-layer/generation path, not a user-facing feature, and it has
 * to be evaluatable inside an Inngest cron where there is no request or user
 * to scope a DB flag lookup to.
 */
export function evidenceReceiptsEnabled(): boolean {
  return parseEvidenceFlag(process.env[EVIDENCE_RECEIPTS_FLAG]);
}
