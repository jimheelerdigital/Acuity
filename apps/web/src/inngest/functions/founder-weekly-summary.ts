/**
 * Weekly founder summary, Saturdays 11:59pm Central, to Keenan and Jim
 * (2026-10-28, per Keenan: "a weekly email on saturdays at 1159 of last sat
 * to this sat's metrics ... along w spend"). Covers Sunday → Saturday, with
 * the week before for comparison. Content: lib/founder-daily-summary.ts.
 * Manual run: send "founder/weekly-summary" (optionally { at: ISO }).
 */
import { inngest } from "@/inngest/client";

export const founderWeeklySummaryFn = inngest.createFunction(
  {
    id: "founder-weekly-summary",
    name: "Founders: weekly summary email",
    retries: 2,
    triggers: [{ cron: "TZ=America/Chicago 59 23 * * 6" }, { event: "founder/weekly-summary" }],
  },
  async ({ event, step }) => {
    const atIso = (event?.data as { at?: string } | undefined)?.at;
    return step.run("send", async () => {
      const { sendDailySummary } = await import("@/lib/founder-daily-summary");
      const s = await sendDailySummary(atIso ? new Date(atIso) : new Date(), 7);
      return { label: s.label, counts: s.counts };
    });
  }
);
