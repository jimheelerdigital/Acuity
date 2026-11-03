import { inngest } from "@/inngest/client";

/**
 * Weekly App Store search ranks (2026-11-03, per Keenan). Sunday 9pm Central
 * ("it checks every sunday night"): Ripple's rank for each key search goes
 * into a new "Week N" tab of the "App Store SEO Rankings" Google Sheet (plus
 * the Overview tab with every week side by side), and an email with the
 * change since last week. Built in lib/app-store-rank.ts and
 * lib/app-store-rank-sheet.ts. Manual run: event "founders/app-store-rank.send".
 */
export const appStoreRankEmailFn = inngest.createFunction(
  {
    id: "app-store-rank-email",
    name: "Founders — Weekly App Store Rank",
    retries: 1,
    triggers: [{ cron: "TZ=America/Chicago 0 21 * * 0" }, { event: "founders/app-store-rank.send" }],
  },
  async ({ step }) => {
    // ~108 searches at ~3s each: run them in chunks of 15 so no step hits the function time limit.
    const { RANK_TERMS } = await import("@/lib/app-store-rank");
    const date = new Date().toISOString().slice(0, 10);
    const ranks: Record<string, number | null> = {};
    for (let i = 0; i < RANK_TERMS.length; i += 15) {
      const part = await step.run(`rank-${i / 15 + 1}`, async () => {
        const { ranksFor } = await import("@/lib/app-store-rank");
        return ranksFor(RANK_TERMS.slice(i, i + 15));
      });
      Object.assign(ranks, part);
    }
    const now = await step.run("save", async () => {
      const { saveSnapshot } = await import("@/lib/app-store-rank");
      const s = { date, ranks };
      await saveSnapshot(s);
      return s;
    });
    const sheet = await step.run("sheet", async () => {
      const { allSnapshots, writeRankSheet, RANK_SHEET_URL } = await import("@/lib/app-store-rank-sheet");
      const { tab } = await writeRankSheet(await allSnapshots());
      return { tab, url: RANK_SHEET_URL };
    });
    return step.run("send", async () => {
      const { previousSnapshot, rankReportHtml } = await import("@/lib/app-store-rank");
      const { getResendClient } = await import("@/lib/resend");
      const { subject, html } = rankReportHtml(now, await previousSnapshot(now.date), sheet.url);
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
