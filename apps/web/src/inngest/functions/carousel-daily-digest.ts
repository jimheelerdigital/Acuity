import { inngest } from "@/inngest/client";

/**
 * DAILY DIGEST (2026-09-26, per Keenan: "send all BWK emails and final
 * videos at once with a one click download packet ... then the same thing
 * for ripple"). See lib/content-factory/daily-digest.ts.
 *
 * - event "content-factory/digest.check" { brand, date } — sent by the
 *   post-video builder after every video; sends the brand's digest the
 *   moment its last post of the day has a finished video.
 * - cron 13:00 UTC (8am CDT) — the deadline: sends whatever each brand
 *   has, noting failed lanes or videos still building.
 * One run at a time, so two finishing videos (or the cron) can't both send.
 */
export const carouselDailyDigestFn = inngest.createFunction(
  {
    id: "carousel-daily-digest",
    name: "Content Factory — Daily Digest Email",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: "content-factory/digest.check" }, { cron: "0 13 * * *" }],
  },
  async ({ event, step, logger }) => {
    // Off by default (2026-09-28, per Keenan: "i don't need the emails with
    // the videos - i exclusively need you to post the proper videos on
    // instagram/facebook"). DIGEST_EMAIL_ENABLED=1 turns it back on.
    if (process.env.DIGEST_EMAIL_ENABLED !== "1") {
      return { skipped: "digest emails disabled (DIGEST_EMAIL_ENABLED != 1)" };
    }
    const isCron = event?.name !== "content-factory/digest.check";
    const data = (event?.data ?? {}) as { brand?: "ripple" | "bwk"; date?: string; force?: boolean };
    const date = data.date ?? new Date(typeof event?.ts === "number" ? event.ts : Date.now()).toISOString().slice(0, 10);
    const brands: ("ripple" | "bwk")[] = isCron || !data.brand ? ["bwk", "ripple"] : [data.brand];
    const force = isCron || data.force === true;

    const results: Record<string, string> = {};
    for (const brand of brands) {
      const state = await step.run(`state-${brand}`, async () => {
        const { getDigestState } = await import("@/lib/content-factory/daily-digest");
        return getDigestState(brand, date);
      });
      const { digestBlocker } = await import("@/lib/content-factory/daily-digest");
      const blocker = digestBlocker(state, force);
      if (blocker) {
        results[brand] = blocker;
        continue;
      }

      // Written captions, one step per post (each can be a Claude call).
      for (const p of state.posts) {
        p.caption = await step.run(`caption-${p.id}`, async () => {
          const { ensureWrittenCaption } = await import("@/lib/content-factory/caption-writer");
          return (await ensureWrittenCaption(p.id).catch(() => null)) ?? p.caption;
        });
      }

      const packet = await step.run(`packet-${brand}`, async () => {
        const { buildDigestPacket } = await import("@/lib/content-factory/daily-digest");
        return buildDigestPacket(state);
      });

      await step.run(`send-${brand}`, async () => {
        const { sendDigestEmail } = await import("@/lib/content-factory/daily-digest");
        await sendDigestEmail(state, packet);
      });
      results[brand] = `sent: ${state.posts.length} posts, ${packet.fileCount} files`;
      logger.info(`[digest] ${brand} ${date}: ${results[brand]}`);
    }
    return { date, results };
  }
);
