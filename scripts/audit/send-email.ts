/**
 * Weekly audit — email the report (or a failure notice) via Resend.
 *
 * Success: audits/out/report.md exists and has sections → rendered to
 *   mobile-readable HTML, subject "Ripple Weekly Audit — <date> — <big move>".
 * Failure: anything else → an email saying what broke (job result, collector
 *   crash, blind spots, Claude's stderr tail, run link). Keenan should never
 *   get silence on a Saturday.
 *
 * Env: RESEND_API_KEY (required), AUDIT_EMAIL_TO, AUDIT_EMAIL_FROM,
 *      AUDIT_JOB_RESULT (needs.audit.result), AUDIT_RUN_URL, AUDIT_DRY_RUN=1
 *      (writes audits/out/email.html instead of sending).
 * Exits non-zero only when the email itself could not be sent.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "marked";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const out = (f: string) => path.join(root, "audits", "out", f);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const TO = (process.env.AUDIT_EMAIL_TO || "keenan@heelerdigital.com,jim@heelerdigital.com").split(",").map((s) => s.trim()).filter(Boolean);
// goripple.io is the verified Resend domain but has no MX — replies must go elsewhere.
const FROM = process.env.AUDIT_EMAIL_FROM || "Ripple Audit <hello@goripple.io>";
const REPLY_TO = process.env.AUDIT_EMAIL_REPLY_TO || "keenan@heelerdigital.com";
const RUN_URL = process.env.AUDIT_RUN_URL || "";
const JOB_RESULT = process.env.AUDIT_JOB_RESULT || "unknown";

const date = read(path.join(root, "audits", "data", "LATEST")).trim() || new Date().toISOString().slice(0, 10);
const data = (() => { try { return JSON.parse(read(path.join(root, "audits", "data", `${date}.json`))); } catch { return null; } })();
const report = read(out("report.md"));
const claude = (() => { try { return JSON.parse(read(out("claude-result.json"))); } catch { return null; } })();
const ok = report.length > 2000 && /^## 1\./m.test(report);

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Gmail keeps <style> in <head> (element + class selectors) and clips bodies
// over ~102KB, so styling lives in one stylesheet, not inline on every tag.
const CSS = `
body{margin:0;padding:0;background:#f4f1ec;-webkit-text-size-adjust:100%}
.wrap{max-width:680px;margin:0 auto;padding:16px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#1f2328}
h1{font-size:22px;line-height:1.25;margin:4px 0 12px}
h2{font-size:19px;line-height:1.3;margin:28px 0 8px;padding-top:14px;border-top:1px solid #e6e1d8}
h3{font-size:16px;margin:18px 0 6px}
p,li{margin:0 0 10px}
ul,ol{padding-left:22px;margin:0 0 12px}
a{color:#7a4fd6}
code{font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;background:#f3f0fa;padding:1px 4px;border-radius:4px;word-break:break-word}
pre{background:#f6f8fa;border:1px solid #e1e4e8;border-radius:6px;padding:10px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
pre code{background:none;padding:0;font-size:12px}
blockquote{margin:0 0 12px;padding:4px 12px;border-left:3px solid #c9b8f0;color:#57606a}
.tbl{overflow-x:auto;margin:0 0 14px}
table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.35}
th,td{border:1px solid #e1e4e8;padding:6px 7px;text-align:left;vertical-align:top}
th{background:#f6f3fb}
.meta{font-size:12px;color:#6e7781;margin:0 0 14px}
.bad{background:#fff4f4;border:1px solid #f0c2c2;border-radius:6px;padding:10px 12px;margin:0 0 14px}
hr{border:0;border-top:1px solid #e6e1d8;margin:20px 0}
@media (max-width:480px){.wrap{padding:14px 12px;font-size:15px}h1{font-size:20px}h2{font-size:17px}table{font-size:12px}th,td{padding:4px 5px}}
`;

function page(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
}

function sourcesLine(): string {
  if (!data?.sources_status) return "";
  const s = Object.entries(data.sources_status).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const cost = typeof claude?.total_cost_usd === "number" ? ` · audit run cost ≈ $${claude.total_cost_usd.toFixed(2)}` : "";
  return `<p class="meta">Data sources — ${escapeHtml(s)}${escapeHtml(cost)}${RUN_URL ? ` · <a href="${RUN_URL}">run log</a>` : ""}</p>`;
}

function renderReport(): string {
  const html = marked.parse(report, { gfm: true, async: false }) as string;
  // Wide tables scroll sideways instead of blowing out the phone layout.
  return html.replace(/<table>/g, '<div class="tbl"><table>').replace(/<\/table>/g, "</table></div>");
}

function bigMove(): string {
  let m = read(out("big-move.txt")).split("\n")[0]?.trim().replace(/^["'“]|["'”.]$/g, "") ?? "";
  if (!m) {
    // Fallback: first sentence of section 2.
    const sec = report.split(/^## 2\..*$/m)[1]?.split(/^## /m)[0] ?? "";
    m = sec.replace(/[#*_`>]/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  }
  const words = m.split(/\s+/).filter(Boolean);
  return words.slice(0, 7).join(" ") || "see report";
}

function failureBody(): { subject: string; html: string; text: string } {
  const reasons: string[] = [];
  if (JOB_RESULT !== "success") reasons.push(`Audit job result: <b>${escapeHtml(JOB_RESULT)}</b> (timeout, crash, or cancelled).`);
  if (!data) reasons.push("No metrics file was produced — the collector did not run or crashed before writing.");
  if (data?.crashed) reasons.push(`Collector crashed: <pre>${escapeHtml(String(data.crashed).slice(0, 1500))}</pre>`);
  if (!report) reasons.push("Claude did not write audits/out/report.md.");
  else if (!ok) reasons.push(`Report was incomplete (${report.length} chars, section 1 missing).`);
  if (claude?.is_error || (claude?.subtype && claude.subtype !== "success")) reasons.push(`Claude Code ended with <b>${escapeHtml(String(claude.subtype ?? "error"))}</b>: ${escapeHtml(String(claude.result ?? "").slice(0, 600))}`);
  const stderr = read(out("claude-stderr.log")).trim().split("\n").slice(-25).join("\n");
  if (stderr) reasons.push(`Claude stderr (last lines):<pre>${escapeHtml(stderr)}</pre>`);
  if (!reasons.length) reasons.push("Unknown — check the run log.");
  const blind = (data?.blind_spots ?? []) as Array<{ source: string; error: string; fix?: string }>;
  const blindHtml = blind.length
    ? `<h2>Data blind spots this week</h2><ul>${blind.map((b) => `<li><b>${escapeHtml(b.source)}</b>: ${escapeHtml(b.error)}${b.fix ? ` <i>Fix: ${escapeHtml(b.fix)}</i>` : ""}</li>`).join("")}</ul>`
    : "";
  const body = `<h1>Ripple Weekly Audit — ${date} — did not complete</h1>
${sourcesLine()}
<div class="bad"><p><b>What broke</b></p><ul>${reasons.map((r) => `<li>${r}</li>`).join("")}</ul></div>
<p>Re-run on demand: GitHub → Actions → <b>Weekly audit</b> → <b>Run workflow</b>.${RUN_URL ? ` <a href="${RUN_URL}">Open this run</a>.` : ""}</p>
${blindHtml}`;
  const text = `Ripple Weekly Audit — ${date} — did not complete\n\n${reasons.map((r) => "- " + r.replace(/<[^>]+>/g, "")).join("\n")}\n${RUN_URL}`;
  return { subject: `Ripple Weekly Audit — ${date} — FAILED, see what broke`, html: page("Ripple Weekly Audit failed", body), text };
}

async function main() {
  let subject: string, html: string, text: string;
  const attachments: Array<{ filename: string; content: string }> = [];
  if (ok) {
    subject = `Ripple Weekly Audit — ${date} — ${bigMove()}`;
    html = page(subject, sourcesLine() + renderReport());
    text = report;
    attachments.push({ filename: `ripple-audit-${date}.md`, content: Buffer.from(report).toString("base64") });
    if (html.length > 100_000) {
      // Gmail clips past ~102KB; say so up front so nothing reads as "missing".
      html = html.replace('<div class="wrap">', '<div class="wrap"><p class="meta">Long report: if Gmail shows "[Message clipped]", tap it, or open the attached .md.</p>');
    }
  } else {
    ({ subject, html, text } = failureBody());
  }

  writeFileSync(out("email.html"), html);
  console.log(`[email] ${ok ? "report" : "FAILURE notice"} · ${Math.round(html.length / 1024)}KB · subject: ${subject}`);
  if (process.env.AUDIT_DRY_RUN === "1") return;

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TO, reply_to: REPLY_TO, subject, html, text, attachments }),
  });
  // Resend reports failures in the body too — never assume a 200 means sent.
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.id) throw new Error(`Resend send failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`[email] sent to ${TO.join(", ")} — id ${body.id}`);
}

main().catch((err) => {
  console.error("[email]", err);
  process.exit(1);
});
