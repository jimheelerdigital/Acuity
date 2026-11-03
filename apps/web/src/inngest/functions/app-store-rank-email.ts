import { inngest } from "@/inngest/client";

/**
 * Weekly App Store search-rank email (2026-11-03, per Keenan). Sunday 9:30am
 * Central, after the audience report: Ripple's rank for each key search,
 * last week's rank and the change. Built in lib/app-store-rank.ts. Manual
 * run: event "founders/app-store-rank.send".
 */
export const appStoreRankEmailFn = inngest.createFunction(
  {
    id: "app-store-rank-email",
    name: "Founders — Weekly App Store Rank",
    retries: 1,
    triggers: [{ cron: "TZ=America/Chicago 30 9 * * 0" }, { event: "founders/app-store-rank.send" }],
  },
  async ({ step }) => {
    const now = await step.run("rank", async () => {
      const { currentRanks, saveSnapshot } = await import("@/lib/app-store-rank");
      const s = await currentRanks();
      await saveSnapshot(s);
      return s;
    });
    return step.run("send", async () => {
      const { previousSnapshot, rankReportHtml } = await import("@/lib/app-store-rank");
      const { getResendClient } = await import("@/lib/resend");
      const { subject, html } = rankReportHtml(now, await previousSnapshot(now.date));
      const { data, error } = await getResendClient().emails.send({
        from: "Ripple <hello@goripple.io>",
        to: ["keenan@heelerdigital.com"],
        replyTo: "keenan@heelerdigital.com",
        subject,
        html,
      });
      // The Resend SDK returns errors instead of throwing.
      if (error) throw new Error(`app store rank email failed: ${error.message}`);
      return { id: data?.id, subject };
    });
  }
);
