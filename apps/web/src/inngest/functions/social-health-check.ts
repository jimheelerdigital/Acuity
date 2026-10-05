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
 * · TikTok scrape freshness · competitor-account
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
    // Meta data-access expiry (2026-09-30, per Keenan: "send me an email to
    // keep an eye out at that reminder - make sure subject says URGENT").
    // Never-expiring Page tokens still stop working when the app's 90-day
    // data access lapses. From 14 days out, a separate URGENT email goes
    // out every morning until the token is renewed.
    await step.run("meta-data-access", async () => {
      const keys = ["IG_ACCESS_TOKEN", "META_BWK_ACCESS_TOKEN", "META_MYTHICALS_ACCESS_TOKEN"];
      const found: { key: string; expires: Date | null; error?: string }[] = [];
      for (const key of keys) {
        const t = process.env[key]?.trim();
        if (!t) continue;
        try {
          const r = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(t)}&access_token=${encodeURIComponent(t)}`,
            { signal: AbortSignal.timeout(15_000) }
          );
          const j = (await r.json()) as { data?: { is_valid?: boolean; data_access_expires_at?: number } };
          if (!j.data?.is_valid) {
            found.push({ key, expires: null, error: "token is INVALID" });
            continue;
          }
          const at = j.data.data_access_expires_at;
          found.push({ key, expires: at ? new Date(at * 1000) : null });
        } catch (err) {
          console.warn(`[health] debug_token failed for ${key}:`, err instanceof Error ? err.message : err);
        }
      }
      const soon = found.filter((f) => f.error || (f.expires && f.expires.getTime() - Date.now() < 14 * 86_400_000));
      if (soon.length === 0) return { ok: true, found: found.map((f) => `${f.key}: ${f.expires?.toISOString().slice(0, 10)}`) };
      const first = soon.map((f) => f.expires).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0];
      const days = first ? Math.max(0, Math.ceil((first.getTime() - Date.now()) / 86_400_000)) : 0;
      const { sendEmailOrThrow } = await import("@/lib/resend");
      await sendEmailOrThrow({
        from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        subject: `URGENT: Meta access for Instagram/Facebook posting ${soon.some((f) => f.error) ? "is BROKEN" : `expires in ${days} day${days === 1 ? "" : "s"}`}`,
        html: `<p><b>Action needed.</b> Meta's data access for the Ripple Post Publisher app ${
          soon.some((f) => f.error) ? "has failed" : `ends on <b>${first!.toDateString()}</b>`
        }. When it lapses, Instagram/Facebook posting and stats for Ripple, BWK and Legendary Mythicals can stop.</p>
<p><b>To renew (5 minutes):</b> developers.facebook.com/tools/explorer → app <b>Ripple Post Publisher</b> → Generate Access Token → approve all three Pages and Instagram accounts → click "Continue as Keenan" (ignore the review warning) → extend it in the Access Token Tool → send the token to Claude, who re-issues all three brands' tokens.</p>
<p>${soon.map((f) => `${f.key}: ${f.error ?? f.expires?.toDateString()}`).join("<br>")}</p>`,
      });
      return { ok: false, days };
    });

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

      // 5. Research inputs (the Reddit digest check was removed 2026-10-03:
      // the weekly Reddit scrape is off and nothing depends on it).
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

      // 6. Today's posts + Higgsfield videos (2026-09-28, per Keenan: "adjust
      // this so we don't run into future issues"). Runs 2h before the first
      // IG/FB slot. Self-heals once: a lane with no post today is re-run, a
      // video lane whose build failed or came out with no animation is
      // rebuilt (finished clips are cached, so no double Higgsfield spend).
      {
        const { supabase } = await import("@/lib/supabase.server");
        const { laneWantsReel } = await import("@/lib/content-factory/social-publish");
        const { readVideoMarker, maxAnimatedSlides, readCreditsFlag, writeCreditsFlag, CREDITS_ALERT_EVERY_MS } =
          await import("@/lib/content-factory/post-video");
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const lanes = await prisma.contentLane.findMany({
          where: { status: { not: "RETIRED" } },
          select: { key: true, hoursUtc: true, brand: true },
        });
        const brandOf = new Map(lanes.map((l) => [l.key, l.brand]));
        const posts = await prisma.carouselPost.findMany({
          where: { generatedFor: today },
          select: { id: true, lane: true },
        });
        const have = new Set(posts.map((p) => p.lane));
        const missing = lanes.filter((l) => l.hoursUtc.length > 0 && !have.has(l.key)).map((l) => l.key);
        for (const lane of missing) {
          await supabase.storage
            .from("content-factory")
            .upload(`lane-requests/${lane}.json`, Buffer.from("{}"), { contentType: "application/json", upsert: true });
        }
        if (missing.length) {
          out.push(`${missing.length} lane(s) produced no post overnight: ${missing.join(", ")} — re-running them now.`);
        }
        const broken: string[] = [];
        let noCreditPosts = 0;
        for (const p of posts) {
          if (!laneWantsReel(p.lane)) continue;
          const m = await readVideoMarker(p.id);
          // Brands with no animation budget (Ripple since 09-30) ship stills
          // videos on purpose: only a missing or failed build is broken.
          const wantsAnimation = maxAnimatedSlides(brandOf.get(p.lane ?? "") ?? "ripple", p.lane) > 0;
          const bad =
            !m || m.status === "failed" || (wantsAnimation && m.status === "done" && m.source !== "higgsfield");
          if (!bad) continue;
          // Shipped as stills because Higgsfield is out of credits: on
          // purpose, not broken — rebuilding would just fail again.
          if (m?.stillsReason === "no-credits") {
            noCreditPosts++;
            continue;
          }
          broken.push(`${p.lane} (${m ? m.status : "no build"}${m?.error ? `: ${m.error.slice(0, 80)}` : ""})`);
          await supabase.storage
            .from("content-factory")
            .upload(`video-requests/${p.id}.json`, Buffer.from("{}"), { contentType: "application/json", upsert: true });
        }
        if (broken.length) {
          out.push(`${broken.length} post video(s) failed or are missing their animation — rebuilding now: ${broken.join("; ")}`);
        }
        // Higgsfield credits (2026-10-02): one line every 3 days while out.
        const credits = await readCreditsFlag();
        if (credits?.out && (!credits.alertedAt || now - Date.parse(credits.alertedAt) > CREDITS_ALERT_EVERY_MS)) {
          out.push(
            `Higgsfield is out of credits (since ${credits.since?.slice(0, 10) ?? "?"}). ${noCreditPosts} of today's video posts went out as slideshows instead. Top up at cloud.higgsfield.ai and videos resume on their own. Last error: ${credits.lastError?.slice(0, 160) ?? "?"}`
          );
          await writeCreditsFlag({ ...credits, alertedAt: new Date(now).toISOString() });
        }
      }

      // 6b. Meta tokens alive (2026-10-04: the Mythicals token died when
      // Facebook reset Keenan's login session, and two posts failed before
      // anyone noticed). debug_token with each brand's own token.
      {
        const { accountForBrand } = await import("@/lib/content-factory/social-publish");
        for (const brand of ["ripple", "bwk", "mythicals"] as const) {
          const acct = accountForBrand(brand);
          if (!acct) continue;
          try {
            const t = encodeURIComponent(acct.accessToken);
            const res = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${t}&access_token=${t}`);
            const json = (await res.json().catch(() => ({}))) as { data?: { is_valid?: boolean; expires_at?: number }; error?: { message?: string } };
            const exp = json.data?.expires_at ?? 0;
            if (!json.data?.is_valid) {
              out.push(`Meta token for ${brand} is INVALID — IG/FB posts for ${brand} will fail. Generate a new one (Graph API Explorer → Ripple Post Publisher) and paste it into Claude Code. ${json.error?.message ?? ""}`.trim());
            } else if (exp > 0 && exp * 1000 - now < 3 * 86_400_000) {
              out.push(`Meta token for ${brand} expires ${new Date(exp * 1000).toISOString().slice(0, 10)} — refresh it now.`);
            }
          } catch (err) {
            console.warn(`[health] token check ${brand} failed:`, err instanceof Error ? err.message : err);
          }
        }
        // Ads tokens too (not Page tokens; separate from posting).
        for (const [label, raw] of [
          ["ads (AdLab / CAPI)", process.env.META_ACCESS_TOKEN],
          ["Mythicals ads", process.env.META_MYTHICALS_ADS_TOKEN],
        ] as const) {
          if (!raw) continue;
          try {
            const t = encodeURIComponent(raw);
            const res = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${t}&access_token=${t}`);
            const json = (await res.json().catch(() => ({}))) as { data?: { is_valid?: boolean; expires_at?: number } };
            const exp = json.data?.expires_at ?? 0;
            if (!json.data?.is_valid) out.push(`Meta ${label} token is INVALID — ads, syncing or conversion tracking will fail.`);
            else if (exp > 0 && exp * 1000 - now < 3 * 86_400_000)
              out.push(`Meta ${label} token expires ${new Date(exp * 1000).toISOString().slice(0, 10)} — refresh it now.`);
          } catch {
            // best effort
          }
        }
        // Keenan asked (2026-10-04) for a Dec 2 reminder: the user token
        // behind the Page tokens expires 2026-12-03. Page tokens made from
        // it never expire, but refresh to be safe.
        if (now >= Date.parse("2026-12-02T00:00:00Z") && now < Date.parse("2026-12-04T00:00:00Z")) {
          out.push("Reminder (set Oct 4): the Meta user token for Ripple Post Publisher expires Dec 3. Generate a new one in the Graph API Explorer (all three brands selected), click Extend Access Token, and paste it into Claude Code.");
        }
      }

      // 7. Learning loops alive (2026-10-02, fix #4 of the 30-day hands-off
      // list): scoreboard, gate track, weekly calibration, research
      // learning all finished on schedule, and Jev isn't mostly failing.
      {
        const { learningProblems } = await import("@/lib/content-factory/learning-health");
        out.push(...(await learningProblems(now)));
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
