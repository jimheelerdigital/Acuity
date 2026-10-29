import { inngest } from "@/inngest/client";

/**
 * Video inbox (2026-10-29, per Keenan). A link shared from his phone
 * (POST /api/video-inbox) sends "video-inbox/received" { id }. Fetch,
 * watch, break down and email are separate steps so an Apify run and a
 * Gemini watch each get their own 300s. Content: lib/video-inbox/watch.ts.
 */
export const videoInboxWatchFn = inngest.createFunction(
  {
    id: "video-inbox-watch",
    name: "Video inbox: watch a shared video",
    retries: 1,
    concurrency: { limit: 2 },
    triggers: [{ event: "video-inbox/received" }],
  },
  async ({ event, step }) => {
    const id = (event.data as { id: string }).id;
    try {
      const src = await step.run("fetch", async () => {
        const { fetchSource } = await import("@/lib/video-inbox/watch");
        return fetchSource(id);
      });
      const watched = await step.run("watch", async () => {
        const { watchVideo } = await import("@/lib/video-inbox/watch");
        const r = await watchVideo(id, src);
        return { seenVia: r.seenVia, geminiProblem: r.geminiProblem ?? null };
      });
      await step.run("breakdown", async () => {
        const { writeBreakdown } = await import("@/lib/video-inbox/watch");
        await writeBreakdown(id);
      });
      await step.run("email", async () => {
        const { emailBreakdown } = await import("@/lib/video-inbox/watch");
        await emailBreakdown(id, watched.geminiProblem ?? undefined);
      });
      return { id, seenVia: watched.seenVia };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await step.run("mark-failed", async () => {
        const { markFailed, emailBreakdown } = await import("@/lib/video-inbox/watch");
        await markFailed(id, message);
        await emailBreakdown(id);
      });
      return { id, failed: message.slice(0, 300) };
    }
  }
);

/**
 * Weekly playbook update, Sundays 9am Central (after the Saturday-night
 * research sweep). Each brand in its own step; then the "what we learned"
 * email. Manual run: send "video-inbox/playbook". lib/video-inbox/playbook.ts.
 */
export const videoInboxPlaybookFn = inngest.createFunction(
  {
    id: "video-inbox-playbook",
    name: "Video inbox: weekly playbook update",
    retries: 1,
    triggers: [{ cron: "TZ=America/Chicago 0 9 * * 0" }, { event: "video-inbox/playbook" }],
  },
  async ({ step }) => {
    const { PLAYBOOK_BRANDS } = await import("@/lib/video-inbox/playbook");
    const results: import("@/lib/video-inbox/playbook").BrandDistill[] = [];
    for (const brand of PLAYBOOK_BRANDS) {
      results.push(
        await step.run(`distill-${brand}`, async () => {
          const { distillBrand } = await import("@/lib/video-inbox/playbook");
          return distillBrand(brand);
        })
      );
    }
    const emailed = await step.run("email", async () => {
      const { sendPlaybookEmail } = await import("@/lib/video-inbox/playbook");
      return sendPlaybookEmail(results);
    });
    return { results, emailed };
  }
);
