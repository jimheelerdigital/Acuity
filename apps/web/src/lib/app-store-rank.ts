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

/**
 * Every search we should show up for (11-03: Keenan wanted far more than the
 * first 24). Generic phrases only, taken from Apple's own search suggestions
 * for each thing Ripple does; other apps' names left out.
 */
export const RANK_GROUPS: Record<string, string[]> = {
  "Voice journal": ["voice journal", "voice journal free", "voice journal app", "voice journaling", "ai voice journal", "audio journal", "audio journal app", "audio diary", "voice diary", "voice diary ai", "voice to text journal", "talk journaling app", "voice notes", "voice notes ai"],
  "Journal & diary": ["journal", "journal app", "journal apps", "journaling", "journaling app", "free journaling app", "daily journal", "daily journal app", "journal diary", "diary", "diary app", "ai journal", "free ai journal", "ai diary", "journal for thoughts and feelings", "journaling for mental health", "journaling app for mental health", "mental health journal", "self care journal", "reflection journal", "gratitude journal"],
  "Brain dump & mental load": ["brain dump", "brain dumping", "brain dump to do list", "mental load", "mental load app", "mental load for moms", "second brain", "second brain app"],
  "To-do list & tasks": ["to do list", "to do list free", "to do list app", "to do list adhd", "to do list reminder", "task list", "daily task list", "task manager", "ai task manager", "adhd task manager", "family task manager", "checklist", "reminders", "reminders to do list", "reminder app"],
  "Planner & organizer": ["planner", "daily planner", "daily planner and to do list", "weekly planner", "life planner", "ai life planner", "life organizer", "organizer planner", "family planner", "family organizer", "mom planner", "productivity planner", "routine planner"],
  "ADHD": ["adhd", "adhd planner", "adhd planner free", "adhd planner ai", "adhd to do list", "adhd app", "adhd app for women"],
  "Habits & goals": ["habit tracker", "habit tracker free", "habit tracker and planner", "habits tracker", "goal tracker", "goals tracker", "daily goal tracker", "routine tracker", "self care tracker", "self improvement", "self care"],
  "Mood & patterns": ["mood tracker", "mood tracker journal", "mood tracker mental health", "mood tracker for self care", "mood journal", "mood diary", "emotion tracker", "stress tracker", "mental health tracker"],
  "AI coach & assistant": ["ai life coach", "life coach", "ai coach", "ai personal assistant", "personal assistant for daily tasks", "weekly review"],
  "Brand": ["ripple", "ripple app", "ripple journal", "ripple voice journal"],
};
export const RANK_TERMS = Object.values(RANK_GROUPS).flat();
export const GROUP_OF: Record<string, string> = Object.fromEntries(Object.entries(RANK_GROUPS).flatMap(([g, ts]) => ts.map((t) => [t, g])));

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

/** Ranks for a slice of terms (the Inngest job runs the list in chunks to stay under function time limits). */
export async function ranksFor(terms: string[]): Promise<Record<string, number | null>> {
  const ranks: Record<string, number | null> = {};
  for (const term of terms) {
    ranks[term] = await rankFor(term);
    await new Promise((r) => setTimeout(r, 2500));
  }
  return ranks;
}

export async function currentRanks(): Promise<RankSnapshot> {
  return { date: new Date().toISOString().slice(0, 10), ranks: await ranksFor(RANK_TERMS) };
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
  const td = "padding:6px 10px;border-bottom:1px solid #F1E6DD";
  const ranked = RANK_TERMS.filter((t) => now.ranks[t] !== null);
  const top10 = ranked.filter((t) => (now.ranks[t] as number) <= 10).length;
  const moves = prev ? RANK_TERMS.map((t) => ({ t, c: change(now.ranks[t], prev.ranks[t]) })) : [];
  const ups = moves.filter((m) => m.c.text.startsWith("up") || m.c.text.startsWith("new"));
  const downs = moves.filter((m) => m.c.text.startsWith("down") || m.c.text.startsWith("dropped"));
  const summary = prev
    ? `Ripple shows up for ${ranked.length} of ${RANK_TERMS.length} searches (${top10} in the top 10). Since ${prev.date}: ${ups.length} up, ${downs.length} down.`
    : `Ripple shows up for ${ranked.length} of ${RANK_TERMS.length} searches (${top10} in the top 10). This is the baseline; next week shows the change.`;
  const moveTable = (title: string, list: { t: string; c: { text: string; color: string } }[]) =>
    list.length
      ? `<h3 style="margin:18px 0 6px;font-size:15px">${title}</h3><table style="border-collapse:collapse;width:100%;font-size:14px">${list.map((m) => `<tr><td style="${td}">${m.t}</td><td style="${td};text-align:right">${fmt(now.ranks[m.t])}</td><td style="${td};text-align:right;color:${m.c.color};font-weight:600">${m.c.text}</td></tr>`).join("")}</table>`
      : "";
  const where = `<h3 style="margin:18px 0 6px;font-size:15px">Where Ripple ranks now</h3><table style="border-collapse:collapse;width:100%;font-size:14px">${ranked
    .sort((a, b) => (now.ranks[a] as number) - (now.ranks[b] as number))
    .map((t) => `<tr><td style="${td}">${t}</td><td style="${td};text-align:right;font-weight:600">${fmt(now.ranks[t])}</td></tr>`).join("")}</table>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;color:#2A231D;font-size:14px;line-height:1.5">
<h2 style="margin:0 0 10px;font-size:20px">App Store search rank, week of ${now.date}</h2>
${sheetUrl ? `<p style="margin:0 0 14px"><a href="${sheetUrl}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#F2541E;color:#fff;font-weight:700;text-decoration:none">Open this week's rankings</a></p>` : ""}
<p style="margin:0 0 6px">${summary}</p>
${moveTable("Moved up", ups)}${moveTable("Moved down", downs)}${where}
<p style="margin:14px 0 0;color:#6F6458;font-size:12px">Rank is Ripple's position in Apple's US App Store search results (top ${LIMIT}), read from Apple's public search API. A single iPhone can show a slightly different order (personalization, ads). Lower is better. Every search is in the sheet.</p></div>`;
  return { subject: `New App Store rankings (${now.date}): ${ranked.length}/${RANK_TERMS.length} searches${prev ? `, ${ups.length} up, ${downs.length} down` : ""}`, html };
}
