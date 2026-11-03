/**
 * Weekly App Store search-rank report (2026-11-03, per Keenan: "send me a
 * weekly email with our current rank for those searches and the improvement
 * week over week").
 *
 * Rank = Ripple's position in Apple's public iTunes Search API results for
 * each term (US store, top 200). It tracks the App Store's own search order
 * closely but isn't identical to what one iPhone shows (personalization,
 * Search Ads slots). Snapshots are stored as JSON in the content-factory
 * bucket (aso/ranks/<date>.json), so the week-over-week compare needs no
 * schema change.
 */
export const RIPPLE_APP_ID = 6762633410;
const LIMIT = 200;
const PREFIX = "aso/ranks";

/** The searches we want to be found for (Keenan's key list, 11-03). */
export const RANK_TERMS = [
  "voice journal",
  "ai voice journal",
  "ai journal",
  "audio journal",
  "voice diary",
  "journal app",
  "journaling",
  "diary",
  "brain dump",
  "mental load",
  "mental load planner",
  "adhd planner",
  "to do list",
  "to do list adhd",
  "habit tracker",
  "mood tracker",
  "goal tracker",
  "daily planner",
  "life organizer",
  "self care journal",
  "journal for mental health",
  "mom planner",
  "ripple",
  "ripple journal",
];

export type RankSnapshot = { date: string; ranks: Record<string, number | null> };

async function rankFor(term: string): Promise<number | null> {
  const url = `https://itunes.apple.com/search?entity=software&country=us&limit=${LIMIT}&term=${encodeURIComponent(term)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const { results } = (await res.json()) as { results: { trackId: number }[] };
      const i = results.findIndex((r) => r.trackId === RIPPLE_APP_ID);
      return i === -1 ? null : i + 1;
    }
    // The API rate-limits bursts (403/429); back off and retry.
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  throw new Error(`iTunes search failed for "${term}"`);
}

export async function currentRanks(): Promise<RankSnapshot> {
  const ranks: Record<string, number | null> = {};
  for (const term of RANK_TERMS) {
    ranks[term] = await rankFor(term);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { date: new Date().toISOString().slice(0, 10), ranks };
}

export async function saveSnapshot(s: RankSnapshot): Promise<void> {
  const { supabase } = await import("@/lib/supabase.server");
  const { error } = await supabase.storage
    .from("content-factory")
    .upload(`${PREFIX}/${s.date}.json`, JSON.stringify(s), { contentType: "application/json", upsert: true });
  if (error) throw new Error(`rank snapshot upload failed: ${error.message}`);
}

/** The newest snapshot taken at least 5 days before `date` (last week's). */
export async function previousSnapshot(date: string): Promise<RankSnapshot | null> {
  const { supabase } = await import("@/lib/supabase.server");
  const { data } = await supabase.storage.from("content-factory").list(PREFIX, { limit: 500 });
  const cutoff = new Date(`${date}T00:00:00Z`).getTime() - 5 * 86400000;
  const prev = (data ?? [])
    .map((f) => f.name.replace(/\.json$/, ""))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).getTime() <= cutoff)
    .sort()
    .pop();
  if (!prev) return null;
  const { data: file } = await supabase.storage.from("content-factory").download(`${PREFIX}/${prev}.json`);
  return file ? (JSON.parse(await file.text()) as RankSnapshot) : null;
}

const fmt = (r: number | null) => (r === null ? `not in top ${LIMIT}` : `#${r}`);

function change(now: number | null, before: number | null | undefined): { text: string; color: string } {
  if (before === undefined) return { text: "first week", color: "#6F6458" };
  if (now === before) return { text: "no change", color: "#6F6458" };
  if (before === null && now !== null) return { text: "new: now ranking", color: "#15803D" };
  if (now === null) return { text: "dropped out", color: "#B91C1C" };
  const d = before! - now;
  return d > 0 ? { text: `up ${d}`, color: "#15803D" } : { text: `down ${-d}`, color: "#B91C1C" };
}

export function rankReportHtml(now: RankSnapshot, prev: RankSnapshot | null, sheetUrl?: string): { subject: string; html: string } {
  const rows = RANK_TERMS.map((t) => {
    const c = change(now.ranks[t], prev ? prev.ranks[t] : undefined);
    return `<tr><td style="padding:7px 10px;border-bottom:1px solid #F1E6DD">${t}</td><td style="padding:7px 10px;border-bottom:1px solid #F1E6DD;text-align:right;font-weight:600">${fmt(now.ranks[t])}</td><td style="padding:7px 10px;border-bottom:1px solid #F1E6DD;text-align:right;color:#6F6458">${prev ? fmt(prev.ranks[t] ?? null) : "-"}</td><td style="padding:7px 10px;border-bottom:1px solid #F1E6DD;text-align:right;color:${c.color};font-weight:600">${c.text}</td></tr>`;
  }).join("");
  const ranked = RANK_TERMS.filter((t) => now.ranks[t] !== null).length;
  const top10 = RANK_TERMS.filter((t) => (now.ranks[t] ?? 999) <= 10).length;
  const ups = prev ? RANK_TERMS.filter((t) => change(now.ranks[t], prev.ranks[t]).text.startsWith("up") || change(now.ranks[t], prev.ranks[t]).text.startsWith("new")).length : 0;
  const downs = prev ? RANK_TERMS.filter((t) => ["down", "dropped"].some((w) => change(now.ranks[t], prev.ranks[t]).text.startsWith(w))).length : 0;
  const summary = prev
    ? `Ranking for ${ranked} of ${RANK_TERMS.length} searches (${top10} in the top 10). Since ${prev.date}: ${ups} up, ${downs} down.`
    : `Ranking for ${ranked} of ${RANK_TERMS.length} searches (${top10} in the top 10). This is the baseline; next week shows the change.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#2A231D;font-size:14px;line-height:1.5">
<h2 style="margin:0 0 6px;font-size:20px">App Store search rank, week of ${now.date}</h2>
${sheetUrl ? `<p style="margin:0 0 14px"><a href="${sheetUrl}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#F2541E;color:#fff;font-weight:700;text-decoration:none">Open this week's rankings</a></p>` : ""}
<p style="margin:0 0 14px">${summary}</p>
<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#FFF2EA"><th style="padding:7px 10px;text-align:left">Search</th><th style="padding:7px 10px;text-align:right">This week</th><th style="padding:7px 10px;text-align:right">Last week</th><th style="padding:7px 10px;text-align:right">Change</th></tr>${rows}</table>
<p style="margin:14px 0 0;color:#6F6458;font-size:12px">Rank is Ripple's position in Apple's US App Store search results (top ${LIMIT}), read from Apple's public search API. A single iPhone can show a slightly different order (personalization, ads). Lower is better.</p></div>`;
  return { subject: `New App Store rankings (${now.date}): ${ranked}/${RANK_TERMS.length} searches${prev ? `, ${ups} up, ${downs} down` : ""}`, html };
}
