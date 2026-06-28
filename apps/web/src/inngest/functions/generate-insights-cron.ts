import { inngest } from "@/inngest/client";

/**
 * AI Insights refresh cron (every 4h). Regenerates the MRI diagnostic
 * AdminInsight from a fresh 30-day snapshot so the dashboard's AI Insights
 * panel is never more than 4h stale without a manual regenerate.
 *
 * generateInsights() builds the aggregates-only snapshot, calls Claude
 * (CLAUDE_MODEL), validates the JSON, and writes both an AdminInsight row and
 * a ClaudeCallLog row (purpose 'admin_insights'). generatedBy is "cron".
 */
export const generateInsightsCronFn = inngest.createFunction(
  {
    id: "generate-insights-cron",
    name: "MRI AI Insights refresh (4h)",
    triggers: [{ cron: "0 */4 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    const result = await step.run("generate-insights", async () => {
      const { generateInsights } = await import("@/lib/mri/insights");
      const row = await generateInsights("cron", "30d");
      return {
        id: row.id,
        generatedAt: row.generatedAt.toISOString(),
        costCents: row.costCents,
      };
    });

    return { ok: true, ...result };
  }
);
