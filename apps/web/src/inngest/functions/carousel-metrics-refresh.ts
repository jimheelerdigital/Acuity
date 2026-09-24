import { inngest } from "@/inngest/client";

/**
 * Daily engagement metrics refresh — feeds the lane learning loop
 * (performance.ts) with real numbers from every platform we post to.
 *
 * 2026-09-24 rebuild (per Keenan: "fix the metrics dashboard to pull all
 * of the proper metrics"). Until now this had NEVER saved a single number
 * (0/535 posts): IG_USER_ID carries a trailing space in Vercel, this file's
 * helper didn't trim it, the first IG call 404'd, the step threw, and the
 * Facebook step behind it never ran. Nothing alerted. Now:
 *
 *   1. instagram — every auto-published IG post looked up by its stored
 *      media ID (SocialPublish.externalId): views, reach, likes, comments,
 *      saves, shares, profile visits, follows, Reels avg watch time.
 *      Legacy hand-pasted links (no SocialPublish row) still use the old
 *      permalink index.
 *   2. facebook — reactions/comments/shares/impressions per FB post.
 *   3. tiktok — @getripple / @buildwithkey via Apify (tiktok-metrics.ts);
 *      matched videos land as SocialPublish "tiktok" rows.
 *   4. alert — email Keenan when a platform had posts to refresh but
 *      saved zero numbers, with the first errors. Silent failure is how
 *      this stayed broken for weeks.
 *
 * Every step catches its own errors — one platform failing never blocks
 * the others. Per-row failures are written to SocialPublish.metricsError.
 *
 * Manual trigger: "content-factory/metrics.refresh" (admin button, or
 * POST /api/admin/content-factory/metrics-refresh).
 */
export const carouselMetricsRefreshFn = inngest.createFunction(
  {
    id: "carousel-metrics-refresh",
    name: "Content Factory — Engagement Metrics Refresh",
    retries: 1,
    triggers: [
      { cron: "0 3 * * *" }, // 10pm Central — before the overnight 4-10 UTC generation runs use the data (2026-08-18)
      { event: "content-factory/metrics.refresh" },
    ],
  },
  async ({ step, logger }) => {
    const ig = await step.run("fetch-instagram", async () => {
      const { prisma } = await import("@/lib/prisma");
      const igLib = await import("@/lib/content-factory/instagram-metrics");
      const out = { candidates: 0, refreshed: 0, errors: [] as string[] };
      if (!igLib.instagramConfigured()) {
        out.errors.push("IG_ACCESS_TOKEN / IG_USER_ID not set");
        return out;
      }
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

      // 1a. Auto-published posts, by media ID
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "instagram",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: ninetyDaysAgo },
        },
        select: { id: true, externalId: true, carouselPostId: true },
      });
      out.candidates += rows.length;
      for (const row of rows) {
        try {
          const m = await igLib.fetchIgMetricsById(row.externalId!);
          const now = new Date();
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: { ...m, metricsAt: now, metricsError: null },
          });
          await prisma.carouselPost.update({
            where: { id: row.carouselPostId },
            data: {
              views: m.views,
              likes: m.likes,
              comments: m.comments,
              saves: m.saves,
              shares: m.shares,
              metricsAt: now,
            },
          });
          out.refreshed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (out.errors.length < 5) out.errors.push(msg);
          await prisma.socialPublish
            .update({ where: { id: row.id }, data: { metricsError: msg.slice(0, 500) } })
            .catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 300)); // Graph API rate limits
      }

      // 1b. Legacy hand-pasted IG links with no SocialPublish row
      try {
        const legacy = await prisma.carouselPost.findMany({
          where: {
            instagramUrl: { not: null },
            generatedFor: { gte: ninetyDaysAgo },
            socialPublishes: { none: { platform: "instagram", status: "POSTED" } },
          },
          select: { id: true, instagramUrl: true },
        });
        if (legacy.length > 0) {
          out.candidates += legacy.length;
          const index = await igLib.fetchIgMediaIndex();
          for (const post of legacy) {
            const media = igLib.matchIgMedia(index, post.instagramUrl!);
            if (!media) continue;
            try {
              const metrics = await igLib.fetchIgMediaMetrics(media);
              await prisma.carouselPost.update({
                where: { id: post.id },
                data: { ...metrics, metricsAt: new Date() },
              });
              out.refreshed++;
            } catch (err) {
              if (out.errors.length < 5) out.errors.push(err instanceof Error ? err.message : String(err));
            }
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      } catch (err) {
        out.errors.push(`legacy index: ${err instanceof Error ? err.message : String(err)}`);
      }
      return out;
    });
    logger.info(`[metrics-refresh] Instagram: ${ig.refreshed}/${ig.candidates}`);

    const fb = await step.run("fetch-facebook", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { facebookMetricsConfigured, fetchFbPostMetrics } = await import(
        "@/lib/content-factory/facebook-metrics"
      );
      const out = { candidates: 0, refreshed: 0, errors: [] as string[] };
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "facebook",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: ninetyDaysAgo },
        },
        select: { id: true, externalId: true, accountKey: true },
      });
      for (const row of rows) {
        if (!facebookMetricsConfigured(row.accountKey)) continue;
        out.candidates++;
        try {
          const metrics = await fetchFbPostMetrics(row.externalId!, row.accountKey);
          await prisma.socialPublish.update({
            where: { id: row.id },
            data: { ...metrics, metricsAt: new Date(), metricsError: null },
          });
          out.refreshed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (out.errors.length < 5) out.errors.push(msg);
          await prisma.socialPublish
            .update({ where: { id: row.id }, data: { metricsError: msg.slice(0, 500) } })
            .catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 300));
      }
      return out;
    });
    logger.info(`[metrics-refresh] Facebook: ${fb.refreshed}/${fb.candidates}`);

    // One step per account — an Apify run-sync call can take minutes.
    const { TIKTOK_ACCOUNTS } = await import("@/lib/content-factory/tiktok-metrics");
    const tiktok: Array<{ account: string; fetched: number; matched: number; error?: string }> = [];
    for (const account of TIKTOK_ACCOUNTS) {
      const r = await step.run(`fetch-tiktok-${account.key}`, async () => {
        const { refreshTikTokAccount } = await import("@/lib/content-factory/tiktok-metrics");
        return refreshTikTokAccount(account);
      });
      logger.info(`[metrics-refresh] TikTok @${r.account}: ${r.fetched} videos, ${r.matched} matched${r.error ? ` — ${r.error}` : ""}`);
      tiktok.push(r);
    }

    await step.run("alert-on-zero", async () => {
      const problems: string[] = [];
      if (ig.candidates > 0 && ig.refreshed === 0) {
        problems.push(`Instagram: 0 of ${ig.candidates} posts refreshed. Errors: ${ig.errors.join(" | ") || "none captured"}`);
      } else if (ig.errors.length > 0 && ig.candidates === 0) {
        problems.push(`Instagram: ${ig.errors.join(" | ")}`);
      }
      if (fb.candidates > 0 && fb.refreshed === 0) {
        problems.push(`Facebook: 0 of ${fb.candidates} posts refreshed. Errors: ${fb.errors.join(" | ") || "none captured"}`);
      }
      for (const t of tiktok) {
        if (t.error || t.fetched === 0) problems.push(`TikTok @${t.account}: ${t.error ?? "0 videos returned"}`);
      }
      if (problems.length === 0) return { alerted: false };

      const { sendEmailOrThrow } = await import("@/lib/resend");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      await sendEmailOrThrow({
        from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        replyTo: "keenan@heelerdigital.com",
        subject: `⚠️ Social metrics refresh: ${problems.length} platform problem(s)`,
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#1f2430;">
          <p style="font-size:18px;font-weight:700;margin:0 0 8px;">The nightly metrics refresh hit problems</p>
          <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">Without these numbers the content learning loop can't tell which lanes work.</p>
          <ul style="font-size:13px;line-height:1.6;">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
        </div>`,
      });
      return { alerted: true };
    });

    return { instagram: ig, facebook: fb, tiktok };
  }
);
