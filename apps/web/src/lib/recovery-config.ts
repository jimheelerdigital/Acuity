/**
 * Recovery email configuration — tune via env vars in Vercel,
 * no code change needed.
 *
 * RECOVERY_MAX_SENDS_PER_TICK — max emails per 15-min orchestrator tick.
 *   Default 50 (= 200/hour at 4 ticks/hour). Prevents a single tick
 *   from blasting the entire backlog.
 *
 * RECOVERY_MAX_SENDS_PER_DAY — daily ceiling across all ticks.
 *   Default 300. Once hit, the orchestrator stops sending until
 *   tomorrow (UTC midnight). Protects deliverability during backlog
 *   drain.
 *
 * RECOVERY_ENABLEMENT_DATE — ISO timestamp. Time-sensitive emails
 *   (stall, never-recorded, trial-ending, download-rescue) only fire
 *   for users whose triggering event (signup, last recording) is AFTER
 *   this date. Prevents retroactive blasting of old backlog on enable.
 *   Default: "2025-01-01T00:00:00Z" (far past — effectively disabled,
 *   all users eligible). Set to today's date when enabling to be safe.
 *
 * RECOVERY_DRY_RUN — "true" to count qualifying users without sending.
 *   The orchestrator returns counts per email type instead of sending.
 *   Default: "false".
 */

export function getRecoveryConfig() {
  return {
    maxSendsPerTick: parseInt(
      process.env.RECOVERY_MAX_SENDS_PER_TICK ?? "50",
      10
    ),
    maxSendsPerDay: parseInt(
      process.env.RECOVERY_MAX_SENDS_PER_DAY ?? "300",
      10
    ),
    enablementDate: new Date(
      process.env.RECOVERY_ENABLEMENT_DATE ?? "2025-01-01T00:00:00Z"
    ),
    dryRun: process.env.RECOVERY_DRY_RUN === "true",
  };
}
