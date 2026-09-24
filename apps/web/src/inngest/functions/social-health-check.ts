import { inngest } from "@/inngest/client";

/**
 * Daily social-pipeline health check (2026-09-24, social audit Phase 1).
 *
 * Every silent failure the audit found went unnoticed for days or weeks:
 * metrics never saved (0/535 posts), Apify's monthly cap killed competitor
 * scraping on 09-20, TikTok drafts failed with spam_risk, BWK posts queued
 * nowhere. The publish cron only ever emailed on success. This checks the
 * whole pipeline once a day and emails Keenan ONLY when something is wrong
 * — a quiet inbox means healthy.
 *
 * Checks: publish failures/skips (24h) · nothing published in 24h ·
 * IG token/ID actually works (one cheap Graph call) · IG metrics freshness
 * · TikTok scrape freshness · Reddit digest age · competitor-account
 * scrape errors · AdLab competitor brief age.
 *
 * Manual trigger: "content-factory/health.check".
 */
export const socialHealthCheckFn = inngest.createFunction(
  {
    id: "social-health-check",
    name: "Content Factory — Daily Health Check",
    retries: 1,
    triggers: [
      { cron: "0 14 * * *" }, // 9am Central — after the 3 UTC metrics refresh and overnight generation
      { event: "content-factory/health.check" },
    ],
  },
  async ({ step }) => {
    const problems = await step.run("check", async () => {
      const { prisma } = await import("@/lib/prisma");
      const now = Date.now();
      const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
      const age = (d: Date | null | undefined) =>
        d ? `${Math.round((now - d.getTime()) / 3_600_000)}h ago` : "never";
      const out: string[] = [];

      // 1. Publish failures / skips in the last 24h
      const bad = await prisma.socialPublish.groupBy({
        by: ["platform", "accountKey", "status"],
        where: { status: { in: ["FAILED", "SKIPPED"] }, updatedAt: { gte: hoursAgo(24) } },
        _count: true,
      });
      for (const b of bad) {
        const sample = await prisma.socialPublish.findFirst({
          where: { platform: b.platform, accountKey: b.accountKey, status: b.status, updatedAt: { gte: hoursAgo(24) } },
          select: { error: true },
          orderBy: { updatedAt: "desc" },
        });
        out.push(`${b._count} ${b.platform}/${b.accountKey} post(s) ${b.status} in 24h — ${sample?.error?.slice(0, 160) ?? "no error text"}`);
      }

      // 2. Dead-man: nothing auto-published in 24h
      const posted = await prisma.socialPublish.count({
        where: { status: "POSTED", postedAt: { gte: hoursAgo(24) }, platform: { in: ["instagram", "facebook"] } },
      });
      if (posted === 0) out.push("Nothing was auto-published to Instagram/Facebook in the last 24h.");

      // 3. IG credentials actually work
      const token = process.env.IG_ACCESS_TOKEN?.trim();
      const igUser = process.env.IG_USER_ID?.trim();
      if (!token || !igUser) {
        out.push("IG_ACCESS_TOKEN / IG_USER_ID missing — no IG publishing or metrics.");
      } else {
        try {
          const res = await fetch(`https://graph.facebook.com/v21.0/${igUser}?fields=username&access_token=${token}`);
          const json = await res.json();
          if (!res.ok || json.error) out.push(`Instagram token check failed: ${json.error?.message ?? res.status}`);
        } catch (err) {
          out.push(`Instagram token check errored: ${err instanceof Error ? err.message : err}`);
        }
      }

      // 4. Metrics freshness
      const lastIg = await prisma.socialPublish.findFirst({
        where: { platform: "instagram", metricsAt: { not: null } },
        orderBy: { metricsAt: "desc" },
        select: { metricsAt: true },
      });
      if (!lastIg?.metricsAt || lastIg.metricsAt < hoursAgo(36)) {
        out.push(`Instagram metrics last refreshed ${age(lastIg?.metricsAt)} (nightly job may be failing).`);
      }
      for (const acct of ["ripple", "bwk"]) {
        const last = await prisma.tikTokVideo.findFirst({
          where: { accountKey: acct },
          orderBy: { lastScrapedAt: "desc" },
          select: { lastScrapedAt: true },
        });
        if (!last || last.lastScrapedAt < hoursAgo(36)) {
          out.push(`TikTok (${acct}) numbers last scraped ${age(last?.lastScrapedAt)}.`);
        }
      }

      // 5. Research inputs
      for (const brand of ["ripple", "bwk"]) {
        const d = await prisma.redditTrendDigest.findFirst({
          where: { brand },
          orderBy: { date: "desc" },
          select: { date: true },
        });
        if (!d || d.date < hoursAgo(8 * 24)) {
          out.push(`Reddit audience digest (${brand}) is stale — last ${age(d?.date)}. Pulse lanes and the Sunday ad batch depend on it.`);
        }
      }
      const compErrors = await prisma.competitorAccount.findMany({
        where: { status: "ACTIVE", scrapeError: { not: null } },
        select: { handle: true, platform: true, scrapeError: true },
      });
      if (compErrors.length > 0) {
        out.push(
          `${compErrors.length} competitor account scrape(s) failing — e.g. @${compErrors[0].handle} (${compErrors[0].platform}): ${compErrors[0].scrapeError?.slice(0, 140)}`
        );
      }
      const brief = await prisma.adLabCompetitorBrief.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
      if (!brief || brief.date < hoursAgo(9 * 24)) {
        out.push(`AdLab competitor ad brief is stale — last ${age(brief?.date)} (Saturday scrape may have failed).`);
      }

      return out;
    });

    if (problems.length === 0) return { healthy: true };

    await step.run("email", async () => {
      const { sendEmailOrThrow } = await import("@/lib/resend");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      await sendEmailOrThrow({
        from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        replyTo: "keenan@heelerdigital.com",
        subject: `⚠️ Social pipeline: ${problems.length} issue(s) need a look`,
        html: `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:640px;color:#1f2430;">
          <p style="font-size:18px;font-weight:700;margin:0 0 8px;">Daily social health check</p>
          <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">You only get this email when something is wrong.</p>
          <ul style="font-size:13px;line-height:1.7;">${problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
          <p style="font-size:12px;color:#9aa1ad;">Dashboard: <a href="https://goripple.io/admin/content-factory/metrics">goripple.io/admin/content-factory/metrics</a></p>
        </div>`,
      });
    });
    return { healthy: false, problems };
  }
);
