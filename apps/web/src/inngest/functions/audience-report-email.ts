import { inngest } from "@/inngest/client";

/**
 * Sunday audience report (2026-11-02, per Keenan: "pull that information
 * every sunday and send me the report"). 9am Central: who sees, clicks and
 * converts from the Meta ads (age, gender), plus who actually starts paid
 * trials in our funnel. Built in lib/audience-report.ts. Manual run: event
 * "founders/audience-report.send".
 */
export const audienceReportEmailFn = inngest.createFunction(
  {
    id: "audience-report-email",
    name: "Founders — Weekly Audience Report",
    retries: 1,
    triggers: [{ cron: "TZ=America/Chicago 0 9 * * 0" }, { event: "founders/audience-report.send" }],
  },
  async ({ step }) => {
    return step.run("build-and-send", async () => {
      const { audienceReport, audienceReportHtml } = await import("@/lib/audience-report");
      const { getResendClient } = await import("@/lib/resend");
      const { subject, html } = audienceReportHtml(await audienceReport(28));
      const { data, error } = await getResendClient().emails.send({
        from: "Ripple <hello@goripple.io>",
        to: ["keenan@heelerdigital.com"],
        replyTo: "keenan@heelerdigital.com",
        subject,
        html,
      });
      // The Resend SDK returns errors instead of throwing.
      if (error) throw new Error(`audience report email failed: ${error.message}`);
      return { id: data?.id, subject };
    });
  }
);
