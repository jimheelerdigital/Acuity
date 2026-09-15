/**
 * Content Factory — per-lane performance feedback for topic generation
 * (2026-09-14, per Keenan: "this should be a completely independent,
 * learning system. it should take feedback on prior posts when building
 * everything out").
 *
 * Turns real engagement numbers into a prompt block that every lane's
 * nightly topic call receives: the lane's recent winners and flops, so
 * the model leans into what the audience actually rewards instead of
 * generating blind.
 *
 * Metric sources (summed per post):
 * - CarouselPost.views/likes/comments/saves/shares — Instagram numbers
 *   (auto-refreshed nightly) or Keenan's hand-entered numbers.
 * - SocialPublish rows (facebook, and tiktok once its metrics API is
 *   live) — per-platform numbers refreshed by the same nightly cron.
 *
 * Scoring: saves and shares are weighted far above views because they
 * are the signals the IG/TikTok algorithms reward with reach — a
 * 500-view post with 40 saves beats a 5000-view post nobody saved.
 *
 * Degrades to null (→ generators run exactly as before) until a lane
 * has at least MIN_SCORED posts with any metrics — new lanes learn
 * nothing until they have something to learn from.
 */

const LOOKBACK_DAYS = 45;
const MIN_SCORED = 4;
const GROUP_SIZE = 3;

interface ScoredPost {
  headline: string;
  score: number;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

function fmt(p: ScoredPost): string {
  const parts = [
    p.views ? `${p.views} views` : null,
    p.likes ? `${p.likes} likes` : null,
    p.comments ? `${p.comments} comments` : null,
    p.saves ? `${p.saves} saves` : null,
    p.shares ? `${p.shares} shares` : null,
  ].filter(Boolean);
  return `- "${p.headline}" (${parts.length > 0 ? parts.join(", ") : "no engagement"})`;
}

/**
 * Build the audience-feedback prompt block for a lane, or null when the
 * lane doesn't have enough measured posts yet.
 */
export async function getLaneFeedback(lane: string): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const posts = await prisma.carouselPost.findMany({
    where: {
      lane,
      generatedFor: { gte: since },
      OR: [
        { views: { not: null } },
        { likes: { not: null } },
        { saves: { not: null } },
        { shares: { not: null } },
        { socialPublishes: { some: { metricsAt: { not: null } } } },
      ],
    },
    select: {
      headline: true,
      views: true,
      likes: true,
      comments: true,
      saves: true,
      shares: true,
      socialPublishes: {
        where: { metricsAt: { not: null } },
        select: {
          views: true,
          likes: true,
          comments: true,
          saves: true,
          shares: true,
        },
      },
    },
  });

  const scored: ScoredPost[] = posts.map((p) => {
    // CarouselPost columns are the IG numbers; sum the non-IG platform
    // rows on top. IG SocialPublish rows mirror the CarouselPost columns,
    // so only count rows for OTHER platforms to avoid double-counting —
    // easiest proxy: sum all rows, subtract nothing, but skip the mirror
    // by summing platform rows only where they add beyond the mirror is
    // fragile; instead: total = CarouselPost + sum(rows) - (one IG row
    // if present, which equals the CarouselPost columns). Simpler and
    // equivalent: take max(CarouselPost, IG row) once + other rows.
    // In practice the IG row IS the CarouselPost numbers, so:
    let views = p.views ?? 0;
    let likes = p.likes ?? 0;
    let comments = p.comments ?? 0;
    let saves = p.saves ?? 0;
    let shares = p.shares ?? 0;
    let igRowSkipped = false;
    for (const row of p.socialPublishes) {
      // Skip exactly one row matching the CarouselPost numbers (the IG
      // mirror). Everything else (facebook, tiktok) adds.
      if (
        !igRowSkipped &&
        (row.views ?? 0) === (p.views ?? 0) &&
        (row.likes ?? 0) === (p.likes ?? 0) &&
        (row.saves ?? 0) === (p.saves ?? 0)
      ) {
        igRowSkipped = true;
        continue;
      }
      views += row.views ?? 0;
      likes += row.likes ?? 0;
      comments += row.comments ?? 0;
      saves += row.saves ?? 0;
      shares += row.shares ?? 0;
    }
    const score =
      views * 0.01 + likes * 1 + comments * 3 + saves * 8 + shares * 8;
    return { headline: p.headline, score, views, likes, comments, saves, shares };
  });

  if (scored.length < MIN_SCORED) return null;

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(GROUP_SIZE, Math.floor(scored.length / 2)));
  const bottom = scored
    .slice(-Math.min(GROUP_SIZE, Math.floor(scored.length / 2)))
    .reverse();

  return `

AUDIENCE FEEDBACK — real engagement numbers from this lane's recent posts. This is the ground truth on what this audience rewards.

WORKING (highest engagement — study the emotional angle, specificity, and structure these share):
${top.map(fmt).join("\n")}

NOT WORKING (lowest engagement — do not repeat these angles or structures):
${bottom.map(fmt).join("\n")}

Lean hard into what separates the working group from the flops. Do NOT copy the winning headlines — take what made them land (the wound they touch, how concrete they are, their energy) and apply it to fresh ground.`;
}
