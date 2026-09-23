/**
 * AdLab daily decision engine — scheduler.
 *
 * The engine itself lives in GET /api/admin/adlab/cron (metrics sync +
 * kill/scale rules + experiment rules + daily email). It was built in May
 * 2026 but never scheduled — vercel.json's single cron slot is taken by
 * the waitlist drip, so Inngest is the scheduler (matches every other
 * cron in this app).
 *
 * This fn just fetches the route with the cron secret; all logic, safety
 * rails, and reporting stay in the route so it can also be hit manually.
 *
 * Cron: 09:00 UTC daily (~4am ET) — Meta's "yesterday" insights are
 * complete by then. Manual test:
 *   inngest event "admin/adlab-daily-cron.requested", or
 *   GET /api/admin/adlab/cron (Bearer CRON_SECRET)
 */

import { inngest } from "@/inngest/client";

export const adlabDailyCronFn = inngest.createFunction(
  {
    id: "adlab-daily-cron",
    name: "AdLab — Daily Metrics Sync + Decision Engine",
    retries: 1,
    triggers: [
      { cron: "0 9 * * *" },
      { event: "admin/adlab-daily-cron.requested" },
    ],
  },
  async ({ logger, step }) => {
    const result = await step.run("run-decision-engine", async () => {
      const baseUrl = process.env.NEXTAUTH_URL || "https://goripple.io";
      const res = await fetch(`${baseUrl}/api/admin/adlab/cron`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        // The route can run for minutes when many ads are live
        signal: AbortSignal.timeout(290_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(`adlab cron route ${res.status}: ${JSON.stringify(body)}`);
      }
      return body;
    });

    logger.info(`[adlab-daily-cron] done: ${JSON.stringify(result)}`);
    return { ok: true, result };
  }
);
