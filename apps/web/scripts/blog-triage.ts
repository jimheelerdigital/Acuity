/**
 * Phase 1 content triage: cross-reference every published blog post with
 * 90-day GSC performance (both properties — getacuity.io history counts
 * via the Change of Address) and classify keep / rewrite / prune / hold.
 *
 * READ-ONLY: writes a markdown report to .tmp/, touches nothing in the DB.
 *
 * Run: npx dotenv -e apps/web/.env.local -- tsx apps/web/scripts/blog-triage.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { google } from "googleapis";
import { getGoogleAuthClient } from "../src/lib/google/auth";
import { prisma } from "../src/lib/prisma";

const auth = getGoogleAuthClient([
  "https://www.googleapis.com/auth/webmasters.readonly",
]);
if (!auth) throw new Error("No auth client");
const sc = google.searchconsole({ version: "v1", auth });

const end = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const start = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);

interface PageStats {
  impressions: number;
  clicks: number;
  position: number; // impression-weighted
  topQueries: { query: string; impressions: number; clicks: number; position: number }[];
}

async function pull(prop: string, dimensions: string[], rowLimit: number) {
  const res = await sc.searchanalytics.query({
    siteUrl: prop,
    requestBody: { startDate: start, endDate: end, dimensions, rowLimit },
  });
  return res.data.rows ?? [];
}

async function main() {
  // --- GSC: page-level + page/query-level, both properties, merged by path
  const byPath = new Map<string, PageStats>();
  for (const prop of ["sc-domain:goripple.io", "sc-domain:getacuity.io"]) {
    for (const row of await pull(prop, ["page"], 1000)) {
      const path = ((row.keys ?? [])[0] ?? "").replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
      const cur = byPath.get(path) ?? { impressions: 0, clicks: 0, position: 0, topQueries: [] };
      const imp = row.impressions ?? 0;
      // impression-weighted position merge
      cur.position =
        cur.impressions + imp > 0
          ? (cur.position * cur.impressions + (row.position ?? 0) * imp) / (cur.impressions + imp)
          : 0;
      cur.impressions += imp;
      cur.clicks += row.clicks ?? 0;
      byPath.set(path, cur);
    }
    for (const row of await pull(prop, ["page", "query"], 5000)) {
      const [pageUrl, query] = row.keys ?? [];
      if (!pageUrl || !query) continue;
      const path = pageUrl.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/";
      const cur = byPath.get(path);
      if (!cur) continue;
      cur.topQueries.push({
        query,
        impressions: row.impressions ?? 0,
        clicks: row.clicks ?? 0,
        position: row.position ?? 0,
      });
    }
  }
  for (const s of byPath.values()) {
    s.topQueries.sort((a, b) => b.impressions - a.impressions);
    s.topQueries = s.topQueries.slice(0, 5);
  }

  // --- DB: live blog posts
  const posts = await prisma.contentPiece.findMany({
    where: {
      type: "BLOG",
      slug: { not: null },
      status: { in: ["DISTRIBUTED", "AUTO_PUBLISHED", "EDITED", "APPROVED"] },
    },
    select: {
      slug: true,
      title: true,
      status: true,
      targetKeyword: true,
      publishedAt: true,
      distributedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  type Row = {
    slug: string;
    title: string;
    status: string;
    ageDays: number;
    imp: number;
    clicks: number;
    pos: number;
    acuityBranded: boolean;
    verdict: "KEEP" | "REWRITE" | "PRUNE" | "HOLD";
    reason: string;
    topQueries: PageStats["topQueries"];
  };

  const rows: Row[] = posts.map((p) => {
    const stats = byPath.get(`/blog/${p.slug}`) ?? {
      impressions: 0,
      clicks: 0,
      position: 0,
      topQueries: [],
    };
    const published = p.publishedAt ?? p.distributedAt ?? p.createdAt;
    const ageDays = Math.floor((Date.now() - published.getTime()) / 864e5);
    const acuityBranded = /acuity/i.test(p.title);

    let verdict: Row["verdict"];
    let reason: string;
    if (ageDays < 30) {
      verdict = "HOLD";
      reason = `only ${ageDays}d old — too new to judge`;
    } else if (stats.clicks > 0) {
      verdict = "KEEP";
      reason = `${stats.clicks} clicks — real traffic`;
    } else if (stats.impressions >= 50) {
      verdict = stats.position <= 30 ? "KEEP" : "REWRITE";
      reason = `${stats.impressions} imp @ pos ${stats.position.toFixed(0)} — ${
        stats.position <= 30 ? "close to page 1-3, optimize title/meta" : "demand exists but buried; rewrite to target"
      }`;
    } else if (stats.impressions >= 5) {
      verdict = "REWRITE";
      reason = `${stats.impressions} imp, 0 clicks — weak signal, retarget query`;
    } else {
      verdict = "PRUNE";
      reason = `${stats.impressions} imp in 90d at age ${ageDays}d — zero demand`;
    }
    if (acuityBranded && verdict !== "PRUNE") {
      verdict = "REWRITE";
      reason += " + dead-brand 'Acuity' title needs Ripple rebrand";
    }

    return {
      slug: p.slug!,
      title: p.title,
      status: p.status,
      ageDays,
      imp: stats.impressions,
      clicks: stats.clicks,
      pos: stats.position,
      acuityBranded,
      verdict,
      reason,
      topQueries: stats.topQueries,
    };
  });

  const counts = { KEEP: 0, REWRITE: 0, PRUNE: 0, HOLD: 0 };
  for (const r of rows) counts[r.verdict]++;

  // --- Report
  const lines: string[] = [];
  lines.push(`# Blog content triage — ${new Date().toISOString().slice(0, 10)}`);
  lines.push(``);
  lines.push(`GSC window: ${start} → ${end} (both properties merged by path)`);
  lines.push(`Posts evaluated: ${rows.length}`);
  lines.push(``);
  lines.push(`| Verdict | Count |`);
  lines.push(`|---|---|`);
  for (const [v, c] of Object.entries(counts)) lines.push(`| ${v} | ${c} |`);
  lines.push(``);

  for (const verdict of ["KEEP", "REWRITE", "HOLD", "PRUNE"] as const) {
    const group = rows
      .filter((r) => r.verdict === verdict)
      .sort((a, b) => b.imp - a.imp);
    lines.push(`## ${verdict} (${group.length})`);
    lines.push(``);
    for (const r of group) {
      lines.push(`### /blog/${r.slug}`);
      lines.push(`- **${r.title}**${r.acuityBranded ? " ⚠️ ACUITY-BRANDED" : ""}`);
      lines.push(
        `- ${r.imp} imp / ${r.clicks} clicks / pos ${r.pos ? r.pos.toFixed(1) : "—"} · age ${r.ageDays}d · ${r.status}`
      );
      lines.push(`- ${r.reason}`);
      if (r.topQueries.length) {
        lines.push(
          `- queries: ${r.topQueries
            .map((q) => `"${q.query}" (${q.impressions} imp, pos ${q.position.toFixed(0)})`)
            .join("; ")}`
        );
      }
      lines.push(``);
    }
  }

  mkdirSync(".tmp", { recursive: true });
  const out = ".tmp/blog-triage-report.md";
  writeFileSync(out, lines.join("\n"));
  console.log(`Wrote ${out}`);
  console.log(`Totals: ${JSON.stringify(counts)} of ${rows.length} posts`);
  const orphans = [...byPath.keys()].filter(
    (p) => p.startsWith("/blog/") && !posts.some((x) => `/blog/${x.slug}` === p)
  );
  console.log(`GSC blog paths with no matching live post: ${orphans.length}`);
  for (const o of orphans) console.log(`  orphan: ${o}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
