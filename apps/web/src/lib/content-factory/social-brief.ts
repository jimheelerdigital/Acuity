/**
 * Weekly Social Brief (2026-10-20, per Keenan: "ONE single weekly sweep of
 * social that dictates our social media push and is sent to me in a
 * brief"). One brief per brand (Ripple, Legendary Mythicals, Build With Key)
 * built from everything the Saturday-night sweep collected:
 *
 *   - our own results: the performance scoreboard (top / bottom posts, post
 *     types) and per-lane counts for the last 14 days
 *   - the existing weekly brief's how/what lessons (Ripple, Mythicals)
 *   - competitors' organic outliers + mimic briefs (Ripple, BWK)
 *   - Reddit audience pulse (Ripple, BWK; Reddit has blocked our RSS feed
 *     since 2026-10-03, so this is usually empty, and the brief says so)
 *   - competitors' Meta ads (Ripple ad groups women / men)
 *   - UGC creators waiting for review and newly discovered niche accounts
 *
 * Opus turns that into one plan per brand. Stored in the content-factory
 * bucket at social-briefs/latest-<brand>.json (+ a dated copy) and emailed
 * Sunday 9am Central by social-weekly-sweep.ts.
 */
import { contentAnthropic, lastJsonText, messageText } from "./claude-client";

export type SocialBrand = "ripple" | "mythicals" | "bwk";
export const SOCIAL_BRANDS: SocialBrand[] = ["ripple", "mythicals", "bwk"];
const BRAND_LABEL: Record<SocialBrand, string> = { ripple: "Ripple", mythicals: "Legendary Mythicals", bwk: "Build With Key" };
const BUCKET = "content-factory";

export interface SocialBrief {
  brand: SocialBrand;
  builtAt: string;
  headline: string;
  whatWorked: string[];
  whatFlopped: string[];
  competitorMoves: string[];
  audiencePulse: string[];
  nextWeek: { keep: string[]; kill: string[]; start: string[]; hooksToTest: string[]; formatsToTest: string[]; adAngles: string[] };
  needsYourYes: string[];
  /** Which inputs were missing, said plainly in the email. */
  gaps: string[];
  stats: { ownPosts: number; competitorBriefs: number; redditThemes: number; ugcQueued: number };
}

type Inputs = { text: string; gaps: string[]; stats: SocialBrief["stats"] };

export async function gather(brand: SocialBrand): Promise<Inputs> {
  const { prisma } = await import("@/lib/prisma");
  const gaps: string[] = [];
  const parts: string[] = [];
  const stats = { ownPosts: 0, competitorBriefs: 0, redditThemes: 0, ugcQueued: 0 };
  const since14 = new Date(Date.now() - 14 * 86_400_000);

  // Our own results.
  try {
    const { readScoreboard } = await import("./performance-loop");
    const sb = await readScoreboard(brand);
    if (sb) {
      stats.ownPosts = sb.posts;
      const types = Object.entries(sb.postTypes).sort((a, b) => b[1].mean - a[1].mean).map(([k, v]) => `${k}: n=${v.n}, score ${v.mean.toFixed(2)} (${v.label})`);
      parts.push(
        `OUR RESULTS (scoreboard updated ${sb.updatedAt.slice(0, 10)}, ${sb.posts} scored posts):`,
        `Post types by score: ${types.join("; ") || "none"}`,
        `Top posts: ${sb.top.map((p) => `"${p.title}" [${p.lane}/${p.postType}] score ${p.score.toFixed(2)}, ${p.views ?? "?"} views`).join(" | ") || "none"}`,
        `Bottom posts: ${sb.bottom.map((p) => `"${p.title}" [${p.lane}/${p.postType}] score ${p.score.toFixed(2)}, ${p.views ?? "?"} views`).join(" | ") || "none"}`,
      );
    } else gaps.push("no performance scoreboard yet");
  } catch {
    gaps.push("scoreboard unavailable");
  }

  // Lanes and what they posted in 14 days.
  try {
    const { laneBrand } = await import("./social-publish");
    const lanes = await prisma.contentLane.findMany({ where: { status: { not: "RETIRED" } }, select: { key: true, name: true, status: true, hoursUtc: true } });
    const mine: string[] = [];
    for (const l of lanes) {
      if ((await laneBrand(l.key)) !== brand) continue;
      const n = await prisma.carouselPost.count({ where: { lane: l.key, createdAt: { gte: since14 } } });
      mine.push(`${l.key} "${l.name}" (${l.status}, hours ${l.hoursUtc.join("/")}): ${n} posts in 14 days`);
    }
    parts.push(`ACTIVE LANES: ${mine.join("; ") || "none (brand currently has no active lanes)"}`);
  } catch {
    gaps.push("lane list unavailable");
  }

  // The existing how/what brief (Ripple, Mythicals).
  if (brand !== "bwk") {
    try {
      const { readBrief } = await import("./weekly-brief");
      const b = await readBrief(brand);
      if (b) {
        parts.push(
          `HOW LESSONS (from winners vs losers): ${(b.how ?? []).join(" | ") || "none"}`,
          `WHAT IS WINNING: ${(b.whatWinning ?? []).join(" | ") || "none"}; WHAT IS FLOPPING: ${(b.whatFlopping ?? []).join(" | ") || "none"}`,
        );
      }
    } catch {
      // optional
    }
  }

  // Competitors' organic outliers (Ripple, BWK).
  if (brand !== "mythicals") {
    try {
      const rows = await prisma.competitorPost.findMany({
        where: { isOutlier: true, briefAt: { gte: new Date(Date.now() - 9 * 86_400_000) }, account: { brand, status: { not: "PAUSED" } } },
        orderBy: { outlierScore: "desc" },
        take: 8,
        select: { outlierScore: true, brief: true, account: { select: { handle: true, platform: true } } },
      });
      stats.competitorBriefs = rows.length;
      if (rows.length) {
        parts.push(
          `COMPETITOR BREAKOUTS THIS WEEK: ${rows
            .map((r) => {
              const b = (r.brief ?? {}) as { hook?: string; format?: string; whyItWorks?: string };
              return `@${r.account.handle} (${r.account.platform}, ${r.outlierScore?.toFixed?.(1) ?? "?"}x): hook "${b.hook ?? "?"}", format ${b.format ?? "?"}, why: ${b.whyItWorks ?? "?"}`;
            })
            .join(" | ")}`,
        );
      } else gaps.push("no fresh competitor breakouts");
    } catch {
      gaps.push("competitor data unavailable");
    }

    try {
      const { getTopThemes } = await import("./reddit-trends");
      const themes = await getTopThemes(brand, 5);
      stats.redditThemes = themes.length;
      if (themes.length) parts.push(`AUDIENCE PULSE (Reddit): ${themes.map((t) => `${t.theme}: ${t.why} (angle: ${t.angle})`).join(" | ")}`);
      else gaps.push("audience pulse missing (Reddit blocks our feed since Oct 3)");
    } catch {
      gaps.push("audience pulse missing");
    }
  } else {
    gaps.push("no competitor or Reddit tracking set up for Mythicals (own results only)");
  }

  // Ripple: competitors' Meta ads, UGC queue, niche discoveries.
  if (brand === "ripple") {
    try {
      const { getLatestCompetitorBrief } = await import("@/lib/adlab/competitor-research");
      for (const g of ["women", "men"] as const) {
        const b = await getLatestCompetitorBrief(g);
        if (b) parts.push(`COMPETITOR META ADS (${g}): ${b.summary} Hooks: ${b.hooks.slice(0, 5).join(" | ")}. Opportunities: ${b.opportunities.slice(0, 4).join(" | ")}`);
      }
    } catch {
      gaps.push("competitor ad research unavailable");
    }
    try {
      const queued = await prisma.ugcCreator.findMany({ where: { status: "queued" }, orderBy: { score: "desc" }, take: 5, select: { handle: true } });
      const total = await prisma.ugcCreator.count({ where: { status: "queued" } });
      stats.ugcQueued = total;
      if (total) parts.push(`UGC CREATORS WAITING FOR REVIEW: ${total} (top: ${queued.map((c) => "@" + c.handle).join(", ")})`);
    } catch {
      // optional
    }
  }

  return { text: parts.join("\n\n"), gaps, stats };
}

const SYSTEM = `You write the weekly social media brief for one brand. It decides what the brand posts next week. The reader is Keenan, a non-technical founder: plain words, short lines, specific, no jargon, no hype. Base every point on the data given; if the data is thin, say so instead of inventing. Never invent numbers or competitor results.

The nextWeek plan is read by the brand's automatic post writers, so it must fit the ACTIVE LANES listed in the data (their formats): keep, hooksToTest, formatsToTest and kill must be things those lanes can do. Anything that needs a new lane, a retired format or a lane turned on/off goes in needsYourYes instead, never in the plan.

Return ONLY JSON:
{"headline": "one sentence: the most important thing about this brand's social this week",
 "whatWorked": ["2-4 specific points, each naming the post/type and why it worked"],
 "whatFlopped": ["1-3 points"],
 "competitorMoves": ["0-4 things competitors did that worked and how we'd use them"],
 "audiencePulse": ["0-3 things the audience is talking about"],
 "nextWeek": {"keep": ["lanes/formats to keep"], "kill": ["lanes/formats to stop, only with evidence"], "start": ["0-2 new things to try"], "hooksToTest": ["3-5 hooks written out, ready to use"], "formatsToTest": ["0-3"], "adAngles": ["0-3, Ripple only"]},
 "needsYourYes": ["decisions Keenan must make, e.g. kill/start a lane; empty if none"]}`;

const BRAND_RULES: Record<SocialBrand, string> = {
  ripple: "Ripple: AI life optimizer for women ~40-50 carrying a heavy mental load (habit tracker, voice journal, insights). The niche is the load in HER head (remembering, tracking, over-functioning), never relationship advice or blaming a partner. Never claim it treats or replaces therapy, no recording-duration claims, no time-of-day framing; the feature is called a 'debrief'. Its live lanes and their formats are in the data (ACTIVE LANES).",
  mythicals: "Legendary Mythicals: epic fantasy creatures, weapons and armor; 'which would you choose' style videos. No real animals.",
  bwk: "Build With Key: men's discipline / self-improvement content. Keenan is restarting it and will post by hand, so give him a concrete starter plan even if data is thin.",
};

export async function buildSocialBrief(brand: SocialBrand): Promise<SocialBrief> {
  const { CANDIDATE_WRITER_MODEL } = await import("./candidate-pipeline");
  const inputs = await gather(brand);
  const res = await contentAnthropic.messages.create({
    model: CANDIDATE_WRITER_MODEL,
    max_tokens: 3000,
    system: `${SYSTEM}\n\nBRAND: ${BRAND_RULES[brand]}`,
    messages: [{ role: "user", content: `Data for ${BRAND_LABEL[brand]}, week ending ${new Date().toISOString().slice(0, 10)}:\n\n${inputs.text || "(no data)"}\n\nMissing inputs: ${inputs.gaps.join("; ") || "none"}\n\nReturn ONLY the JSON.` }],
  });
  try {
    const { prisma } = await import("@/lib/prisma");
    void prisma.claudeCallLog
      .create({ data: { purpose: "social-brief", model: CANDIDATE_WRITER_MODEL, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens, costCents: Math.ceil((res.usage.input_tokens * 4 + res.usage.output_tokens * 20) / 10_000), durationMs: 0, success: true } })
      .catch(() => {});
  } catch {
    // logging only
  }
  const j = JSON.parse(lastJsonText(messageText(res))) as Partial<SocialBrief>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const nw = (j.nextWeek ?? {}) as Partial<SocialBrief["nextWeek"]>;
  const brief: SocialBrief = {
    brand,
    builtAt: new Date().toISOString(),
    headline: String(j.headline ?? ""),
    whatWorked: arr(j.whatWorked),
    whatFlopped: arr(j.whatFlopped),
    competitorMoves: arr(j.competitorMoves),
    audiencePulse: arr(j.audiencePulse),
    nextWeek: { keep: arr(nw.keep), kill: arr(nw.kill), start: arr(nw.start), hooksToTest: arr(nw.hooksToTest), formatsToTest: arr(nw.formatsToTest), adAngles: arr(nw.adAngles) },
    needsYourYes: arr(j.needsYourYes),
    gaps: inputs.gaps,
    stats: inputs.stats,
  };
  const { supabase } = await import("@/lib/supabase.server");
  const body = Buffer.from(JSON.stringify(brief, null, 1));
  const day = brief.builtAt.slice(0, 10);
  for (const path of [`social-briefs/latest-${brand}.json`, `social-briefs/${day}/${brand}.json`]) {
    await supabase.storage.from(BUCKET).upload(path, body, { contentType: "application/json", upsert: true });
  }
  return brief;
}

/**
 * The Social Brief's plan as a writer prompt block (2026-10-20, per Keenan:
 * "connect the research to the social posting lanes"). Appended to every
 * writer's weekly-brief block via readBriefBlock, so each lane reads next
 * week's hooks, formats and keep/stop guidance. "" when there's no brief
 * from the last 9 days. Lane on/off decisions stay with Keenan.
 */
export async function socialBriefBlock(brand: SocialBrand): Promise<string> {
  try {
    const b = await readSocialBrief(brand);
    if (!b || Date.now() - new Date(b.builtAt).getTime() > 9 * 86_400_000) return "";
    return socialPlanBlock(b);
  } catch {
    return "";
  }
}

/** Pure formatter for socialBriefBlock (testable without storage). */
export function socialPlanBlock(b: SocialBrief): string {
  {
    const nw = b.nextWeek;
    const line = (label: string, items: string[]) => (items.length ? `${label}\n${items.map((i) => `- ${i}`).join("\n")}` : "");
    const block = [
      `THIS WEEK'S SOCIAL PLAN (from the weekly Social Brief, ${b.builtAt.slice(0, 10)}; built from our results, competitor breakouts and the audience):`,
      line("Working now:", b.whatWorked.slice(0, 3)),
      line("Flopping now:", b.whatFlopped.slice(0, 3)),
      line("Lean into:", nw.keep),
      line("Hook ideas to try (adapt one to THIS post's format and topic when it fits; never copy one word for word, and don't reuse a hook a recent post already used):", nw.hooksToTest),
      line("Formats worth testing:", nw.formatsToTest),
      line("Steer away from:", nw.kill),
    ]
      .filter(Boolean)
      .join("\n\n");
    return block.slice(0, 3500);
  }
}

export async function readSocialBrief(brand: SocialBrand): Promise<SocialBrief | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data } = await supabase.storage.from(BUCKET).download(`social-briefs/latest-${brand}.json`);
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as SocialBrief;
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const list = (title: string, items: string[]) =>
  items.length ? `<p style="margin:14px 0 4px;font-weight:700;font-size:14px;color:#111">${title}</p><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5;color:#222">${items.map((i) => `<li style="margin:0 0 4px">${esc(i)}</li>`).join("")}</ul>` : "";

export function socialBriefEmailHtml(briefs: SocialBrief[]): string {
  const yes = briefs.flatMap((b) => b.needsYourYes.map((y) => `${BRAND_LABEL[b.brand]}: ${y}`));
  const sections = briefs
    .map((b) => {
      const nw = b.nextWeek;
      return `<div style="border-top:3px solid #F97E4E;margin:28px 0 0;padding-top:12px">
<h2 style="font-size:19px;margin:0 0 6px;color:#111">${BRAND_LABEL[b.brand]}</h2>
<p style="font-size:15px;margin:0 0 6px;color:#111"><b>${esc(b.headline)}</b></p>
<p style="font-size:12px;color:#888;margin:0">${b.stats.ownPosts} scored posts · ${b.stats.competitorBriefs} competitor breakouts · ${b.stats.redditThemes} audience themes${b.brand === "ripple" ? ` · ${b.stats.ugcQueued} UGC creators to review` : ""}</p>
${list("What worked", b.whatWorked)}${list("What flopped", b.whatFlopped)}${list("Competitors", b.competitorMoves)}${list("Audience pulse", b.audiencePulse)}
<p style="margin:16px 0 0;font-weight:800;font-size:15px;color:#F97E4E">Next week</p>
${list("Keep", nw.keep)}${list("Stop", nw.kill)}${list("Start", nw.start)}${list("Hooks to test", nw.hooksToTest)}${list("Formats to test", nw.formatsToTest)}${list("Ad angles", nw.adAngles)}
${b.gaps.length ? `<p style="font-size:12px;color:#a66;margin:12px 0 0">Missing this week: ${esc(b.gaps.join("; "))}</p>` : ""}
</div>`;
    })
    .join("");
  return `<!DOCTYPE html><html><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;"><div style="max-width:640px;margin:0 auto;padding:24px 20px;">
<h1 style="font-size:22px;margin:0 0 4px;color:#111">Weekly Social Brief</h1>
<p style="font-size:13px;color:#666;margin:0 0 12px">Week ending ${new Date().toISOString().slice(0, 10)} · one sweep, one plan per brand</p>
${yes.length ? `<div style="background:#FFF4EE;border-radius:10px;padding:12px 16px;margin:0 0 8px"><p style="margin:0 0 6px;font-weight:700;font-size:14px">Needs your yes</p><ul style="margin:0;padding-left:20px;font-size:14px;line-height:1.5">${yes.map((y) => `<li>${esc(y)}</li>`).join("")}</ul></div>` : ""}
${sections}
<p style="font-size:11px;color:#999;margin:24px 0 0">Built from the Saturday-night social sweep: our post results, competitor breakouts, competitor Meta ads, the audience pulse and the UGC queue.</p>
</div></body></html>`;
}
