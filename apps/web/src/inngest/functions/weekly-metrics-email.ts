import { inngest } from "@/inngest/client";

/**
 * Sunday founder metrics email (2026-10-07, per Keenan: "send me an email
 * breaking these numbers down every sunday"). 9am Central: the last 7 days
 * vs the 7 before. Numbers come from lib/weekly-metrics.ts. Manual run:
 * event "founders/weekly-metrics.send".
 */
export const weeklyMetricsEmailFn = inngest.createFunction(
  {
    id: "weekly-metrics-email",
    name: "Founders — Weekly Metrics Email",
    retries: 1,
    triggers: [{ cron: "TZ=America/Chicago 0 9 * * 0" }, { event: "founders/weekly-metrics.send" }],
  },
  async ({ step }) => {
    const out = await step.run("build-and-send", async () => {
      const { weekMetrics, weeklyMetricsHtml } = await import("@/lib/weekly-metrics");
      const { getResendClient } = await import("@/lib/resend");
      const end = new Date();
      const start = new Date(+end - 7 * 864e5);
      const prevStart = new Date(+start - 7 * 864e5);
      const [cur, prev] = await Promise.all([weekMetrics(start, end, end), weekMetrics(prevStart, start, end)]);
      const { subject, html } = weeklyMetricsHtml(cur, prev);
      const { data, error } = await getResendClient().emails.send({
        from: "Ripple <hello@goripple.io>",
        to: ["keenan@heelerdigital.com"],
        replyTo: "keenan@heelerdigital.com",
        subject,
        html,
      });
      // The Resend SDK returns errors instead of throwing.
      if (error) throw new Error(`weekly metrics email failed: ${error.message}`);
      return { id: data?.id, subject };
    });
    return out;
  }
);
