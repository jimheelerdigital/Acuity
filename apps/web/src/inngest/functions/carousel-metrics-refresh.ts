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
  async ({ event, step, logger }) => {
    // Instagram in batches (2026-10-13): one step over ~270 rows finished
    // the work but hit Vercel's 300s limit before returning, so it retried
    // forever and the Facebook/YouTube steps never ran. Now: list once, then
    // IG_BATCH rows per step, then the legacy hand-pasted links.
    const IG_BATCH = 40;
    const igList = await step.run("list-instagram", async () => {
      const { prisma } = await import("@/lib/prisma");
      const igLib = await import("@/lib/content-factory/instagram-metrics");
      if (!igLib.instagramConfigured()) return { ok: false as const, ids: [] as string[] };
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "instagram",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
        },
        orderBy: { postedAt: "desc" },
        select: { id: true },
      });
      return { ok: true as const, ids: rows.map((r) => r.id) };
    });
    const ig = { candidates: igList.ids.length, refreshed: 0, errors: igList.ok ? ([] as string[]) : ["IG_ACCESS_TOKEN / IG_USER_ID not set"] };
    for (let b = 0; b < igList.ids.length; b += IG_BATCH) {
      const batch = igList.ids.slice(b, b + IG_BATCH);
      const r = await step.run(`fetch-instagram-${b / IG_BATCH}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const igLib = await import("@/lib/content-factory/instagram-metrics");
        const out = { candidates: 0, refreshed: 0, errors: [] as string[] };
        const rows = await prisma.socialPublish.findMany({
          where: { id: { in: batch } },
          select: { id: true, externalId: true, carouselPostId: true },
        });
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

        return out;
      });
      ig.refreshed += r.refreshed;
      for (const e of r.errors) if (ig.errors.length < 5) ig.errors.push(e);
    }
    if (igList.ok) {
      const r = await step.run("fetch-instagram-legacy", async () => {
        const { prisma } = await import("@/lib/prisma");
        const igLib = await import("@/lib/content-factory/instagram-metrics");
        const out = { candidates: 0, refreshed: 0, errors: [] as string[] };
        const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
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
      ig.candidates += r.candidates;
      ig.refreshed += r.refreshed;
      for (const e of r.errors) if (ig.errors.length < 5) ig.errors.push(e);
    }
    logger.info(`[metrics-refresh] Instagram: ${ig.refreshed}/${ig.candidates}`);

    // YouTube Shorts stats (2026-10-13): Mythicals' win metric counts
    // YouTube views; nothing collected them before.
    const yt = await step.run("fetch-youtube", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { youtubeAccount, fetchYoutubeStats } = await import("@/lib/content-factory/youtube-publish");
      const out = { candidates: 0, refreshed: 0, errors: [] as string[] };
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "youtube",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: new Date(Date.now() - 60 * 86_400_000) },
        },
        select: { id: true, externalId: true, accountKey: true },
      });
      const byBrand = new Map<string, typeof rows>();
      for (const r of rows) byBrand.set(r.accountKey, [...(byBrand.get(r.accountKey) ?? []), r]);
      for (const [brand, list] of byBrand) {
        const account = youtubeAccount(brand as Parameters<typeof youtubeAccount>[0]);
        if (!account) continue;
        out.candidates += list.length;
        try {
          const stats = await fetchYoutubeStats(account, list.map((r) => r.externalId!));
          for (const r of list) {
            const st = stats.get(r.externalId!);
            if (!st) continue;
            await prisma.socialPublish.update({
              where: { id: r.id },
              data: { views: st.views, likes: st.likes, comments: st.comments, metricsAt: new Date(), metricsError: null },
            });
            out.refreshed++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          out.errors.push(`${brand}: ${msg}`.slice(0, 300));
          await prisma.socialPublish
            .updateMany({ where: { id: { in: list.map((r) => r.id) } }, data: { metricsError: msg.slice(0, 500) } })
            .catch(() => {});
        }
      }
      return out;
    });
    logger.info(`[metrics-refresh] YouTube: ${yt.refreshed}/${yt.candidates}${yt.errors.length ? ` errors: ${yt.errors.join("; ")}` : ""}`);
    // Facebook in batches (2026-10-13): one step over ~270 rows (API call +
    // 300ms pause each) ran past Vercel's 300s limit every night since
    // ~10-04, so FB metrics froze and the YouTube step after it never ran.
    // Now: only posts from the last 45 days (the scoring window) in steps of
    // FB_BATCH rows.
    const FB_BATCH = 40;
    const fbIds = await step.run("list-facebook", async () => {
      const { prisma } = await import("@/lib/prisma");
      const { facebookMetricsConfigured } = await import("@/lib/content-factory/facebook-metrics");
      const rows = await prisma.socialPublish.findMany({
        where: {
          platform: "facebook",
          status: "POSTED",
          externalId: { not: null },
          postedAt: { gte: new Date(Date.now() - 45 * 86_400_000) },
        },
        orderBy: { postedAt: "desc" },
        select: { id: true, accountKey: true },
      });
      return rows.filter((r) => facebookMetricsConfigured(r.accountKey)).map((r) => r.id);
    });
    const fb = { candidates: fbIds.length, refreshed: 0, errors: [] as string[] };
    for (let i = 0; i < fbIds.length; i += FB_BATCH) {
      const batch = fbIds.slice(i, i + FB_BATCH);
      const r = await step.run(`fetch-facebook-${i / FB_BATCH}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { fetchFbPostMetrics } = await import("@/lib/content-factory/facebook-metrics");
        const out = { refreshed: 0, errors: [] as string[] };
        const rows = await prisma.socialPublish.findMany({
          where: { id: { in: batch } },
          select: { id: true, externalId: true, accountKey: true },
        });
        for (const row of rows) {
          try {
            const metrics = await fetchFbPostMetrics(row.externalId!, row.accountKey);
            await prisma.socialPublish.update({
              where: { id: row.id },
              data: { ...metrics, metricsAt: new Date(), metricsError: null },
            });
            out.refreshed++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (out.errors.length < 3) out.errors.push(msg);
            await prisma.socialPublish
              .update({ where: { id: row.id }, data: { metricsError: msg.slice(0, 500) } })
              .catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 300));
        }
        return out;
      });
      fb.refreshed += r.refreshed;
      for (const e of r.errors) if (fb.errors.length < 5) fb.errors.push(e);
    }
    logger.info(`[metrics-refresh] Facebook: ${fb.refreshed}/${fb.candidates}`);


    // One step per account — an Apify run-sync call can take minutes.
    // Full history on Sundays (UTC) or when requested ({ full: true }).
    const full =
      (event.data as { full?: boolean } | undefined)?.full === true || new Date(event.ts ?? Date.now()).getUTCDay() === 0;
    const { TIKTOK_ACCOUNTS } = await import("@/lib/content-factory/tiktok-metrics");
    const tiktok: Array<{ account: string; fetched: number; matched: number; error?: string }> = [];
    for (const account of TIKTOK_ACCOUNTS) {
      const r = await step.run(`fetch-tiktok-${account.key}`, async () => {
        const { refreshTikTokAccount } = await import("@/lib/content-factory/tiktok-metrics");
        return refreshTikTokAccount(account, { full });
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
      if (yt.candidates > 0 && yt.refreshed === 0) {
        problems.push(`YouTube: 0 of ${yt.candidates} Shorts refreshed. Errors: ${yt.errors.join(" | ") || "none captured"}`);
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
