/**
 * Weekly research email (2026-10-02, per Keenan: "tell me exactly what we
 * do with that information"). Sent at the end of the Sunday research run:
 * what was scraped, new creators, how each search phrase did, the best
 * briefs, and which sources have actually paid off for us.
 */

import type { ResearchLearning } from "./research-learning";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function table(head: string[], rows: string[][]): string {
  if (!rows.length) return `<p style="color:#777;margin:4px 0 14px">None this week.</p>`;
  const th = head.map((h) => `<th align="left" style="padding:4px 8px;border-bottom:1px solid #ddd">${esc(h)}</th>`).join("");
  const tr = rows
    .map((r) => `<tr>${r.map((c) => `<td style="padding:4px 8px;border-bottom:1px solid #f0f0f0;vertical-align:top">${c}</td>`).join("")}</tr>`)
    .join("");
  return `<table style="border-collapse:collapse;font-size:13px;margin:4px 0 16px">${`<tr>${th}</tr>`}${tr}</table>`;
}

export async function sendResearchReport(run: {
  startedAt: string;
  accountsScraped: number;
  accountsTotal: number;
  keywordRows: { brand: string; keyword: string; results: number; standouts: number }[];
  briefs: number;
  promoted: string[];
  paused: string[];
  keywordChanges: { retired: string[]; added: string[] };
  learning: ResearchLearning | null;
}): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const since = new Date(run.startedAt);
  const newCreators = await prisma.competitorAccount.findMany({
    where: { createdAt: { gte: since }, status: { in: ["DISCOVERED", "ACTIVE"] } },
    select: { handle: true, brand: true, niche: true, _count: { select: { posts: { where: { isOutlier: true } } } } },
  });
  const topNew = newCreators.sort((a, b) => b._count.posts - a._count.posts).slice(0, 10);
  const briefed = await prisma.competitorPost.findMany({
    where: { briefAt: { gte: since } },
    orderBy: { outlierScore: "desc" },
    take: 8,
    select: { url: true, views: true, outlierScore: true, brief: true, account: { select: { handle: true, brand: true } } },
  });

  const sources = Object.entries(run.learning?.sources ?? {}).filter(([, v]) => v.n >= 1).sort((a, b) => b[1].mean - a[1].mean);

  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:760px;font-size:14px;line-height:1.45">
<h1 style="font-size:20px;margin:0 0 6px">Weekly competitor research</h1>
<p style="margin:0 0 14px;color:#555">${run.accountsScraped} of ${run.accountsTotal} tracked accounts scraped, ${run.keywordRows.length} search phrases run, ${run.briefs} briefs written from the posts' real slides and frames. Briefs feed the Ripple/BWK pick posts this week and Sunday's ad batch.</p>

<h2 style="font-size:16px;margin:16px 0 4px">Best briefs this week</h2>
${table(
  ["Post", "Brand", "Hook", "How we'd use it"],
  briefed.map((b) => {
    const br = (b.brief ?? {}) as { hook?: string; howWeApply?: string; seen?: string };
    return [
      `<a href="${esc(b.url)}">@${esc(b.account.handle)}</a><br><span style="color:#777">${b.views.toLocaleString()} views, ${b.outlierScore}x</span>`,
      esc(b.account.brand),
      esc(br.hook ?? ""),
      `${esc(br.howWeApply ?? "")}${br.seen && br.seen !== "slideshow" && br.seen !== "video" ? ` <span style="color:#b45309">(from ${esc(br.seen)} only)</span>` : ""}`,
    ];
  })
)}

<h2 style="font-size:16px;margin:16px 0 4px">New creators found by search</h2>
${table(
  ["Creator", "Brand", "Found by", "Standout posts"],
  topNew.map((a) => [`<a href="https://www.tiktok.com/@${esc(a.handle)}">@${esc(a.handle)}</a>`, esc(a.brand), esc(a.niche ?? ""), String(a._count.posts)])
)}
<p style="margin:0 0 14px;color:#555">Auto-tracked (2+ standouts): ${esc(run.promoted.join(", ") || "none")}. Auto-paused: ${esc(run.paused.join(", ") || "none")}.</p>

<h2 style="font-size:16px;margin:16px 0 4px">Search phrases</h2>
${table(
  ["Brand", "Phrase", "Videos", "Standouts"],
  [...run.keywordRows].sort((a, b) => b.standouts - a.standouts).map((r) => [esc(r.brand), esc(r.keyword), String(r.results), String(r.standouts)])
)}
<p style="margin:0 0 14px;color:#555">Retired (no standouts in 3 runs): ${esc(run.keywordChanges.retired.join(", ") || "none")}. New phrases to test: ${esc(run.keywordChanges.added.join(", ") || "none")}.</p>

<h2 style="font-size:16px;margin:16px 0 4px">Which sources paid off for us</h2>
<p style="margin:0 0 6px;color:#555">Average 48-hour score of our posts built on each source's briefs (1.00 = a typical post). Weak sources stop feeding ideas and get paused; proven ones go first.</p>
${table(
  ["Source", "Label", "Our posts", "Avg score"],
  sources.slice(0, 15).map(([k, v]) => [esc(k.replace(":", ": ")), esc(v.label), String(v.n), v.mean.toFixed(2)])
)}
</div>`;

  const { sendEmailOrThrow } = await import("@/lib/resend");
  await sendEmailOrThrow({
    from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>',
    to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
    subject: `Weekly competitor research — ${run.briefs} briefs, ${newCreators.length} new creators`,
    html,
  });
}
