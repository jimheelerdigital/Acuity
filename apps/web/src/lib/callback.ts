/**
 * "From a month ago" (Insights, 2026-10-27).
 *
 * Surfaces ONE past entry from about a month ago that connects to what the
 * user has been talking about lately, shown as a short safe snippet (one of
 * the entry's wins, or its summary — never raw transcript) plus today's
 * context: "A month ago: '…'. Last week, work came up again — and your
 * mood's been higher."
 *
 * Matching: normalised theme overlap (ThemeMention themeIds) between the
 * candidate entry and the user's recent entries. Deterministic, no AI, no
 * embeddings (theme overlap is already normalised per user and is cheap).
 *
 * Stability: every window is anchored to the start of the current ISO week
 * (Monday 00:00 UTC), so the callback stays the same all week and changes
 * at most once a week. Ties rotate by ISO week.
 *
 * Safety: an entry is never resurfaced if its mood was very low
 * (moodScore ≤ 3), or if its summary, chosen snippet, shared theme name or
 * transcript matches CRISIS_PATTERN.
 */
import { CRISIS_PATTERN } from "@/lib/open-loops";

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Past window: 26–35 days before the start of this week. */
export const PAST_MIN_DAYS = 26;
export const PAST_MAX_DAYS = 35;
/** Recent window: the 7 days before the start of this week. */
export const RECENT_DAYS = 7;
export const LOW_MOOD_MAX = 3;
const SNIPPET_MAX = 160;
const MOOD_DIFF_MIN = 1;

export type CallbackEntry = {
  id: string;
  createdAt: Date;
  summary: string | null;
  wins: string[];
  moodScore: number | null;
  transcript: string | null;
  /** themeId → theme name for this entry's mentions. */
  themes: Array<{ themeId: string; name: string }>;
};

export type Callback = {
  entryId: string;
  /** ISO date of the past entry. */
  pastDate: string;
  daysAgo: number;
  snippet: string;
  /** The theme that links then and now. */
  theme: string;
  /** e.g. "This week, work came up again — and your mood's been higher." */
  now: string;
};

/** Monday 00:00 UTC of the ISO week containing `d`. */
export function isoWeekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Mon=0
  return new Date(x.getTime() - dow * DAY_MS);
}

/** ISO week number (1–53). */
export function isoWeekNumber(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow + 3); // Thursday of this week
  const firstThu = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const firstDow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDow + 3);
  return 1 + Math.round((x.getTime() - firstThu.getTime()) / (7 * DAY_MS));
}

/** Window bounds anchored to this week's start. */
export function callbackWindows(now: Date) {
  const weekStart = isoWeekStart(now);
  return {
    weekStart,
    pastFrom: new Date(weekStart.getTime() - PAST_MAX_DAYS * DAY_MS),
    pastTo: new Date(weekStart.getTime() - PAST_MIN_DAYS * DAY_MS),
    recentFrom: new Date(weekStart.getTime() - RECENT_DAYS * DAY_MS),
    recentTo: weekStart,
  };
}

function isSensitive(text: string | null | undefined): boolean {
  return !!text && CRISIS_PATTERN.test(text);
}

function clip(s: string, max = SNIPPET_MAX): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

function firstSentence(s: string): string {
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : s).trim();
}

/** A win if there is a usable one, else the summary's first sentence. */
export function pickSnippet(e: Pick<CallbackEntry, "wins" | "summary">): string | null {
  const win = e.wins.map((w) => w?.trim()).find((w) => w && w.length >= 8 && !isSensitive(w));
  if (win) return clip(win);
  if (e.summary && e.summary.trim().length >= 8) {
    const s = firstSentence(e.summary);
    if (!isSensitive(s)) return clip(s);
  }
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Small deterministic hash for week rotation of ties. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function computeCallback(
  past: CallbackEntry[],
  recent: CallbackEntry[],
  now: Date,
  userId = ""
): Callback | null {
  if (past.length === 0 || recent.length === 0) return null;
  // Recent theme frequency (how many recent entries mention each theme).
  const recentFreq = new Map<string, { name: string; n: number }>();
  for (const e of recent) {
    for (const t of new Map(e.themes.map((x) => [x.themeId, x])).values()) {
      if (isSensitive(t.name)) continue;
      const cur = recentFreq.get(t.themeId);
      recentFreq.set(t.themeId, { name: t.name, n: (cur?.n ?? 0) + 1 });
    }
  }
  if (recentFreq.size === 0) return null;

  type Scored = { e: CallbackEntry; snippet: string; theme: string; score: number };
  const scored: Scored[] = [];
  for (const e of past) {
    if (e.moodScore !== null && e.moodScore <= LOW_MOOD_MAX) continue;
    if (isSensitive(e.summary) || isSensitive(e.transcript)) continue;
    if (e.themes.some((t) => isSensitive(t.name))) continue;
    const shared = e.themes
      .map((t) => recentFreq.get(t.themeId))
      .filter((x): x is { name: string; n: number } => !!x)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    if (shared.length === 0) continue;
    const snippet = pickSnippet(e);
    if (!snippet) continue;
    const score = shared.reduce((s, x) => s + x.n, 0);
    scored.push({ e, snippet, theme: shared[0].name, score });
  }
  if (scored.length === 0) return null;

  const top = Math.max(...scored.map((s) => s.score));
  const best = scored
    .filter((s) => s.score === top)
    .sort((a, b) => a.e.createdAt.getTime() - b.e.createdAt.getTime() || a.e.id.localeCompare(b.e.id));
  const pick = best[hash(`${userId}:${isoWeekNumber(now)}`) % best.length];

  // Mood clause: only when it's been noticeably higher (kept positive on
  // purpose; a "lower" note isn't helpful on a nostalgia card).
  const recentMood = avg(recent.map((e) => e.moodScore).filter((m): m is number => m !== null));
  const pastMood = pick.e.moodScore;
  const higher =
    recentMood !== null && pastMood !== null && recentMood - pastMood >= MOOD_DIFF_MIN;

  const theme = pick.theme.toLowerCase();
  const nowText = `Last week, ${theme} came up again${higher ? " — and your mood's been higher" : ""}.`;
  const daysAgo = Math.round((now.getTime() - pick.e.createdAt.getTime()) / DAY_MS);

  return {
    entryId: pick.e.id,
    pastDate: pick.e.createdAt.toISOString().slice(0, 10),
    daysAgo,
    snippet: pick.snippet,
    theme: cap(pick.theme),
    now: nowText,
  };
}
