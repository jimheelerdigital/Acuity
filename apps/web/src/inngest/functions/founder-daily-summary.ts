/**
 * End-of-day founder summary email, 11:59pm Central, to Keenan and Jim
 * (2026-10-27, per Keenan). Content: lib/founder-daily-summary.ts.
 * Manual run: send the "founder/daily-summary" event (optionally { at: ISO }).
 */
import { inngest } from "@/inngest/client";

export const founderDailySummaryFn = inngest.createFunction(
  {
    id: "founder-daily-summary",
    name: "Founders: end-of-day summary email",
    retries: 2,
    triggers: [{ cron: "TZ=America/Chicago 59 23 * * *" }, { event: "founder/daily-summary" }],
  },
  async ({ event, step }) => {
    const atIso = (event?.data as { at?: string } | undefined)?.at;
    return step.run("send", async () => {
      const { sendDailySummary } = await import("@/lib/founder-daily-summary");
      const s = await sendDailySummary(atIso ? new Date(atIso) : new Date());
      return { label: s.label, counts: s.counts };
    });
  }
);
