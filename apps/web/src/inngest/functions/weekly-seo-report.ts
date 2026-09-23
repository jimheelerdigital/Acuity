/**
 * Weekly SEO metrics report — every Sunday, emails Keenan a trend view
 * of how goripple.io is performing in Google Search: weekly impressions/
 * clicks/position over the last 12 weeks, top queries and pages for the
 * most recent week with week-over-week movement, and blog engine counts.
 *
 * Data notes:
 * - GSC data lags ~2-3 days, so "this week" ends 3 days ago. Each weekly
 *   bucket is a trailing 7-day window anchored to that end date.
 * - Both properties (sc-domain:goripple.io + sc-domain:getacuity.io) are
 *   merged by URL path until the Change of Address consolidates them.
 *
 * Cron: Sunday 12:00 UTC (~7am ET). Manual test:
 *   POST /api/admin/blog/weekly-seo-report (Bearer CRON_SECRET)
 */

import { inngest } from "@/inngest/client";

const PROPERTIES = ["sc-domain:goripple.io", "sc-domain:getacuity.io"];
const WEEKS = 12;

interface DayRow {
  date: string;
  impressions: number;
  clicks: number;
  position: number; // impression-weighted when merged
}

interface DimRow {
  key: string;
  impressions: number;
  clicks: number;
  position: number;
}

function fmtPos(p: number): string {
  return p > 0 ? p.toFixed(1) : "-";
}

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "-";
}

function delta(cur: number, prev: number): string {
  const d = cur - prev;
  if (prev === 0 && cur === 0) return "±0";
  const sign = d > 0 ? "+" : "";
  return `${sign}${Math.round(d)}`;
}

export const weeklySeoReportFn = inngest.createFunction(
  {
    id: "weekly-seo-report",
    name: "SEO — Weekly Metrics Report (Sunday email)",
    retries: 1,
    triggers: [
      { cron: "0 12 * * 0" },
      { event: "admin/weekly-seo-report.requested" },
    ],
  },
  async ({ logger, step }) => {
    // ── Step 1: pull GSC data (daily series, top queries, top pages) ──
    const data = await step.run("pull-gsc", async () => {
      const { google } = await import("googleapis");
      const { getGoogleAuthClient } = await import("@/lib/google/auth");
      const auth = getGoogleAuthClient([
        "https://www.googleapis.com/auth/webmasters.readonly",
      ]);
      if (!auth) throw new Error("No Google auth client (GA4_SERVICE_ACCOUNT_KEY)");
      const sc = google.searchconsole({ version: "v1", auth });

      const end = new Date(Date.now() - 3 * 864e5); // GSC lag buffer
      const endStr = end.toISOString().slice(0, 10);
      const startStr = new Date(end.getTime() - WEEKS * 7 * 864e5)
        .toISOString()
        .slice(0, 10);
      const thisWeekStart = new Date(end.getTime() - 6 * 864e5)
        .toISOString()
        .slice(0, 10);
      const prevWeekEnd = new Date(end.getTime() - 7 * 864e5)
        .toISOString()
        .slice(0, 10);
      const prevWeekStart = new Date(end.getTime() - 13 * 864e5)
        .toISOString()
        .slice(0, 10);

      const byDate = new Map<string, DayRow>();
      const mergeDim = (
        map: Map<string, DimRow>,
        key: string,
        row: { impressions?: number | null; clicks?: number | null; position?: number | null }
      ) => {
        const imp = row.impressions ?? 0;
        const prev = map.get(key) ?? { key, impressions: 0, clicks: 0, position: 0 };
        const totalImp = prev.impressions + imp;
        map.set(key, {
          key,
          impressions: totalImp,
          clicks: prev.clicks + (row.clicks ?? 0),
          position:
            totalImp > 0
              ? (prev.position * prev.impressions + (row.position ?? 0) * imp) / totalImp
              : 0,
        });
      };

      const queriesThis = new Map<string, DimRow>();
      const queriesPrev = new Map<string, DimRow>();
      const pagesThis = new Map<string, DimRow>();

      for (const prop of PROPERTIES) {
        try {
          // Daily series across the whole window
          const daily = await sc.searchanalytics.query({
            siteUrl: prop,
            requestBody: {
              startDate: startStr,
              endDate: endStr,
              dimensions: ["date"],
              rowLimit: 500,
            },
          });
          for (const row of daily.data.rows ?? []) {
            const date = row.keys?.[0];
            if (!date) continue;
            const imp = row.impressions ?? 0;
            const prev = byDate.get(date) ?? { date, impressions: 0, clicks: 0, position: 0 };
            const totalImp = prev.impressions + imp;
            byDate.set(date, {
              date,
              impressions: totalImp,
              clicks: prev.clicks + (row.clicks ?? 0),
              position:
                totalImp > 0
                  ? (prev.position * prev.impressions + (row.position ?? 0) * imp) / totalImp
                  : 0,
            });
          }

          // Top queries: this week + previous week
          for (const [target, range] of [
            [queriesThis, { startDate: thisWeekStart, endDate: endStr }],
            [queriesPrev, { startDate: prevWeekStart, endDate: prevWeekEnd }],
          ] as const) {
            const res = await sc.searchanalytics.query({
              siteUrl: prop,
              requestBody: { ...range, dimensions: ["query"], rowLimit: 100 },
            });
            for (const row of res.data.rows ?? []) {
              const q = row.keys?.[0];
              if (q) mergeDim(target, q, row);
            }
          }

          // Top pages: this week (merge by path so both domains combine)
          const pages = await sc.searchanalytics.query({
            siteUrl: prop,
            requestBody: {
              startDate: thisWeekStart,
              endDate: endStr,
              dimensions: ["page"],
              rowLimit: 100,
            },
          });
          for (const row of pages.data.rows ?? []) {
            const url = row.keys?.[0];
            if (!url) continue;
            const path = url.replace(/^https?:\/\/[^/]+/, "") || "/";
            mergeDim(pagesThis, path, row);
          }
        } catch (err) {
          logger.warn(
            `[weekly-seo-report] GSC pull failed for ${prop}: ${err instanceof Error ? err.message : err}`
          );
        }
      }

      // Bucket the daily series into trailing 7-day weeks ending at endStr
      const weeks: { label: string; impressions: number; clicks: number; position: number }[] = [];
      for (let w = WEEKS - 1; w >= 0; w--) {
        const wEnd = new Date(end.getTime() - w * 7 * 864e5);
        const wStart = new Date(wEnd.getTime() - 6 * 864e5);
        let imp = 0, clicks = 0, posWeighted = 0;
        for (let d = 0; d < 7; d++) {
          const day = new Date(wStart.getTime() + d * 864e5).toISOString().slice(0, 10);
          const row = byDate.get(day);
          if (!row) continue;
          imp += row.impressions;
          clicks += row.clicks;
          posWeighted += row.position * row.impressions;
        }
        weeks.push({
          label: `${wStart.toISOString().slice(5, 10)} – ${wEnd.toISOString().slice(5, 10)}`,
          impressions: imp,
          clicks,
          position: imp > 0 ? posWeighted / imp : 0,
        });
      }

      const topQueries = [...queriesThis.values()]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15)
        .map((q) => ({
          ...q,
          prevPosition: queriesPrev.get(q.key)?.position ?? 0,
          prevImpressions: queriesPrev.get(q.key)?.impressions ?? 0,
        }));

      const topPages = [...pagesThis.values()]
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 15);

      return { weeks, topQueries, topPages, windowEnd: endStr, thisWeekStart };
    });

    // ── Step 2: blog engine counts from the DB ──
    const engine = await step.run("blog-engine-stats", async () => {
      const { prisma } = await import("@/lib/prisma");
      const [live, pruned, queued] = await Promise.all([
        prisma.contentPiece.count({
          where: { type: "BLOG", status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED"] } },
        }),
        prisma.contentPiece.count({
          where: { type: "BLOG", status: { in: ["PRUNED_DAY7", "PRUNED_DAY30", "PRUNED_DAY90"] } },
        }),
        prisma.blogTopicQueue.count({ where: { status: "QUEUED" } }),
      ]);
      return { live, pruned, queued };
    });

    // ── Step 3: compose + send the email ──
    await step.run("send-email", async () => {
      const { getResendClient } = await import("@/lib/resend");
      const resend = getResendClient();

      const { weeks, topQueries, topPages, windowEnd, thisWeekStart } = data;
      const cur = weeks[weeks.length - 1];
      const prev = weeks[weeks.length - 2] ?? { impressions: 0, clicks: 0, position: 0 };

      const th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #ddd;font-size:13px"';
      const td = 'style="padding:5px 10px;border-bottom:1px solid #eee;font-size:13px"';
      const tdNum = 'style="padding:5px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:right"';

      const trendRows = weeks
        .map((w, i) => {
          const isCurrent = i === weeks.length - 1;
          const style = isCurrent ? tdNum.replace('"', '"font-weight:bold;') : tdNum;
          const labelStyle = isCurrent ? td.replace('"', '"font-weight:bold;') : td;
          return `<tr><td ${labelStyle}>${w.label}</td><td ${style}>${w.impressions}</td><td ${style}>${w.clicks}</td><td ${style}>${pct(w.clicks, w.impressions)}</td><td ${style}>${fmtPos(w.position)}</td></tr>`;
        })
        .join("");

      const queryRows = topQueries
        .map((q) => {
          const posMove =
            q.prevPosition > 0 && q.position > 0
              ? (q.prevPosition - q.position >= 0.05 ? ` (was ${q.prevPosition.toFixed(1)})` : q.position - q.prevPosition >= 0.05 ? ` (was ${q.prevPosition.toFixed(1)})` : "")
              : q.prevImpressions === 0
                ? " (new)"
                : "";
          return `<tr><td ${td}>${q.key}</td><td ${tdNum}>${q.impressions}</td><td ${tdNum}>${q.clicks}</td><td ${tdNum}>${fmtPos(q.position)}${posMove}</td></tr>`;
        })
        .join("");

      const pageRows = topPages
        .map(
          (p) =>
            `<tr><td ${td}>${p.key}</td><td ${tdNum}>${p.impressions}</td><td ${tdNum}>${p.clicks}</td><td ${tdNum}>${fmtPos(p.position)}</td></tr>`
        )
        .join("");

      const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:680px;margin:0 auto;color:#222">
  <h2 style="margin-bottom:4px">Ripple SEO weekly</h2>
  <p style="margin-top:0;color:#666;font-size:13px">Week ${thisWeekStart} to ${windowEnd} (GSC data lags ~3 days). goripple.io + getacuity.io combined.</p>

  <table cellspacing="0" style="width:100%;margin:12px 0 4px">
    <tr>
      <td style="padding:10px;background:#f5f4fb;border-radius:8px;text-align:center">
        <div style="font-size:22px;font-weight:bold">${cur.impressions}</div>
        <div style="font-size:12px;color:#666">impressions (${delta(cur.impressions, prev.impressions)} WoW)</div>
      </td>
      <td style="width:8px"></td>
      <td style="padding:10px;background:#f5f4fb;border-radius:8px;text-align:center">
        <div style="font-size:22px;font-weight:bold">${cur.clicks}</div>
        <div style="font-size:12px;color:#666">clicks (${delta(cur.clicks, prev.clicks)} WoW)</div>
      </td>
      <td style="width:8px"></td>
      <td style="padding:10px;background:#f5f4fb;border-radius:8px;text-align:center">
        <div style="font-size:22px;font-weight:bold">${fmtPos(cur.position)}</div>
        <div style="font-size:12px;color:#666">avg position (was ${fmtPos(prev.position)})</div>
      </td>
    </tr>
  </table>

  <h3 style="margin-bottom:6px">12-week trend</h3>
  <table cellspacing="0" style="width:100%">
    <thead><tr><th ${th}>Week</th><th ${th.replace("left", "right")}>Impr</th><th ${th.replace("left", "right")}>Clicks</th><th ${th.replace("left", "right")}>CTR</th><th ${th.replace("left", "right")}>Pos</th></tr></thead>
    <tbody>${trendRows}</tbody>
  </table>

  <h3 style="margin-bottom:6px;margin-top:24px">Top queries this week</h3>
  <table cellspacing="0" style="width:100%">
    <thead><tr><th ${th}>Query</th><th ${th.replace("left", "right")}>Impr</th><th ${th.replace("left", "right")}>Clicks</th><th ${th.replace("left", "right")}>Pos</th></tr></thead>
    <tbody>${queryRows || `<tr><td ${td} colspan="4">No query data this week</td></tr>`}</tbody>
  </table>

  <h3 style="margin-bottom:6px;margin-top:24px">Top pages this week</h3>
  <table cellspacing="0" style="width:100%">
    <thead><tr><th ${th}>Page</th><th ${th.replace("left", "right")}>Impr</th><th ${th.replace("left", "right")}>Clicks</th><th ${th.replace("left", "right")}>Pos</th></tr></thead>
    <tbody>${pageRows || `<tr><td ${td} colspan="4">No page data this week</td></tr>`}</tbody>
  </table>

  <h3 style="margin-bottom:6px;margin-top:24px">Blog engine</h3>
  <p style="font-size:13px;margin-top:0">${engine.live} posts live · ${engine.pruned} pruned/redirected · ${engine.queued} topics queued</p>

  <p style="color:#999;font-size:11px;margin-top:24px">Automated Sunday report from the Ripple auto-blog system.</p>
</div>`;

      await resend.emails.send({
        from:
          process.env.CONTENT_FACTORY_EMAIL_FROM ??
          '"Ripple Content" <content@getacuity.io>',
        to: process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com",
        subject: `Ripple SEO weekly — ${cur.impressions} impressions, ${cur.clicks} clicks (thru ${windowEnd})`,
        html,
      });
      return { sent: true };
    });

    logger.info("[weekly-seo-report] sent");
    return { ok: true };
  }
);
