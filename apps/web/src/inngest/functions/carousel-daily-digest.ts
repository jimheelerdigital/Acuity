import { inngest } from "@/inngest/client";

/**
 * DAILY POST EMAILS — one email per post, BWK first then Ripple (2026-09-28,
 * see the handler). The one-ZIP DIGEST below is off unless
 * DIGEST_EMAIL_ENABLED=1.
 *
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
    // ONE EMAIL PER POST (2026-09-28, per Keenan: "send me individual
    // emails for each post please. one email per post. send BWK posts
    // first, then ripple posts 2nd"; Legendary Mythicals third since
    // 2026-09-29). Once the day's batch is complete —
    // every lane generated, every video finished (or the 13:00 UTC
    // deadline) — each post gets its own email (caption, slides, video),
    // all BWK posts first, then all Ripple. Per-post emailedAt keeps any
    // post from being sent twice. The one-ZIP digest below is off unless
    // DIGEST_EMAIL_ENABLED=1.
    if (process.env.DIGEST_EMAIL_ENABLED !== "1") {
      const force = event?.name !== "content-factory/digest.check" || (event?.data as { force?: boolean })?.force === true;
      const date =
        (event?.data as { date?: string })?.date ??
        new Date(typeof event?.ts === "number" ? event.ts : Date.now()).toISOString().slice(0, 10);
      const order = await step.run("post-email-order", async () => {
        const { getDigestState, digestBlocker } = await import("@/lib/content-factory/daily-digest");
        const { prisma } = await import("@/lib/prisma");
        const ids: string[] = [];
        const waiting: string[] = [];
        // Order (per Keenan): BWK, then Ripple, then Legendary Mythicals
        // ("give me everything right after bwk and ripple emails").
        for (const brand of ["bwk", "ripple", "mythicals"] as const) {
          const state = await getDigestState(brand, date);
          const blocker = digestBlocker({ ...state, alreadySent: false }, force);
          if (blocker && blocker !== "no posts") waiting.push(`${brand}: ${blocker}`);
          ids.push(...state.posts.map((p) => p.id));
        }
        if (waiting.length) return { ids: [] as string[], waiting };
        const unsent = await prisma.carouselPost.findMany({
          where: { id: { in: ids }, emailedAt: null },
          select: { id: true },
        });
        const open = new Set(unsent.map((p) => p.id));
        return { ids: ids.filter((id) => open.has(id)), waiting };
      });
      if (order.waiting.length) return { date, waiting: order.waiting };
      for (const id of order.ids) {
        await step.run(`email-${id}`, async () => {
          const { sendCarouselEmail } = await import("@/lib/content-factory/email");
          await sendCarouselEmail(id, false, { allLanes: true });
        });
      }
      logger.info(`[post-emails] ${date}: sent ${order.ids.length} post email(s), BWK first`);
      return { date, sent: order.ids.length };
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
