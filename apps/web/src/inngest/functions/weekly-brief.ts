import { inngest } from "@/inngest/client";

/**
 * Weekly brief (2026-10-13, per Keenan: "build the weekly brief and send to
 * me on sunday along with jev so it knows what's working vs what's been
 * tragic"). See lib/content-factory/weekly-brief.ts.
 *
 * - Sunday 04:40 UTC: recalibrate Jev's candidate ranking from real results
 *   (candidate-calibration.ts), then rebuild both briefs, before the 05:00
 *   writers read them.
 * - Sunday 14:00 UTC (9am CT): email both briefs to Keenan.
 * - event "content-factory/weekly-brief" { email?: boolean }: rebuild now
 *   (and email unless email=false).
 */
export const weeklyBriefFn = inngest.createFunction(
  {
    id: "weekly-brief",
    name: "Content Factory — Weekly Brief (what's working)",
    retries: 1,
    triggers: [
      { cron: "40 4 * * 0" },
      { cron: "0 14 * * 0" },
      { event: "content-factory/weekly-brief" },
    ],
  },
  async ({ event, step, logger }) => {
    const isEvent = event?.name === "content-factory/weekly-brief";
    const hour = new Date(typeof event?.ts === "number" ? event.ts : Date.now()).getUTCHours();
    const build = isEvent || hour < 12;
    const email = isEvent ? (event.data as { email?: boolean } | undefined)?.email !== false : hour >= 12;

    if (build) {
      const cal = await step.run("calibrate-jev", async () => {
        const { scorePosts } = await import("@/lib/content-factory/performance-loop");
        const { refreshCandidateCalibration } = await import("@/lib/content-factory/candidate-calibration");
        return refreshCandidateCalibration(await scorePosts({ allLanes: true }));
      });
      logger.info(`[weekly-brief] calibration: ${cal.map((c) => `${c.brand} n=${c.n} jevOff=${c.jevOff}`).join("; ")}`);
      for (const brand of ["ripple", "mythicals"] as const) {
        await step.run(`build-${brand}`, async () => {
          const { buildWeeklyBrief } = await import("@/lib/content-factory/weekly-brief");
          const b = await buildWeeklyBrief(brand);
          return { brand, scored: b.scoredPosts, winners: b.winners.length, losers: b.losers.length, chars: b.promptBlock.length };
        });
      }
    }

    if (email) {
      await step.run("email", async () => {
        // Folded into the weekly Social Brief (2026-10-20) once social_brief_only is on.
        const { socialBriefOnly } = await import("@/lib/content-factory/social-brief-send");
        if (await socialBriefOnly()) return;
        const { readBrief, briefEmailHtml } = await import("@/lib/content-factory/weekly-brief");
        const { sendEmailOrThrow } = await import("@/lib/resend");
        const briefs = (await Promise.all([readBrief("ripple"), readBrief("mythicals")])).filter(
          (b): b is NonNullable<typeof b> => !!b
        );
        if (briefs.length === 0) return { sent: false, reason: "no briefs built yet" };
        await sendEmailOrThrow({
          from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
          to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
          subject: `Weekly brief: what's working vs what's been tragic (${new Date().toISOString().slice(0, 10)})`,
          html: briefEmailHtml(briefs),
        });
        return { sent: true, brands: briefs.map((b) => b.brand) };
      });
    }
    return { build, email };
  }
);
