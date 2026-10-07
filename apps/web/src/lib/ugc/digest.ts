/**
 * UGC outreach emails to Keenan (internal, so Resend is fine here — never
 * for outreach itself). Copies the content-factory digest pattern
 * (daily-digest.ts → sendEmailOrThrow).
 *
 * - Weekly digest (Mondays): failed runs first, then this week's creators to
 *   review (handle, link, persona, type, score, reason, draft) with Approve /
 *   Edit / Skip buttons. The buttons open the logged-in review page; email
 *   links never approve anything themselves (link scanners click links).
 * - Run report: a dry run's 25 creators + what the run cost.
 */
import { PERSONAS, CREATOR_TYPES, OUTREACH_SEND_ENABLED, MIN_SCORE } from "@/lib/ugc/config";
import type { Candidate } from "@/lib/ugc/sources/types";

const FROM = process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple Content" <content@getacuity.io>';
const TO = process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com";
const BASE = (process.env.NEXTAUTH_URL ?? "https://goripple.io").replace(/\/$/, "");
const STUCK_MS = 6 * 3600_000;

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const usd = (n: number) => `$${n.toFixed(2)}`;

function btn(href: string, label: string, color: string) {
  return `<a href="${esc(href)}" style="display:inline-block;padding:7px 14px;margin-right:6px;border-radius:6px;background:${color};color:#fff;text-decoration:none;font-size:13px;font-weight:600">${esc(label)}</a>`;
}

function creatorCard(c: {
  id?: string;
  handle: string;
  platform: string;
  profileUrl: string | null;
  persona: string | null | undefined;
  creatorType: string | null | undefined;
  score: number | null | undefined;
  scoreReason: string | null | undefined;
  emailSubject?: string | null;
  emailDraft?: string | null;
  dmDraft?: string | null;
  claimsStatus?: string | null;
  claimsNotes?: string | null;
  email?: string | null;
  dropped?: string;
  source?: string;
}, withButtons: boolean) {
  const persona = c.persona ? PERSONAS[c.persona as keyof typeof PERSONAS]?.label ?? c.persona : "—";
  const type = c.creatorType ? CREATOR_TYPES[c.creatorType as keyof typeof CREATOR_TYPES]?.label ?? c.creatorType : "—";
  const claimsColor = c.claimsStatus === "passed" ? "#15803d" : c.claimsStatus === "flagged" ? "#b91c1c" : "#b45309";
  const review = `${BASE}/admin/ugc/review?c=${c.id}#${c.id}`;
  return `
<div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin:0 0 14px">
  <div style="font-size:15px;font-weight:700"><a href="${esc(c.profileUrl)}" style="color:#111">@${esc(c.handle)}</a>
    <span style="font-weight:400;color:#6b7280"> · ${esc(c.platform)}${c.source === "manual" ? " · manual add" : ""}</span></div>
  <div style="font-size:13px;color:#374151;margin:4px 0">${esc(persona)} · ${esc(type)} · <b>score ${esc(c.score ?? "—")}</b>${(c.score ?? 0) < MIN_SCORE ? " (below bar)" : ""}${c.email ? ` · ${esc(c.email)}` : " · no email (DM)"}</div>
  ${c.dropped ? `<div style="font-size:12px;color:#b45309">Would drop: ${esc(c.dropped)}</div>` : ""}
  <div style="font-size:13px;color:#111;margin:6px 0">${esc(c.scoreReason ?? "")}</div>
  ${c.claimsStatus ? `<div style="font-size:12px;color:${claimsColor};margin:4px 0">Claims check: ${esc(c.claimsStatus)}${c.claimsNotes ? ` — ${esc(c.claimsNotes)}` : ""}</div>` : ""}
  ${c.emailDraft ? `<div style="font-size:12px;color:#6b7280;margin-top:8px">Subject: ${esc(c.emailSubject)}</div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f9fafb;border-radius:6px;padding:10px;margin:4px 0">${esc(c.emailDraft)}</pre>` : ""}
  ${c.dmDraft ? `<div style="font-size:12px;color:#6b7280">DM version:</div><pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f9fafb;border-radius:6px;padding:10px;margin:4px 0">${esc(c.dmDraft)}</pre>` : ""}
  ${withButtons ? `<div style="margin-top:10px">${btn(review + "&do=approve", "Approve", "#15803d")}${btn(review + "&do=edit", "Edit", "#2563eb")}${btn(review + "&do=skip", "Skip", "#6b7280")}</div>` : ""}
</div>`;
}

function wrap(title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#fff;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111">
<div style="max-width:680px;margin:0 auto;padding:20px 16px">
<h1 style="font-size:20px;margin:0 0 4px">${esc(title)}</h1>
${inner}
<p style="font-size:12px;color:#9ca3af;margin-top:24px">Internal UGC outreach digest. Settings: apps/web/src/lib/ugc/config.ts. Sending is ${OUTREACH_SEND_ENABLED ? "ON" : "OFF"}.</p>
</div></body></html>`;
}

async function send(subject: string, html: string) {
  const { sendEmailOrThrow } = await import("@/lib/resend");
  await sendEmailOrThrow({ from: FROM, to: TO, subject, html });
}

// ─── Weekly digest ─────────────────────────────────────────────────────────

export async function buildWeeklyDigest(now = new Date()) {
  const { prisma } = await import("@/lib/prisma");
  const { loadDashboard } = await import("@/lib/ugc/metrics");
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const runs = await prisma.ugcRun.findMany({ where: { startedAt: { gte: since } }, orderBy: { startedAt: "desc" } });
  const stuck = await prisma.ugcRun.findMany({
    where: { status: "running", startedAt: { lt: new Date(now.getTime() - STUCK_MS) } },
  });
  const queued = await prisma.ugcCreator.findMany({ where: { status: "queued" }, orderBy: { score: "desc" } });
  const ready = await prisma.ugcCreator.count({ where: { status: "approved" } });
  const replies = await prisma.ugcCreator.findMany({ where: { repliedAt: { gte: since } } });
  const briefs = await prisma.ugcBrief.findMany({
    where: { approvedAt: null },
    include: { creator: true },
    orderBy: { createdAt: "desc" },
  });
  const dash = await loadDashboard();
  return { runs, stuck, queued, ready, replies, briefs, dash };
}

export async function sendWeeklyDigest(now = new Date()): Promise<{ queued: number }> {
  const d = await buildWeeklyDigest(now);
  const failed = d.runs.filter((r) => r.status === "failed" || ((r.errors as unknown[] | null)?.length ?? 0) > 0);
  const parts: string[] = [];

  if (failed.length || d.stuck.length) {
    parts.push(`<div style="border:2px solid #b91c1c;border-radius:10px;padding:12px 16px;margin:12px 0;background:#fef2f2">
<div style="font-weight:700;color:#b91c1c">⚠ Pipeline problems this week</div>
${[...d.stuck.map((r) => `<div style="font-size:13px">Run ${esc(r.id)} (${esc(r.kind)}) stuck at "${esc(r.stage)}" since ${esc(r.startedAt.toISOString())}</div>`),
  ...failed.flatMap((r) =>
    ((r.errors as { stage: string; message: string }[] | null) ?? []).map(
      (e) => `<div style="font-size:13px">${esc(r.kind)} run · <b>${esc(e.stage)}</b>: ${esc(e.message)}</div>`
    )
  )].join("")}
</div>`);
  }

  const runLine = d.runs
    .map((r) => `${esc(r.kind)}: ${r.profilesFound} profiles, ${r.queued} queued, Apify ${usd(r.apifyCostUsd)}, models ${usd(r.modelCostUsd)} (${esc(r.status)})`)
    .join("<br>");
  parts.push(`<p style="font-size:13px;color:#374151">${runLine || "No runs this week."}</p>`);

  if (d.dash.warning) parts.push(`<p style="font-size:14px;color:#b45309;font-weight:700">${esc(d.dash.warning)}</p>`);

  parts.push(`<h2 style="font-size:16px;margin:20px 0 8px">To review (${d.queued.length})</h2>`);
  parts.push(d.queued.map((c) => creatorCard(c, true)).join("") || `<p style="font-size:13px">Nothing waiting.</p>`);

  if (d.briefs.length) {
    parts.push(`<h2 style="font-size:16px;margin:20px 0 8px">Briefs to approve (${d.briefs.length})</h2>`);
    parts.push(
      d.briefs
        .map(
          (b) => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin:0 0 12px">
<b>@${esc(b.creator.handle)}</b> · claims: ${esc(b.claimsStatus)}${b.claimsNotes ? ` — ${esc(b.claimsNotes)}` : ""}
<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;background:#f9fafb;border-radius:6px;padding:10px">${esc(b.body)}</pre>
${btn(`${BASE}/admin/ugc/review?b=${b.id}#brief-${b.id}`, "Review brief", "#2563eb")}</div>`
        )
        .join("")
    );
  }

  const o = d.dash.overall;
  parts.push(`<h2 style="font-size:16px;margin:20px 0 8px">Status</h2>
<p style="font-size:13px;line-height:1.6">Ready to send: <b>${d.ready}</b>${OUTREACH_SEND_ENABLED ? "" : " (sending is off — copy from the review page)"}<br>
Replies this week: <b>${d.replies.length}</b>${d.replies.length ? ` (${d.replies.map((r) => "@" + esc(r.handle)).join(", ")}) — check your inbox` : ""}<br>
Offers sent: ${o.offersSent} · reply rate ${o.replyRate == null ? "—" : Math.round(o.replyRate * 100) + "%"} · deals ${o.deals} · paid ${usd(o.paidCents / 100)} · avg cost per trial ${o.avgCostPerTrial == null ? "—" : usd(o.avgCostPerTrial)}<br>
KILL list: ${d.dash.kill.length} · rights ending in 14 days: ${d.dash.rights.length} · rehire: ${d.dash.rehire.length}</p>
<p>${btn(`${BASE}/admin/ugc`, "Open UGC dashboard", "#111827")}</p>`);

  await send(`UGC creators: ${d.queued.length} to review${failed.length || d.stuck.length ? " ⚠ pipeline problems" : ""}`, wrap("UGC creators — weekly", parts.join("")));
  return { queued: d.queued.length };
}

// ─── Run report (dry run) ──────────────────────────────────────────────────

export async function sendRunReportEmail(runId: string): Promise<void> {
  const { prisma } = await import("@/lib/prisma");
  const run = await prisma.ugcRun.findUniqueOrThrow({ where: { id: runId } });
  const list = ((run.candidates ?? []) as unknown as Candidate[]).slice().sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const errors = (run.errors as { stage: string; message: string }[] | null) ?? [];
  const html = wrap(
    `UGC dry run — ${list.length} creators`,
    `<p style="font-size:13px">Apify: <b>${usd(run.apifyCostUsd)}</b> · Models + transcripts: <b>${usd(run.modelCostUsd)}</b> · Total: <b>${usd(run.apifyCostUsd + run.modelCostUsd)}</b><br>
Nothing was saved or sent. Full report: <a href="${BASE}/admin/ugc/runs/${run.id}">${BASE}/admin/ugc/runs/${run.id}</a></p>
${errors.length ? `<div style="border:2px solid #b91c1c;border-radius:8px;padding:10px;background:#fef2f2;font-size:13px">${errors.map((e) => `<div><b>${esc(e.stage)}</b>: ${esc(e.message)}</div>`).join("")}</div>` : ""}
${list.map((c) => creatorCard({ ...c, persona: c.persona ?? null, creatorType: c.creatorType ?? null, score: c.score ?? null, scoreReason: c.scoreReason ?? null }, false)).join("")}`
  );
  await send(`UGC dry run: ${list.length} creators, ${usd(run.apifyCostUsd + run.modelCostUsd)}`, html);
}
