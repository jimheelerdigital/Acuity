/**
 * Content Factory — Reddit audience pulse (2026-09-17, per Keenan:
 * "fully automated. we read reddit posts and generate content based on
 * posts. this influences our daily lanes, and we'll have another lane
 * per category that freelances posts based on reddit").
 *
 * DAILY, 7-DAY ROLLING BLEND (his pick): a 4 UTC cron scrapes the top +
 * rising posts of each brand's subreddit list, Claude distills them —
 * together with the trailing 7 days of stored digests — into ~10 ranked
 * themes per brand, saved as one RedditTrendDigest row per (day, brand).
 *
 * ACCESS: Reddit's JSON endpoints 403 anonymous callers (verified
 * 2026-09-17), but the Atom RSS feeds (/top/.rss) still serve without
 * auth. We use RSS and parse titles with regex — no new deps. If Reddit
 * ever blocks Vercel's IPs, add REDDIT_CLIENT_ID/SECRET and extend
 * fetchSubredditTitles with the OAuth flow; every failure here is SOFT
 * (a lane without a pulse block just generates like it did yesterday).
 *
 * THEMES ONLY — the distiller extracts what the audience is upvoting
 * (pains, questions, phrasings). We never copy anyone's post and the
 * output must never mention Reddit.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import { copyObjectives } from "./copy-objectives";

const anthropic = contentAnthropic;
const CLAUDE_MODEL = CONTENT_MODEL;
// Same Sonnet pricing constants as moody-carousel.ts.
const INPUT_COST_PER_TOKEN = CONTENT_INPUT_COST_PER_TOKEN;
const OUTPUT_COST_PER_TOKEN = CONTENT_OUTPUT_COST_PER_TOKEN;

/** Subreddits per brand (Keenan-approved lists, 2026-09-17). */
export const BRAND_SUBREDDITS: Record<"ripple" | "bwk", string[]> = {
  ripple: [
    "AskWomenOver40",
    "Menopause",
    "working_moms",
    "Mommit",
    "simpleliving",
    "DecidingToBeBetter",
  ],
  bwk: [
    "getdisciplined",
    "selfimprovement",
    "Stoicism",
    "DecidingToBeBetter",
    "productivity",
  ],
};

const AUDIENCE_BRIEF: Record<"ripple" | "bwk", string> = {
  ripple:
    "Women roughly 40-50 carrying a heavy mental load — family, work, aging parents, identity, time slipping. Quiet, reflective, personal register.",
  bwk: "Young men focused on discipline, self-improvement, training, money, and building a life they respect. Stark, motivational, command register.",
};

export interface RedditTheme {
  /** Short name of the trending theme ("the 4pm energy crash", "quitting alcohol quietly"). */
  theme: string;
  /** Why it's resonating with this audience right now. */
  why: string;
  /** How a post could angle into it in our voice. */
  angle: string;
  /** Words/phrasings the audience itself uses (never verbatim post copy). */
  phrases: string[];
}

export interface SubredditScrape {
  subreddit: string;
  titles: string[];
}

const UA =
  process.env.REDDIT_USER_AGENT ??
  "acuity-content-factory/1.0 (audience research)";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Fetch post titles for one subreddit's daily-top listing via the Atom
 * RSS feed. Anonymous RSS is rate-limited to roughly 10 req/min per IP
 * (verified 2026-09-17: 22 back-to-back requests → 429s), so callers
 * MUST space requests; on a 429 we wait 30s and retry once. Returns []
 * on any failure — the pulse is always optional.
 */
async function fetchListingTitles(
  subreddit: string,
  limit: number
): Promise<string[]> {
  const url = `https://www.reddit.com/r/${subreddit}/top/.rss?t=day&limit=${limit}`;
  try {
    let res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 30_000));
      res = await fetch(url, { headers: { "User-Agent": UA } });
    }
    if (!res.ok) {
      console.warn(`[reddit-trends] ${subreddit}/top → ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const titles: string[] = [];
    // Atom: each post is an <entry> whose <title> is the post title.
    const entries = xml.split("<entry>").slice(1);
    for (const entry of entries.slice(0, limit)) {
      const m = entry.match(/<title>([\s\S]*?)<\/title>/);
      if (!m) continue;
      const title = decodeEntities(m[1]).trim();
      if (title.length >= 15) titles.push(title); // skip "[removed]" stubs etc.
    }
    return titles;
  } catch (e) {
    console.warn(`[reddit-trends] ${subreddit}/top fetch failed:`, e);
    return [];
  }
}

/** Scrape today's daily-top titles for every subreddit of a brand. */
export async function scrapeBrandSubreddits(
  brand: "ripple" | "bwk"
): Promise<SubredditScrape[]> {
  const out: SubredditScrape[] = [];
  for (const sub of BRAND_SUBREDDITS[brand]) {
    const titles = await fetchListingTitles(sub, 25);
    if (titles.length > 0) out.push({ subreddit: sub, titles });
    // ~10 req/min anonymous limit — 8s spacing keeps us safely under it.
    await new Promise((r) => setTimeout(r, 8000));
  }
  return out;
}

/**
 * 2026-09-28 (Sonnet 5.5 rewrite): opens with the brand's copyObjectives
 * so the researcher knows what the themes are FOR (posts readers see
 * themselves in and comment on), then asks for themes as specific
 * situations in the audience's own words rather than abstract topics.
 */
function distillSystem(brand: "ripple" | "bwk"): string {
  return `${copyObjectives(brand)}

YOUR JOB TODAY: audience research for the account above. You get the titles of the posts this audience is upvoting today in the online communities where they talk to each other, plus the themes that trended over the past week. Turn them into ranked themes our writers can build posts from.

A useful theme is one a reader would recognize herself or himself in on sight. That means:
- A specific situation, not a category. "the appointment she booked for everyone but herself" is useful; "self-care" is not. "skipping the gym the week after a good streak" is useful; "motivation" is not.
- Grounded in what the titles actually show: real recurring pains, questions, small wins and fears. Don't invent a trend the titles don't support.
- Ranked by strength. A theme that is hot today and also recurred through the week outranks a one-day spike, but include one or two strong spikes from today.

For each theme:
- "theme": a short name for the specific situation, a few words.
- "why": one sentence on why it is hitting this audience right now (what they are feeling underneath it).
- "angle": one sentence on how a post in this account's voice could use it so the reader feels recognized and has something to answer, save or send. Respect the voice: for Ripple that is a mirror that names the feeling (never advice or fixing); for Build With Key it can be a standard or a command.
- "phrases": 2-4 short fragments in the audience's own vocabulary, the exact everyday words they use for this feeling (a few words each). These are the words that make a reader think "that's me". Never lift a whole title or sentence.

The themes feed public posts, so nothing in any field may mention Reddit, subreddits, communities, threads or "posts". Write about the people and the feeling, not the source.

Return 8-10 themes, strongest first, as {"themes":[{"theme":"...","why":"...","angle":"...","phrases":["..."]}]}. Return only the JSON object.`;
}

/**
 * Scrape + distill + store today's digest for a brand.
 * Returns the theme count (0 = nothing scraped, no row written).
 */
export async function buildDailyDigest(
  brand: "ripple" | "bwk"
): Promise<number> {
  const { prisma } = await import("@/lib/prisma");

  const scraped = await scrapeBrandSubreddits(brand);
  const titleCount = scraped.reduce((n, s) => n + s.titles.length, 0);
  if (titleCount < 10) {
    console.warn(
      `[reddit-trends] ${brand}: only ${titleCount} titles scraped — skipping digest (RSS likely blocked)`
    );
    return 0;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000);

  // Trailing week of distilled themes = the "rolling blend" half.
  const priorRows = await prisma.redditTrendDigest.findMany({
    where: { brand, date: { gte: weekAgo, lt: today } },
    orderBy: { date: "desc" },
    select: { date: true, themes: true },
  });
  const priorThemes = priorRows
    .flatMap((r) => (Array.isArray(r.themes) ? (r.themes as unknown as RedditTheme[]) : []))
    .map((t) => t?.theme)
    .filter((t): t is string => typeof t === "string");

  const userMsg = [
    `AUDIENCE: ${AUDIENCE_BRIEF[brand]}`,
    "",
    "TODAY'S TRENDING TITLES:",
    ...scraped.map(
      (s) => `\n[community ${s.subreddit}]\n${s.titles.map((t) => `- ${t}`).join("\n")}`
    ),
    "",
    priorThemes.length > 0
      ? `THEMES FROM THE PAST 7 DAYS (for the rolling blend — recurring ones deserve rank):\n${[...new Set(priorThemes)].map((t) => `- ${t}`).join("\n")}`
      : "No prior-week themes yet (first run).",
  ].join("\n");

  const start = Date.now();
  const purpose = "reddit-trend-digest";
  let themes: RedditTheme[] = [];
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      system: distillSystem(brand),
      messages: [{ role: "user", content: userMsg }],
    });
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = JSON.parse(
      lastJsonText(text)
    ) as { themes?: Partial<RedditTheme>[] };
    themes = (parsed.themes ?? [])
      .filter(
        (t) =>
          typeof t?.theme === "string" &&
          typeof t?.why === "string" &&
          typeof t?.angle === "string" &&
          Array.isArray(t?.phrases)
      )
      .map((t) => ({
        theme: (t.theme as string).trim(),
        why: (t.why as string).trim(),
        angle: (t.angle as string).trim(),
        phrases: (t.phrases as string[]).filter((p) => typeof p === "string").slice(0, 4),
      }))
      .slice(0, 10);
  } catch (e) {
    await prisma.claudeCallLog
      .create({
        data: {
          purpose,
          model: CLAUDE_MODEL,
          tokensIn: 0,
          tokensOut: 0,
          costCents: 0,
          durationMs: Date.now() - start,
          success: false,
          errorMessage:
            e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500),
        },
      })
      .catch(() => {});
    console.error(`[reddit-trends] ${brand}: distill failed`, e);
    return 0;
  }

  if (themes.length === 0) return 0;

  await prisma.redditTrendDigest.upsert({
    where: { date_brand: { date: today, brand } },
    update: { themes: themes as unknown as object[], sourcePosts: scraped as unknown as object[] },
    create: {
      date: today,
      brand,
      themes: themes as unknown as object[],
      sourcePosts: scraped as unknown as object[],
    },
  });
  console.log(`[reddit-trends] ${brand}: ${themes.length} themes from ${titleCount} titles`);
  return themes.length;
}

/**
 * The "audience pulse" prompt block for a brand's topic generators.
 * Uses the freshest digest ≤8 days old (digest runs weekly Mondays
 * since 2026-09-21, so the window must span the whole week); returns
 * "" when none exists so callers can append unconditionally. Influence
 * only — every lane's locked format/voice rules still win.
 *
 * 2026-09-17: also appends the competitor "WHAT'S WINNING" mimic-signal
 * block (competitor-mimic.ts) — one wiring point feeds every lane both
 * research streams. Both halves are independently soft.
 */
export async function getAudiencePulse(brand: "ripple" | "bwk"): Promise<string> {
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  const row = await prisma.redditTrendDigest.findFirst({
    where: { brand, date: { gte: cutoff } },
    orderBy: { date: "desc" },
  });
  let pulse = "";
  if (row && Array.isArray(row.themes)) {
    const themes = (row.themes as unknown as RedditTheme[]).slice(0, 6);
    if (themes.length > 0) {
      pulse = [
        "",
        "AUDIENCE PULSE: what this audience is feeling right now, from live research into what they are saying to each other. Each line is a specific situation, why it lands, a possible angle, and the words they use for it.",
        ...themes.map(
          (t) => `- ${t.theme}: ${t.why} Angle: ${t.angle}${t.phrases.length ? ` (their words: ${t.phrases.join(", ")})` : ""}`
        ),
        "Use this to make today's post feel recognized. If one of these situations fits this lane naturally, let it shape the angle, and borrow their everyday words where they fit, because a reader who sees her own words is the one who comments. The lane's own format, theme and voice rules come first; skip the pulse rather than force it. Never mention the research, communities or trends in the copy.",
      ].join("\n");
    }
  }

  let mimic = "";
  try {
    const { getMimicSignal } = await import("./competitor-mimic");
    mimic = await getMimicSignal(brand);
  } catch {
    /* soft — pulse alone is fine */
  }
  return `${pulse}${mimic}`;
}

/** Top N ranked themes of the day for the solve lanes (empty = no
 *  digest). Returns several so the writer can pick the strongest one
 *  that doesn't repeat a recent post — the 7-day rolling blend keeps
 *  the same #1 theme around for days (2026-09-19). */
export async function getTopThemes(
  brand: "ripple" | "bwk",
  take = 4
): Promise<RedditTheme[]> {
  const { prisma } = await import("@/lib/prisma");
  const cutoff = new Date(Date.now() - 8 * 24 * 3600 * 1000);
  const row = await prisma.redditTrendDigest.findFirst({
    where: { brand, date: { gte: cutoff } },
    orderBy: { date: "desc" },
  });
  if (!row || !Array.isArray(row.themes)) return [];
  return (row.themes as unknown as RedditTheme[]).slice(0, take);
}
