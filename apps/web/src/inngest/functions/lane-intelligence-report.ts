import { inngest } from "@/inngest/client";

/**
 * Sunday lane intelligence report (2026-09-15, co-pilot lane system).
 * Every Sunday morning, computes a median-based autopsy of every content
 * lane (45-day window, per-platform breakdown, TikTok weighted highest
 * because it's our best channel) and emails Keenan a report with:
 *   - a deterministic scoreboard (computed in code, not by the model)
 *   - kill candidates (only lanes with ≥8 measured posts qualify)
 *   - exactly 3 birth candidates, each with a ready-to-paste lane spec
 *     (key, brand, hours, locked THEME, sample hooks)
 * Keenan decides; execution is one click at /admin/content-factory/lanes
 * (or Claude via the same API). The report never acts on its own.
 *
 * Manual trigger: "content-factory/lane.report".
 */

const LOOKBACK_DAYS = 45;
const KILL_MIN_MEASURED = 8;
const PLATFORM_WEIGHT: Record<string, number> = {
  tiktok: 1.5, // our strongest channel — wins/losses there matter most
  instagram: 1,
  facebook: 1,
};

interface Metrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

function engagementScore(m: Metrics): number {
  return m.views * 0.01 + m.likes + m.comments * 3 + m.saves * 8 + m.shares * 8;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

interface LaneStats {
  key: string;
  name: string;
  brand: string;
  status: string;
  template: string;
  origin: string | null;
  posts: number;
  measured: number;
  medianScore: number; // weighted, cross-platform
  platformMedians: Record<string, { posts: number; medianScore: number; medianViews: number }>;
  best: { headline: string; score: number } | null;
  worst: { headline: string; score: number } | null;
  topHeadlines: string[]; // top 2 by score, for the model
  bottomHeadlines: string[]; // bottom 2 by score, for the model
  killEligible: boolean;
}

export const laneIntelligenceReportFn = inngest.createFunction(
  {
    id: "lane-intelligence-report",
    name: "Content Factory — Sunday Lane Intelligence Report",
    retries: 1,
    triggers: [
      { cron: "0 12 * * 0" }, // Sundays 7am Central
      { event: "content-factory/lane.report" },
    ],
  },
  async ({ step, logger }) => {
    const stats = await step.run("compute-lane-stats", async () => {
      const { prisma } = await import("@/lib/prisma");
      const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);

      const [lanes, posts] = await Promise.all([
        prisma.contentLane.findMany({ orderBy: { key: "asc" } }),
        prisma.carouselPost.findMany({
          where: { generatedFor: { gte: since }, lane: { not: null } },
          select: {
            lane: true,
            headline: true,
            views: true,
            likes: true,
            comments: true,
            saves: true,
            shares: true,
            metricsAt: true,
            socialPublishes: {
              where: { metricsAt: { not: null } },
              select: {
                platform: true,
                views: true,
                likes: true,
                comments: true,
                saves: true,
                shares: true,
              },
            },
          },
        }),
      ]);

      const byLane = new Map<string, typeof posts>();
      for (const p of posts) {
        if (!p.lane) continue;
        const arr = byLane.get(p.lane) ?? [];
        arr.push(p);
        byLane.set(p.lane, arr);
      }

      const laneStats: LaneStats[] = lanes.map((lane) => {
        const lanePosts = byLane.get(lane.key) ?? [];
        const scored: {
          headline: string;
          weighted: number;
          perPlatform: Record<string, Metrics>;
        }[] = [];

        for (const p of lanePosts) {
          // Instagram numbers live on the CarouselPost columns; the IG
          // SocialPublish row mirrors them, so prefer the columns and
          // ignore instagram rows to avoid double-counting.
          const perPlatform: Record<string, Metrics> = {};
          const hasIgCols =
            p.views != null || p.likes != null || p.saves != null || p.shares != null;
          const igRow = p.socialPublishes.find((r) => r.platform === "instagram");
          if (hasIgCols || igRow) {
            const src = hasIgCols ? p : igRow!;
            perPlatform.instagram = {
              views: src.views ?? 0,
              likes: src.likes ?? 0,
              comments: src.comments ?? 0,
              saves: src.saves ?? 0,
              shares: src.shares ?? 0,
            };
          }
          for (const row of p.socialPublishes) {
            if (row.platform === "instagram") continue;
            const m = perPlatform[row.platform] ?? {
              views: 0,
              likes: 0,
              comments: 0,
              saves: 0,
              shares: 0,
            };
            m.views += row.views ?? 0;
            m.likes += row.likes ?? 0;
            m.comments += row.comments ?? 0;
            m.saves += row.saves ?? 0;
            m.shares += row.shares ?? 0;
            perPlatform[row.platform] = m;
          }
          if (Object.keys(perPlatform).length === 0) continue; // unmeasured

          const weighted = Object.entries(perPlatform).reduce(
            (sum, [platform, m]) =>
              sum + engagementScore(m) * (PLATFORM_WEIGHT[platform] ?? 1),
            0
          );
          scored.push({ headline: p.headline, weighted, perPlatform });
        }

        scored.sort((a, b) => b.weighted - a.weighted);

        const platformMedians: LaneStats["platformMedians"] = {};
        for (const platform of ["tiktok", "instagram", "facebook"]) {
          const rows = scored
            .filter((s) => s.perPlatform[platform])
            .map((s) => s.perPlatform[platform]);
          if (rows.length === 0) continue;
          platformMedians[platform] = {
            posts: rows.length,
            medianScore: Math.round(median(rows.map(engagementScore)) * 10) / 10,
            medianViews: Math.round(median(rows.map((m) => m.views))),
          };
        }

        return {
          key: lane.key,
          name: lane.name,
          brand: lane.brand,
          status: lane.status,
          template: lane.template,
          origin: lane.origin,
          posts: lanePosts.length,
          measured: scored.length,
          medianScore: Math.round(median(scored.map((s) => s.weighted)) * 10) / 10,
          platformMedians,
          best: scored[0]
            ? { headline: scored[0].headline, score: Math.round(scored[0].weighted) }
            : null,
          worst: scored[scored.length - 1]
            ? {
                headline: scored[scored.length - 1].headline,
                score: Math.round(scored[scored.length - 1].weighted),
              }
            : null,
          topHeadlines: scored.slice(0, 2).map((s) => s.headline),
          bottomHeadlines: scored.slice(-2).map((s) => s.headline),
          killEligible: scored.length >= KILL_MIN_MEASURED && lane.status !== "RETIRED",
        };
      });

      // Rank by weighted median, active lanes first.
      laneStats.sort((a, b) => {
        if ((a.status === "RETIRED") !== (b.status === "RETIRED")) {
          return a.status === "RETIRED" ? 1 : -1;
        }
        return b.medianScore - a.medianScore;
      });
      return laneStats;
    });

    if (stats.length === 0) {
      logger.warn("[lane-report] ContentLane table is empty — skipping");
      return { skipped: true, reason: "no lanes" };
    }

    const activeStats = stats.filter((s) => s.status !== "RETIRED");
    const crossLaneMedian =
      Math.round(median(activeStats.filter((s) => s.measured > 0).map((s) => s.medianScore)) * 10) /
      10;

    // Deterministic scoreboard — computed here, not by the model.
    const scoreboard = stats
      .map((s) => {
        const platforms = Object.entries(s.platformMedians)
          .map(([p, m]) => `${p.slice(0, 2).toUpperCase()} ${m.medianScore} (${m.posts}p)`)
          .join(" / ");
        const lines = [
          `${s.name} [${s.key}] — ${s.brand.toUpperCase()}, ${s.status}${s.killEligible ? "" : s.status === "RETIRED" ? "" : ", not kill-eligible yet"}`,
          `  ${s.posts} posts, ${s.measured} measured — median score ${s.medianScore}${platforms ? ` — by platform: ${platforms}` : ""}`,
        ];
        if (s.best) lines.push(`  best: "${s.best.headline}" (${s.best.score})`);
        if (s.worst && s.measured > 1)
          lines.push(`  worst: "${s.worst.headline}" (${s.worst.score})`);
        return lines.join("\n");
      })
      .join("\n\n");

    const analysis = await step.run("write-analysis", async () => {
      const { callContentClaude } = await import("@/lib/content-factory/claude-client");
      const { copyObjectives } = await import("@/lib/content-factory/copy-objectives");

      const dataBlock = stats
        .map(
          (s) =>
            `- ${s.key} (${s.name}, ${s.brand}, ${s.status}, ${s.template === "code" ? "built-in" : "spec-driven"}${s.origin ? `, origin: ${s.origin}` : ""}): ${s.posts} posts / ${s.measured} measured, median ${s.medianScore}, kill-eligible: ${s.killEligible}. Top: ${s.topHeadlines.map((h) => `"${h}"`).join("; ") || "(none)"}. Bottom: ${s.bottomHeadlines.map((h) => `"${h}"`).join("; ") || "(none)"}.`
        )
        .join("\n");

      return callContentClaude({
        purpose: "lane-intelligence-report",
        maxTokens: 3000,
        // 2026-09-28 (Sonnet 5.5 rewrite): prompt opens with both brand
        // briefs from copyObjectives, reflects BWK's own IG/FB autoposting
        // (since 09-25) and the carousel-only vs Higgsfield video lane
        // formats, and aims recommendations at comments/saves/follows.
        systemPrompt: `You are the content strategist for a two-brand organic content factory. Here is what each brand's posts are for:

${copyObjectives("ripple")}

---

${copyObjectives("bwk")}

---

HOW THE FACTORY WORKS: every content lane is a locked theme that generates one post a day (some twice). Ripple publishes to Instagram and Facebook automatically, with TikTok posted by hand. Build With Key publishes automatically to its own Instagram and Facebook accounts (since 2026-09-25, so its numbers are still small), and its TikTok is posted by hand. Lanes publish in one of two forms: carousel-only lanes post still slides, and video lanes turn the slides into a Higgsfield-animated reel with the text burned on top. Lanes live in a database, so the founder can retire, revive, promote or birth a lane with one click and no deploy.

YOUR JOB: this Sunday report is the founder's decision brief. You recommend; he decides and acts. The goal behind every recommendation is more comments, saves and follows, not more views: views without comments or saves have not been building either account. Say so when a lane gets views but no comments or saves.

SCORING: engagement score = views×0.01 + likes + comments×3 + saves×8 + shares×8, with TikTok weighted 1.5×. Medians are used rather than means so one outlier can't hide a weak lane. Ground every claim in these numbers and cite them. When a lane has too few measured posts to judge (BWK especially), say that instead of guessing. No cheerleading and no filler.

WHAT TO COVER:
- Kill candidates: only lanes marked kill-eligible (at least ${KILL_MIN_MEASURED} measured posts, not already retired) qualify. Recommend 0-2. If nothing deserves killing, say so plainly rather than inventing a kill. Retiring is reversible in one click.
- Testing lanes: for each, recommend promote, keep testing or kill, with the reason from the data.
- Birth candidates: propose exactly 3 new lanes, each aimed at a gap the data shows (for example a recognition format that earns comments, or a concrete, checkable format that earns saves). Use this exact structure for each:
  - Name: <display name>
  - Key: <lowercase-slug>
  - Brand: ripple | bwk (content for men always goes to bwk, never to Ripple's pages)
  - Format: carousel-only | video (Higgsfield-animated reel)
  - Hours UTC: one or two of 5,6,7,8
  - Item headers: yes ("Name." header, protocol style) or no (headerless lines, memento style)
  - Theme: written in the locked-theme register, "THEME — every post belongs to the X family: ..." including rotation and title rules, 60+ words
  - Sample hooks: 3 cover headlines this lane would produce, following the brand's rules above (BWK covers are commands; Ripple covers name what she carries)
  - Why: one sentence grounded in the scoreboard data
- Keep doing: what the best lanes share that is worth protecting.

Write in markdown with exactly these sections:
## The week in one paragraph
## Kill candidates
## Testing lanes
## Birth candidates
## Keep doing

Keep it under 900 words. End with: "Reply with your decisions, or make them yourself at /admin/content-factory/lanes."`,
        userPrompt: `Cross-lane median score (active, measured lanes): ${crossLaneMedian}

LANE DATA (last ${LOOKBACK_DAYS} days):
${dataBlock}

Write this week's lane intelligence report.`,
      });
    });

    await step.run("email-report", async () => {
      const { sendEmailOrThrow } = await import("@/lib/resend");
      const today = new Date().toISOString().slice(0, 10);
      const body = `LANE SCOREBOARD — last ${LOOKBACK_DAYS} days
Score = views×0.01 + likes + comments×3 + saves×8 + shares×8. TikTok weighted 1.5×. Medians, not means.
Cross-lane median (active lanes): ${crossLaneMedian}

${scoreboard}

────────────────────────────────────────

${analysis}
`;
      await sendEmailOrThrow({
        from:
          process.env.CONTENT_FACTORY_EMAIL_FROM ??
          '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        subject: `Lane intelligence report — ${today}`,
        text: body,
      });
    });

    logger.info(`[lane-report] emailed report covering ${stats.length} lanes`);
    return { ok: true, lanes: stats.length };
  }
);
