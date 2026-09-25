/**
 * Content Factory — MOODY discipline carousel (2026-08-28, per Keenan).
 *
 * Cloned from a reference format that performs ("TRUST THE PROCESS"
 * style): a ~6-slide photo carousel of dark, moody, hyper-realistic
 * architecture/interior photography with clean white text centered
 * mid-frame. Cover = short commanding title; each item slide = a short
 * name ("Reset day.") + 2-3 short punchy paragraphs ending on a
 * command ("Bring order back."). No numbering on slides (2026-09-08,
 * per Keenan — he omits slides when hand-posting).
 *
 * TWO FUNNELS, same skeleton, different soul (both audience-growth
 * only — NO product CTA anywhere):
 * - "women": Keenan's core demographic (women ~40-50, mental load) —
 *   quiet-discipline/reset content in the existing brand voice, softer
 *   warm-but-dim visuals.
 * - "men": young aspiring men — discipline / trust-the-process /
 *   self-improvement command energy, stark dark visuals like the
 *   reference.
 *
 * Captions clone the reference: pure discovery hashtags, NO question
 * (per Keenan 2026-08-28 — deliberate exception to the question+tags
 * caption rule, which still governs every other lane).
 */

import Anthropic from "@anthropic-ai/sdk";
import { humanizePass, extractVoice, HUMAN_VOICE_RULES } from "./humanizer";
import { withHeadlineRetry, fakeCandidFeedback } from "./headline-history";

const anthropic = new Anthropic();
const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export type MoodyAudience = "women" | "men";

export interface MoodyItem {
  /** Short item name, e.g. "Reset day." */
  name: string;
  /** 2-3 short paragraphs; the last is a punchy one-line command. */
  lines: string[];
  /** Scene for this slide's background image. */
  scene: string;
}

export interface MoodyTopic {
  slug: string;
  /** Cover title — short, commanding ("TRUST THE PROCESS" energy). */
  title: string;
  coverScene: string;
  /** Pick-list lanes (2026-09-10, per Keenan: "add 3 cover photos and
   *  15 different images per lane. that way I can pick the ones that
   *  actually make sense/are good") — multiple candidate cover scenes,
   *  each rendered as its own COVER slide. coverScene = the first. */
  coverScenes?: string[];
  items: MoodyItem[];
}

export const AUDIENCE_BRIEF: Record<MoodyAudience, string> = {
  men: `AUDIENCE: young aspiring men (18-30) deep in the self-improvement / discipline / "trust the process" niche. They save posts that read like orders from a future self: monk mode, order, focus, momentum, delayed gratification, becoming undeniable.
VOICE: calm command energy, HIGHLY MOTIVATIONAL — every slide should make him want to stand up and train. Short declarative sentences. No softness, no hedging, no "maybe try". Direct second person. The tone of a mentor who's already made it and doesn't waste words. Never bro-slang, never yelling, never toxic — controlled, austere, certain, relentless.
TOPICS to rotate: discipline systems, monk mode, dopamine control, morning/evening order, cutting noise, training, focus blocks, silence, patience, becoming hard to distract.`,
  women: `AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. They save posts that feel like quiet permission to reclaim order and protect their peace.
VOICE: quiet strength. Short declarative sentences with warmth underneath — a woman who has stopped explaining herself. Direct second person. Never preachy, never girlboss, never clinical. Discipline framed as self-respect: boundaries, resets, saying no, protecting energy, doing less on purpose.
TOPICS to rotate: protecting your peace, reset rituals, boundaries without guilt, quiet mornings, dropping what drains you, unhurried order, saying no, letting the phone go dark.`,
};

export type WomenScheme = "light" | "dark";

// Ripple 50/50 scheme split (2026-09-01, per Keenan: "make half the
// ripple posts light like they currently are, and the other half dark
// like they used to be"). Every women/Ripple moody-family post rolls a
// scheme in carousel-daily.ts: "light" = the 2026-08-30 airy identity
// (bright scenes, dark charcoal text), "dark" = the original warm-dim
// quiet-luxury identity (dim scenes, white text). Selfie is a
// real-photo lane and exempt.
export const WOMEN_SCENE_BRIEFS: Record<WomenScheme, string> = {
  light: `SCENES: soft, aesthetically pleasing FEMININE photography in LIGHT, airy tones, in FIVE families (2026-09-18 library — per Keenan: "the pictures all come out too similar"): (1) QUIET HOME IN DAYLIGHT — morning sun through sheer linen curtains, cream silk bedding in a bright bedroom, a sunlit bath with steam rising, a kitchen still and sunlit after everyone has left, a made bed in a child's old bedroom with curtains glowing, a hallway of small shoes by the door in morning light. (2) GARDENS & SOFT NATURE — a garden path after light rain, roses heavy with dew in morning sun, a bench under a blossoming tree, white linen breathing on a line in a bright yard, an orchard in soft morning mist, long grass and wildflowers in early light. (3) MORNING WATER — a lake seen from a wooden dock in soft morning light, a calm shoreline at sunrise, a rowboat tied at a misty jetty, light rain dimpling a pale pond. (4) SOFT CITY & AWAY — a balcony breakfast in early sun over a soft-focus city, a sunlit café window with pastries and folded newspapers, a bright European lane with shutters open to the morning, a train window full of passing fields in morning light, a hotel bed in white linen beside a tall bright window. (5) BRIGHT STILL-LIFE — white peonies in a glass vase on a pale table, market flowers wrapped in paper on a pale counter, tea steaming by a bright window, blank cream stationery and a fountain pen on a pale desk in morning sun, a bright window seat with an open book. Cream, ivory, blush, soft gold — warm, dreamy, beautiful, never cluttered, and every scene SOFT and LIGHT (dark charcoal text must read on it). Gentle and airy, never dark or heavy. No people ever. FAMILY-SPREAD RULE (non-negotiable): the scenes in ONE post must span AT LEAST THREE different families — never let a whole post live in home interiors. These are SEEDS, not a menu — invent a brand-new location for every slide (new place, season, weather, vantage, time of morning) so no two posts look alike.`,
  dark: `SCENES: soft, aesthetically pleasing FEMININE photography in warm LOW light, in FIVE families (2026-09-18 library — per Keenan: "the pictures all come out too similar"): (1) QUIET HOME AFTER DARK — silk bedding in candlelight, a kitchen table cleared after dinner lit by one warm lamp, a bath steaming in flickering candlelight, a silk robe over a chair by rain-streaked night glass, an armchair and open book in a pool of lamplight, the kitchen after everyone is asleep lit by one small light, a porch light left on over an empty step. (2) NIGHT GARDENS & WILD QUIET — a garden at blue hour with one lit window glowing behind, rain beading on roses in evening light, a greenhouse glowing warm at dusk, a bench under a tree in soft night rain, a lavender field at last light, a stone path into a darkening garden, fireflies over long grass at dusk. (3) DUSK WATER — a lake at last light with mist rising, a wooden dock reaching into dark water at blue hour, a shoreline as the tide pulls back at dusk, willow branches trailing over a dark pond, a rowboat tied at an empty jetty in the evening calm, rain circles on a lake under a warm grey sky. (4) EVENING CITY FROM A SOFT DISTANCE — a rain-streaked café window glowing warm at night, a narrow European lane at dusk with shop windows lit, a balcony table with the city blurred to bokeh below, a train window at last light, warm-lit windows across a courtyard in the rain, a bookshop window glowing on a dark street. (5) WARM STILL-LIFE — white peonies catching lamplight in a dark room, tea steaming beside a low candle, a strand of pearls on dark wood, blank cream stationery and a fountain pen in a pool of warm lamplight, dried flowers by a dark window, an open book and reading glasses in lamplight — one hero subject, shot like a quiet-luxury ad. Muted, warm, dreamy — quiet luxury after dark, never harsh or cold. Every scene DIM (white text must read on it), soft shadows, intimate. No people ever. FAMILY-SPREAD RULE (non-negotiable): the scenes in ONE post must span AT LEAST THREE different families — never let a whole post live in home interiors. These are SEEDS, not a menu — invent a brand-new location for every slide (new place, season, weather, vantage, time of evening) so no two posts look alike.`,
};

// First sentence of every women-lane system prompt, by scheme — the
// text treatment must match the photography the scheme produces.
const WOMEN_PROMPT_HEADER: Record<WomenScheme, string> = {
  light:
    "You write text for a soft, light, feminine minimal photo-carousel account. Each post is a cover + slides of dark text centered on bright, airy photography.",
  dark: "You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography.",
};

export const SCENE_BRIEF: Record<MoodyAudience, string> = {
  men: `SCENES: dark, dramatic, luxurious photography in FOUR families (2026-09-10 library — nothing outside them): (1) DARK-LUXURY ARCHITECTURE — luxury buildings with a dark aesthetic and a DRAMATIC SKY (every building scene MUST have heavy cloud cover, cool cinematic lighting, or a burning sunset behind it): a black-glass penthouse tower with its crown wrapped in storm cloud, a cliff mansion glowing above a storm sea at dusk, a skyscraper silhouetted against a blood-orange sunset, a brutalist villa under rolling thunderheads. The building shot low and dramatic, grand and expensive, never a flat distant skyline, never a plain empty sky. (2) ALPHA WILDLIFE — one alpha animal commanding a super-cool landscape: a wolf on a cracked frozen lake beneath storm pines, a lion crossing black dunes at dusk, a stag on a ridgeline in blowing snow, an eagle sweeping low over a fjord, a panther on wet rock in night rain. Draw from the ENTIRE animal kingdom; the animal is the clear hero of the frame, the landscape epic around it; HYPER-REAL weather only — natural light a wildlife photographer could actually capture, NEVER lightning bolts, glowing skies, or painted-on effects; never reuse an animal from a recent post. (3) DARK-LUXURY OBJECTS — luxury items with a dark theme, shot like a high-end ad: a Swiss watch on black marble, a signet ring beside a crystal tumbler in lamplight, a private jet on wet tarmac at night, a superyacht moored in a storm-dark harbour. NO CARS here — cars are their own family (2026-09-24) and appear only when the COVER SCENE RULE locks a post to it. One hero object, deep shadow, tactile hyperreal detail — the object must be unmistakably LUXURY and dramatic, NEVER notebooks, journals, pens, books, desks, paperwork, or any flat office/stationery still-life. (4) EPIC WARRIORS — a lone armored warrior seen from a DISTANCE in an epic landscape THAT MATCHES WHO HE IS: a viking striding up a windswept grey beach with longships behind him, a samurai on a misty bamboo path in rain, a medieval knight leading his horse up a snowy mountain trail, a spartan climbing sun-bleached coastal rocks — every warrior type gets ITS OWN world matched to his culture, never one generic snowfield, and NEVER standing directly on ice or a frozen lake. FULL armor (gleaming silver, burnished gold, or blackened steel), DOING something powerful — mid-stride into the weather, arms flexed in triumph with head raised to the sky, driving a sword into the earth, climbing against the wind. The pose reads in silhouette and radiates STRENGTH, CONSISTENCY, and DRIVE — the frame should make a man want to get to work. WIDE cinematic framing in an immense landscape, NEVER close to the camera, never a close-up; HYPER-REAL like a prestige-film still — real weather, real light, never a video-game render; face never visible (helmet on, visor down, or too distant to read). Desaturated, near-monochrome, night or storm light. Every scene DIM and shadowed (white text must read on it), austere and powerful. ANTI-BLAND RULE (non-negotiable): every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape, never bare ground, reeds, or a plain horizon with nothing commanding the frame. NO people EVER — write every scene EMPTY of humans, with exactly two exceptions inside their own families: ONE lone alpha animal in wildlife scenes, and ONE distant armored warrior (face never visible) in warrior scenes. UNLIMITED LIBRARY RULE: every example above is a SEED, not a menu — INVENT a brand-new scene for every single slide of every post (new subject, new location, new season, new weather, new time, new vantage) within these four families, and never render an example verbatim or repeat a scene from a recent post. No two images across any posts should ever look alike.`,
  women: WOMEN_SCENE_BRIEFS.light,
};

const buildMoodySystemPrompt = (
  audience: MoodyAudience,
  opts?: { theme?: string; coverRule?: string; sceneBrief?: string }
) => `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 item slides of white text centered on cinematic photography.

${AUDIENCE_BRIEF[audience]}
${opts?.theme ? `\n${opts.theme}\n` : ""}
${opts?.sceneBrief ?? SCENE_BRIEF[audience]}
${opts?.coverRule ? `\n${opts.coverRule}\n` : ""}
FORMAT — every item slide is a tight three-part build rendered as: bold HEADER, one italic HOOK line, short BODY. Study this example and match its shape exactly:
name: "The Reset Day"
lines[0] (hook): "Order outside builds order inside."
lines[1] (body): "Once a week, clear everything — room, car, files, notes. Chaos has nowhere to live."

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past. 2-4 words, works in ALL CAPS, and it must PULL the reader into the slides: ${audience === "men" ? `a direct COMMAND to the reader (the shape: a strong VERB + an object that names what the slides are about — see COVER COMMAND RULE)` : `either a direct command to act (the shape: VERB + an object that names what the slides are about) or a direct prompt to engage what's inside (the shape: an instruction for HOW to read or answer the slides, often ending "...")`}. Invent the words for THIS post's subject every time. Past covers like "EARN YOUR SILENCE", "HOLD THE LINE", "READ THESE SLOWLY" and "YOU ALREADY KNOW" are SPENT — never reuse them, and never reuse any title from the recent-headlines list. Never a passive label or topic name. No number. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must fit what the slides deliver. Do NOT stitch together or remix spent titles; if a title reads odd, garbled, or random without the slides ("DON'T LIE NOW"), it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item:
  - "name": the HEADER — a named concept in Title Case, 2-4 words, NO trailing period ("The Reset Day", "Quiet Hours", "The 90% Rule"). It should feel like naming something real the reader never had words for.
  - "lines": EXACTLY 2 entries.
    - lines[0]: the HOOK — ONE short sentence that reframes the header and lands completely on its own (it renders in italics under the header). Compressed truth, equations welcome ("Order outside builds order inside.").
    - lines[1]: the BODY — 1-2 short sentences, concrete and specific, ending on a command or a plain truth. Lists welcome ("room, car, files, notes").
- HARD LIMIT: each slide's hook + body totals UNDER 30 words. Long = generic = scrolled past. Short = screenshotted and saved. Cut every word that isn't pulling weight.
- Every sentence short. No commas chained past two. No metaphors that need decoding. Read it out loud — it should sound inevitable, not written.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to" or "consider". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather, materials) following SCENES above. Every scene in the post is a DIFFERENT location — vary boldly.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["hook", "body"], "scene": "..." }
  ]
}`;

/**
 * Shared generation core for every moody-family carousel (discipline,
 * memento, questions): one Claude call, ClaudeCallLog bookkeeping, JSON
 * parse + validation, slug. `requireName` is off for formats whose
 * slides carry no "N. Name." header (memento/questions); `minLines`
 * allows single-line slides (questions).
 */
type MoodyFamilyOpts = {
  purpose: string;
  system: string;
  user: string;
  slugPrefix: string;
  requireName: boolean;
  minLines: number;
  /** Slide-count variance (2026-08-29, per Keenan: "they can be 4-10
   *  slides long. the more scrolls the better engagement") — lanes that
   *  vary length pass these; everything else keeps the 4-6 default. */
  minItems?: number;
  maxItems?: number;
  /** Pick-list lanes (2026-09-10): number of candidate cover scenes to
   *  request/accept. Default 1 (plain coverScene). */
  coverCount?: number;
  /** 15-item pick-list posts need more room than the 2000 default. */
  maxTokens?: number;
  /** Reddit audience-pulse injection (2026-09-17, per Keenan: "this
   *  influences our daily lanes"). When set, the freshest
   *  RedditTrendDigest block for the brand is appended to the system
   *  prompt as angle inspiration. Soft: missing digest / any error =
   *  no block, generation unchanged. */
  brand?: "ripple" | "bwk";
  /** false = skip the cross-lane headline dedupe (history block +
   *  retry). Only for lanes whose cover title is FIXED by the format
   *  (protocol's "{INTERVAL} OF DISCIPLINE...") — a retry there would
   *  fight the prompt for no gain. */
  headlineDedupe?: boolean;
};

/**
 * Cross-lane headline dedupe (2026-09-23): every moody-family lane gets
 * the shared recent-headlines block appended to its request, and one
 * retry with explicit feedback if the cover title still comes back as an
 * exact recent repeat. See headline-history.ts.
 */
async function generateMoodyFamilyTopic(opts: MoodyFamilyOpts): Promise<MoodyTopic> {
  if (opts.headlineDedupe === false) return generateMoodyFamilyTopicOnce(opts);
  return withHeadlineRetry({
    label: opts.purpose,
    generate: (extra) =>
      generateMoodyFamilyTopicOnce({ ...opts, user: insertBeforeJsonTail(opts.user, extra) }),
    headlineOf: (t) => t.title,
  });
}

/** Splice `extra` in ahead of the closing "Return ONLY valid JSON." line. */
function insertBeforeJsonTail(user: string, extra: string): string {
  const tail = "\n\nReturn ONLY valid JSON.";
  return user.endsWith(tail)
    ? user.slice(0, -tail.length) + extra + tail
    : user + extra;
}

async function generateMoodyFamilyTopicOnce(opts: MoodyFamilyOpts): Promise<MoodyTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  let pulse = "";
  if (opts.brand) {
    try {
      const { getAudiencePulse } = await import("./reddit-trends");
      pulse = await getAudiencePulse(opts.brand);
    } catch (err) {
      console.warn(
        `[moody-carousel] audience pulse unavailable (${opts.brand}):`,
        err instanceof Error ? err.message : err
      );
    }
  }
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      // HUMAN_VOICE_RULES (2026-09-04): prevention layer — the full
      // humanizer gate still runs on the output below.
      system: `${opts.system}${pulse}\n\n${HUMAN_VOICE_RULES}`,
      messages: [{ role: "user", content: opts.user }],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      title?: string;
      coverScene?: string;
      coverScenes?: string[];
      items?: { name?: string; lines?: string[]; scene?: string }[];
    };

    const title = (parsed.title ?? "").trim();
    const items = (parsed.items ?? [])
      .filter(
        (it) =>
          (!opts.requireName || typeof it.name === "string") &&
          Array.isArray(it.lines) &&
          it.lines.length >= opts.minLines &&
          typeof it.scene === "string"
      )
      .map((it) => ({
        name: (it.name ?? "").trim(),
        lines: it.lines!.map((l) => l.trim()).filter(Boolean),
        scene: it.scene!.trim(),
      }));
    if (!title || items.length < (opts.minItems ?? 4)) {
      throw new Error(
        `${opts.purpose} unusable: title="${title}", ${items.length} valid items`
      );
    }

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    const finalItems = items.slice(0, opts.maxItems ?? 6);

    // Humanizer approval gate (2026-09-04, per Keenan: "every single
    // script must pass through this first in order to be approved
    // content"). Reader-facing text only — scenes never go through.
    // Fails open: on gate error the prompt-side-ruled copy ships.
    let gatedTitle = title;
    let gatedItems = finalItems;
    try {
      const gated = await humanizePass({
        purpose: `humanize:${opts.purpose}`,
        voice: extractVoice(opts.system),
        payload: {
          title,
          items: finalItems.map((it) => ({ name: it.name, lines: it.lines })),
        },
      });
      if (
        typeof gated.title === "string" &&
        gated.title.trim() &&
        Array.isArray(gated.items) &&
        gated.items.length === finalItems.length
      ) {
        gatedTitle = gated.title.trim();
        gatedItems = finalItems.map((it, i) => {
          const g = gated.items[i];
          const gLines =
            Array.isArray(g?.lines) &&
            g.lines.length === it.lines.length &&
            g.lines.every((l) => typeof l === "string" && l.trim())
              ? g.lines.map((l) => l.trim())
              : it.lines;
          return {
            ...it,
            name:
              typeof g?.name === "string" && g.name.trim()
                ? g.name.trim()
                : it.name,
            lines: gLines,
          };
        });
      }
    } catch (err) {
      console.warn(
        `[content-factory] humanize gate failed for ${opts.purpose} — shipping ungated copy:`,
        err
      );
    }

    // Pick-list lanes: accept up to coverCount candidate cover scenes.
    const coverScenes = (parsed.coverScenes ?? [])
      .filter((s): s is string => typeof s === "string" && !!s.trim())
      .map((s) => s.trim())
      .slice(0, opts.coverCount ?? 1);
    const coverScene =
      coverScenes[0] || (parsed.coverScene ?? "").trim() || items[0].scene;

    return {
      slug: `${opts.slugPrefix}-${slug}`,
      title: gatedTitle,
      coverScene,
      coverScenes:
        (opts.coverCount ?? 1) > 1 && coverScenes.length > 1
          ? coverScenes
          : undefined,
      items: gatedItems,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: opts.purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

/**
 * Anti-repetition block (strengthened 2026-08-31, per Keenan: "we need
 * more variation across all different posts... it can't be the same
 * thing every time with the same info"). The recent titles mark
 * TERRITORY already covered — the new post must differ in substance,
 * not just wording.
 */
function avoidBlock(
  recentHeadlines: string[],
  feedback?: string | null
): string {
  const avoid =
    recentHeadlines.length > 0
      ? `\n\nRECENT POSTS — this ground is already covered:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}\nYour post must be genuinely NEW against that list — not the same ideas under a different title. Do not re-teach the same points, reuse the same subjects or numbers, or mirror the same structure. Take an angle the list hasn't touched.`
      : "";
  // Learning loop (2026-09-14, per Keenan: "it should take feedback on
  // prior posts when building everything out") — real engagement numbers
  // from performance.ts, appended after the avoid list so the model both
  // avoids covered ground AND leans into what the audience rewards.
  return avoid + (feedback ?? "");
}

// ─── BWK theme lock (2026-09-03, per Keenan) ─────────────────────────
// "the best post so far was the 'earn your silence' post for build
// with key, followed by 30 days. earn it. and hold the line got a lot
// of views with the skyscraper start image... focus around these
// topics and images for the inital posts. still include variance. but
// keep to these three for BWK." BWK is now 3 posts/day, one per
// winning family: moody-men = SILENCE, line = HOLD THE LINE
// (storm-skyscraper covers), protocol = 30 DAYS (already the winner
// format, unchanged).
const SILENCE_THEME = `THEME — every post belongs to the SILENCE family: moving in silence, building in private, working unseen, no announcements, letting results speak. Rotate the angle every post — going quiet for a season, killing announcement culture, private standards nobody sees, disappearing to build, the quiet hours before the world wakes, winning without telling anyone — so no two posts repeat, but every post is unmistakably a silence post. Titles live in the family too (a short command about quiet, privacy, or working unseen, in brand-new words for this post's angle; "EARN YOUR SILENCE" is spent, never reuse it) without repeating a recent title.`;

// DORMANT 2026-09-10 (per Keenan: "change 'hold the line' to a
// new-style discipline line" — replaced by the WATCHING lane below).
// Kept for revival, like every retired format.
const LINE_THEME = `THEME — every post belongs to the HOLD THE LINE family: endurance, standards that do not move, staying when it gets hard, refusing to break the streak, holding position when motivation dies. Rotate the angle every post — holding the morning line, standards under pressure, the days nobody claps, finishing what the first week started, never negotiating with yourself — so no two posts repeat, but every post is unmistakably a hold-the-line post. Titles live in the family too (a short command about endurance or standards, in brand-new words for this post's angle; "HOLD THE LINE" is spent, never reuse it) without repeating a recent title.`;

// ─── Three discipline lanes (2026-09-10, per Keenan) ─────────────────
// "replace [hold the line] with 2 [WHEN NO ONE'S WATCHING], and also
// add 'pay the price' line, and a 'prove it' one too." All three are
// moody-family men's lanes sharing the BWK visual DNA + cover-family
// rotation; each has its own locked theme.
const WATCHING_THEME = `THEME — every post belongs to the WHEN NO ONE'S WATCHING family: private discipline — what a man does when nobody would ever know either way. Every item is a private test: the bed made in an empty house, the workout that never gets posted, the alarm kept on a free morning, the food logged with no one checking, the promise kept to himself alone at midnight. The tension is always integrity vs audience — who he is when there is no camera, no story, no applause. Rotate the angle every post — the 5am hours nobody sees, standards kept in hotel rooms, what he does after everyone is asleep, the reps counted honestly when lying would be free — so no two posts repeat, but every post is unmistakably about the unwatched hours. Titles live in the family too (style reference: "WHEN NO ONE'S WATCHING..." energy, never those exact words; write new words for this post's angle) without repeating a recent title.`;

const PRICE_THEME = `THEME — every post belongs to the PAY THE PRICE family: naming the REAL cost of the life he says he wants — the sleep, the comfort, the nights out declined, the friends who stop calling, the opinions ignored, the years of looking stupid before it works. Each item names ONE price in plain, unsentimental terms: what exactly gets paid, and what paying it buys. No romanticizing — it should read like an itemized bill. EXCEPTION to the last-line rule: the FINAL item's last line must be exactly "Still want it?" — the one place a command becomes a question. Rotate the goal every post — the body, the money, the freedom, the skill, the name — so no two posts repeat. Titles live in the family too (style reference: "PAY THE PRICE." energy, never those exact words; write new words for this post's angle) without repeating a recent title.`;

const PROVE_THEME = `THEME — every post belongs to the PROVE IT family: call-out energy. Every item takes a claim men love to make and turns it into what TODAY has to look like if the claim is true. EXCEPTION to the name rule: each item's "name" is the claim itself, 3-6 words ending with a period ("I want the money.", "I'm built different.", "I want the body.") — no quotation marks. The lines then convert the claim into one concrete, checkable action for today (a time, a count, a rule) and close on a short command with "prove it" energy ("Prove it before noon."). The unspoken thesis of every post: talk is free, the calendar doesn't lie. Rotate the claims every post — money, physique, discipline, skill, independence, focus — so no two posts repeat. Titles live in the family too (style reference: "PROVE IT." energy, never those exact words; write new words for this post's angle) without repeating a recent title.`;

// BWK image library v3 (2026-09-10, per Keenan: "these photos are all
// too bland/boring... focus on these when building posts for BWK -
// luxury buildings with dark aesthetic, super cool landscape scenes
// with alpha animals, luxury items/cars/watches with dark theme, and
// add a new photo type of similar aesthetic medieval knights in sick
// armor hyper realistic snowy or other kinds of settings"). His
// "bland" example was an empty flat marsh; his "good" example a wolf
// commanding a frozen lake — the difference is a dramatic SUBJECT.
// Supersedes the 18-family library from 2026-09-08: the rotation now
// focuses on his FOUR chosen aesthetics. The UNLIMITED LIBRARY RULE
// still stands — families are seeds, every image invented fresh. The
// roll happens at topic-generation time, inside a memoized Inngest
// step, so replays keep the same family.
interface MenCoverFamily {
  name: string;
  brief: string;
  /** Variety pools (2026-09-24, per Keenan: lanes lock to one theme, "add
   *  more variation amongst all themes"). One subject + one setting is
   *  ROLLED per post in code, so the model can't anchor on the first
   *  example the way it did with prose-only seeds. Items draw their own
   *  different subjects from the same pool. */
  subjects: string[];
  settings: string[];
  /** false = only reachable via a lane lock / forced family, never the
   *  random roll (cars: Keenan's worst performer, now its own lane only;
   *  fantasy: its own lane). */
  inRandomPool: boolean;
}

export const MEN_COVER_FAMILIES: MenCoverFamily[] = [
  {
    name: "dark-luxury architecture",
    brief:
      "luxury buildings with a dark aesthetic and a DRAMATIC SKY — every building scene MUST have heavy cloud cover, cool cinematic lighting, or a burning sunset behind it. Grand, expensive, cinematic — the building is the SUBJECT, shot low and dramatic with real presence, never a flat distant skyline, never a plain empty sky.",
    subjects: [
      "a black-glass penthouse tower", "a modernist cliff mansion", "a brutalist concrete villa", "a marble neoclassical estate",
      "a supertall skyscraper under construction with its crane lit", "a desert glass house", "a mountain lodge of black timber and stone",
      "a floating infinity-pool villa", "an old-money stone manor with lit windows", "a spiral parking tower of luxury cars",
      "a monolithic museum of raw concrete", "a lighthouse-turned-residence on black cliffs", "a rooftop helipad crowning a tower",
      "a gothic cathedral facade lit from below", "a private island compound", "a steel-and-glass bridge penthouse spanning two towers",
    ],
    settings: [
      "under a rolling thunderhead at dusk", "against a blood-orange sunset", "wrapped in low storm cloud at night",
      "in blue-hour fog", "above a storm sea", "in heavy rain with lit windows", "in snowfall at night",
      "under a breaking storm with shafts of light", "at golden hour after rain, streets mirrored", "in desert heat haze at sundown",
    ],
    inRandomPool: true,
  },
  {
    name: "alpha wildlife",
    brief:
      "ONE alpha animal commanding a super-cool landscape. The animal is the clear HERO of the frame — close enough to feel its presence, the landscape epic around it. HYPER-REALISM RULE (2026-09-11, per Keenan): this must look like a real wildlife photograph — natural light and physically plausible weather ONLY, the kind of frame a wildlife photographer could actually capture; NEVER lightning bolts, glowing skies, or any painted-on dramatic effect. Emotion comes from the animal and the realism, not from spectacle.",
    subjects: [
      "a grey wolf", "a black wolf", "a male lion", "a Siberian tiger", "a black panther", "a snow leopard", "a golden eagle",
      "a bald eagle", "a grizzly bear", "a polar bear", "a bull elk", "a red stag", "an American bison", "a silverback gorilla",
      "a jaguar", "a great white shark breaching", "an orca", "a black stallion", "a bull moose", "a peregrine falcon",
      "a mountain gorilla", "a Cape buffalo", "a lone Arctic wolf", "a Bengal tiger crossing a river", "a condor",
    ],
    settings: [
      "on a ridgeline in blowing snow", "crossing black volcanic sand at dusk", "in a misty pine forest at dawn",
      "on wet rock in night rain", "in tall winter grass at first light", "on a cracked frozen lake beneath storm pines",
      "in a river canyon at golden hour", "on a fog-covered savanna", "on a sea cliff in driving wind", "in a snowbound valley under grey light",
    ],
    inRandomPool: true,
  },
  {
    name: "dark-luxury objects",
    brief:
      "ONE hero luxury object with a dark theme, shot like a high-end ad — deep shadow, controlled highlights, tactile hyperreal detail. Unmistakably LUXURY and dramatic — NEVER notebooks, journals, pens, books, desks, paperwork, or any flat office/stationery still-life. (Cars live in their own family and never appear here.)",
    subjects: [
      "a Swiss chronograph", "a vintage dive watch", "a signet ring beside a crystal tumbler", "a private jet", "a superyacht",
      "a chess king piece", "a bespoke leather duffel", "a custom motorcycle", "a Cuban cigar in a heavy glass ashtray",
      "a fencing sabre on velvet", "a pair of boxing gloves hung on a nail", "a bottle of aged whiskey and one glass",
      "a vintage Leica camera", "a gold bar on black stone", "a cased pocket watch", "a hand-forged chef's knife",
    ],
    settings: [
      "on black marble in low light", "under one cold spotlight", "on wet tarmac at night", "in a dim wood-panelled study",
      "lit by a single window at dusk", "on a rain-beaded surface", "in a dark hangar", "moored in a storm-dark harbour",
    ],
    inRandomPool: true,
  },
  {
    name: "luxury cars",
    brief:
      "ONE hero car, shot like a high-end automotive ad — deep shadow, controlled highlights, rain and reflections, tactile hyperreal detail (paint depth, tire tread, badge engraving). Mix eras and marques every post (per Keenan 2026-09-24: old-school classics, Lamborghinis, Ferraris, BMW M5s and more) — never the same car twice in a row. The car is the SUBJECT; the setting frames it with drama.",
    subjects: [
      "a 1960s Ferrari 250 GT", "a Ferrari F40", "a modern Ferrari SF90", "a Lamborghini Countach", "a Lamborghini Aventador",
      "a Lamborghini Miura", "a BMW M5 E39", "a BMW M5 F90", "a BMW E30 M3", "a Mercedes 300SL gullwing",
      "a Mercedes G-Wagon", "an old-school Mercedes S-Class W126", "a Porsche 911 Turbo 930", "a Porsche 911 GT3 RS",
      "a Rolls-Royce Phantom", "an Aston Martin DB5", "a Ford GT40", "a Bugatti Chiron", "a McLaren F1",
      "a 1969 Dodge Charger", "a Nissan Skyline GT-R R34", "a Bentley Continental", "a Range Rover in black", "a Toyota Supra MK4",
    ],
    settings: [
      "under one cold spotlight in a dark garage", "on a rain-slicked city street at night", "on a wet mountain switchback at dusk",
      "in a neon-lit tunnel", "on an empty desert highway at sundown", "on a snowy alpine pass", "in a private hangar",
      "outside a stone villa in the rain", "on a coastal road above a storm sea", "in a concrete parking structure at 3am",
    ],
    inRandomPool: false,
  },
  {
    name: "epic warrior",
    brief:
      "a lone armored warrior seen from a DISTANCE in an epic landscape THAT MATCHES WHO HE IS, hyperrealistic. LANDSCAPE RULE (2026-09-11, per Keenan): every warrior type gets ITS OWN world — match the terrain to his culture and era, never one generic snowfield, and NEVER standing directly on ice or a frozen lake (a snowy path or ridgeline is fine). FULL armor (gleaming silver, burnished gold, or blackened steel). The warrior is DOING something powerful, never posing idle: mid-stride into the weather, fists clenched and arms flexed in triumph with head raised to the sky, driving a sword or spear into the earth, climbing against the wind. The pose must read in silhouette and radiate STRENGTH, CONSISTENCY, and DRIVE. WIDE and cinematic: the warrior small-to-mid in an immense landscape, NEVER a close-up. HYPER-REALISM RULE: a still from a prestige film — real weather physics, real light, never a video-game render. Face never visible — helmet on, visor down, or too distant to read.",
    subjects: [
      "a viking with a round shield", "a samurai in lacquered armor", "a medieval knight leading his warhorse", "a spartan hoplite",
      "a Roman legionary", "a crusader knight", "a Mongol horse archer", "a Scottish highlander with a claymore",
      "a Byzantine cataphract", "a Persian immortal", "a Teutonic knight", "a Norman knight on horseback", "a gladiator",
    ],
    settings: [
      "on a windswept grey beach with longships behind", "on a misty bamboo path in rain", "up a snowy mountain trail",
      "on sun-bleached coastal rocks", "across wind-carved dunes at dusk", "on a ridge above a burning valley at night",
      "through a pine forest in heavy fog", "on a highland moor in driving rain", "on the steppe under a vast storm sky",
      "on the steps of a ruined temple at dawn", "along a castle rampart in sleet",
    ],
    inRandomPool: true,
  },
  {
    name: "fantasy hero",
    brief:
      "EPIC FANTASY, rendered hyperreal like a still from a prestige fantasy-epic film (never a painting, never a game render): a dragon and/or a lone armored hero in a mythic world. Dragons are physically believable — real scale, leathery wing membranes with veins and scars, heavy scales catching real light, breath fogging in cold air — and the rider/hero is DISTANT, armored, face never visible (helmet or too far to read). The feeling: the reader IS the hero of his own story — the rider who answered the call. Awe, weight, danger, triumph. Desaturated, storm-lit, near-monochrome with at most one ember or fire accent.",
    subjects: [
      "a lone rider on a black dragon mid-flight", "a dragon perched on a cliff-top ruin with its rider standing below",
      "an armored hero facing a dragon across a gorge", "a rider climbing a dragon's foreleg to mount it",
      "a dragon rider banking through storm clouds", "a hero raising a sword before a sleeping dragon in a cavern",
      "a silver dragon landing on a mountain fortress wall", "a rider and dragon silhouetted against a burning sky",
      "a hero crossing a stone bridge toward a dragon's keep", "two dragons circling a volcanic peak with one rider",
      "a dragon's eye opening in the dark with a hero's torch reflected in it", "a knight kneeling at the edge of a dragon's nest",
    ],
    settings: [
      "above a fjord at dawn", "over a snowbound mountain range", "through volcanic ash at dusk", "over a stormy northern sea",
      "above a walled citadel at night", "in a mist-filled canyon", "over black pine forests in rain", "above the clouds at first light",
    ],
    inRandomPool: false,
  },
];

// Lane → family locks (2026-09-24, per Keenan: "if each lane stuck to a
// specific theme... cars are cars themed... heroes are heroes, building
// themes are building themes, animal themes are animal themed"). A lock
// pins cover AND items to one family. muse-men stays unlocked (it runs a
// competitor's mechanic, visuals included); timeline has its own grid
// template. A caller-supplied sceneFamily (admin one-offs) still wins.
export const BWK_LANE_FAMILY: Record<string, string> = {
  "memento-men": "luxury cars",
  watching: "alpha wildlife",
  "discipline-real": "epic warrior",
  "pulse-men": "dark-luxury architecture",
  "fantasy-men": "fantasy hero",
};

// Cover command rule (2026-09-24, per Keenan: "all cover slides need to
// be a command to the person reading it, i've noticed those get the best
// engagement"). Appended to every BWK cover rule so it applies to every
// BWK lane, and it overrides any softer title shape in a lane prompt.
export const BWK_COVER_COMMAND_RULE = `COVER COMMAND RULE (overrides any other title shape in this prompt): "title" MUST be a direct COMMAND to the man reading it — an imperative that opens with a strong verb and tells HIM to do something (shapes like "STOP WAITING FOR PERMISSION", "OUTWORK YOUR EXCUSES", "BUILD IT BEFORE THEY NOTICE..." — shapes only, never reuse those words). Never a question, never a label or topic name, never first person, never a statement about other people. 2-6 words, ALL-CAPS ready, a trailing "..." allowed. It must make instant sense on its own and promise exactly what the slides deliver.`;

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)];
}

function sample<T>(xs: T[], n: number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** Roll one cover-scene family and return the injectable rule string.
 *  `forcedFamily` (a MEN_COVER_FAMILIES name — from a lane lock or an
 *  admin one-off) pins the whole post, cover AND items, to one family.
 *  Otherwise one family is rolled from the random pool. Either way the
 *  cover's subject + setting are rolled in code, and items get their own
 *  shuffled subjects, so variety doesn't depend on the model. */
export function rollMenCoverRule(forcedFamily?: string): string {
  const forced = forcedFamily
    ? MEN_COVER_FAMILIES.find((f) => f.name === forcedFamily)
    : undefined;
  const fam = forced ?? pick(MEN_COVER_FAMILIES.filter((f) => f.inRandomPool));
  const coverSubject = pick(fam.subjects);
  const coverSetting = pick(fam.settings);
  const itemSubjects = sample(fam.subjects.filter((x) => x !== coverSubject), 7);
  const itemRule = forced
    ? `FAMILY LOCK: EVERY item scene in this post must ALSO come from the ${fam.name} family — the whole post lives in one visual world. Each item uses a DIFFERENT subject, in order from this list: ${itemSubjects.join("; ")}. Pair each with a different setting of your own invention in the family's spirit (never repeat the cover's setting).`
    : `Item scenes follow the normal SCENES brief, and each item uses a DIFFERENT subject, in order from this list (drawn across the families): ${sample(
        MEN_COVER_FAMILIES.filter((f) => f.inRandomPool).flatMap((f) => f.subjects).filter((x) => x !== coverSubject),
        7
      ).join("; ")}. Pair each with a setting of your own invention in that subject's family spirit, never one reused within the post.`;
  return `COVER SCENE RULE (this post's family — it overrides the family list in SCENES above): "coverScene" MUST come from the ${fam.name} family — ${fam.brief} For THIS post the cover subject is ${coverSubject}, ${coverSetting} — build the cover scene around exactly that subject and setting, adding your own specific light, weather, vantage, and one telling detail so it could never be mistaken for another post. ${itemRule}\n\n${BWK_COVER_COMMAND_RULE}`;
}

// Ripple cover families (2026-09-18, per Keenan: "the pictures all
// come out too similar and it's almost always the same theme") — the
// women's answer to MEN_COVER_FAMILIES. Before this, every Ripple
// cover drew from one warm-interior pool (scheme pinned dark since
// 09-03), so posts converged on lamplight/tea/silk. Now every cover
// rolls one of five families; briefs are dark-scheme (dim, white text
// reads) since Ripple is pinned dark.
const WOMEN_COVER_FAMILIES: { name: string; brief: string }[] = [
  {
    name: "quiet home after dark",
    brief:
      "the warm-dim interior DNA — silk bedding in candlelight, a kitchen cleared after dinner under one warm lamp, a bath steaming in candlelight, an armchair and open book in a pool of lamplight, a child's old bedroom kept the same at dusk, a porch light left on over an empty step.",
  },
  {
    name: "night gardens & wild quiet",
    brief:
      "soft nature in evening light — a garden at blue hour with one lit window glowing behind, rain beading on roses at dusk, a greenhouse glowing warm in the dark, a bench under a tree in soft night rain, a lavender field at last light, fireflies over long grass, an orchard in blue evening mist.",
  },
  {
    name: "dusk water",
    brief:
      "still water at the end of the day — a lake at last light with mist rising, a wooden dock reaching into dark water at blue hour, a shoreline as the tide pulls back at dusk, willow branches over a dark pond, a rowboat tied at an empty jetty, rain circles on a lake under a warm grey sky.",
  },
  {
    name: "evening city from a soft distance",
    brief:
      "the city kept gentle and far — a rain-streaked café window glowing warm at night, a narrow European lane at dusk with shop windows lit, a balcony table with the city blurred to bokeh below, a train window at last light, warm-lit windows across a courtyard in the rain, a bookshop window on a dark street.",
  },
  {
    name: "warm still-life",
    brief:
      "one hero subject shot like a quiet-luxury ad — white peonies catching lamplight in a dark room, tea steaming beside a low candle, a strand of pearls on dark wood, cream stationery and a fountain pen in a pool of warm light, dried flowers by a dark window, an open book and reading glasses in lamplight.",
  },
];

/** Roll one Ripple cover-scene family — the women's mirror of
 *  rollMenCoverRule. The family constrains the DNA; the scene itself
 *  is invented fresh. All briefs are DIM (white text must read).
 *  Pass `forcedFamily` (a WOMEN_COVER_FAMILIES name) to pin the whole
 *  post to one family for themed one-offs. */
function rollWomenCoverRule(forcedFamily?: string): string {
  const forced = forcedFamily
    ? WOMEN_COVER_FAMILIES.find((f) => f.name === forcedFamily)
    : undefined;
  const fam =
    forced ??
    WOMEN_COVER_FAMILIES[
      Math.floor(Math.random() * WOMEN_COVER_FAMILIES.length)
    ];
  const itemRule = forced
    ? `FAMILY LOCK: EVERY item scene in this post must ALSO come from the ${fam.name} family — the whole post lives in one visual world, with each slide a DIFFERENT freshly-invented scene inside it.`
    : `Item scenes follow the normal SCENES brief with the same rule: every scene invented fresh, never copied from the examples.`;
  return `COVER SCENE RULE: "coverScene" MUST come from the ${fam.name} family — ${fam.brief} Soft, feminine, DIM, warm, intimate, NO people. The examples are SEEDS, not a menu: INVENT a brand-new scene inside this family that has never appeared before — choose a fresh subject, setting, season, weather, time, and vantage so no two covers are ever alike. ${itemRule}`;
}

/** Generate one moody-carousel topic for the given audience funnel.
 *  The men's lane is theme-locked to the SILENCE family (2026-09-03;
 *  "STAY INVISIBLE." / "GUARD THE QUIET." energy). Went dormant the
 *  morning of 2026-09-10 in the BWK reshuffle, then Keenan revived it
 *  the same day as a pick-list (3 covers + 15 items). 2026-09-14, per
 *  Keenan: pick-list retired — back to ONE cover + 4-7 items so posts
 *  go out ready-made for auto-publish. `sceneFamily` pins the whole
 *  post to one image family (themed one-offs). */
export async function generateMoodyTopic(
  audience: MoodyAudience,
  recentHeadlines: string[],
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const men = audience === "men";
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: `moody-carousel-topic-${audience}`,
    system: buildMoodySystemPrompt(
      audience,
      men
        ? {
            theme: SILENCE_THEME,
            coverRule: rollMenCoverRule(sceneFamily),
          }
        : { coverRule: rollWomenCoverRule(sceneFamily) }
    ),
    user: `Write one new post for the ${men ? "young aspiring men" : "women 40-50"} funnel with exactly ${itemCount} items.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: `moody-${audience}`,
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: itemCount,
  });
}

/** HOLD THE LINE lane (2026-09-03, per Keenan: "hold the line got a
 *  lot of views with the skyscraper start image"). Endurance family,
 *  "Name." items like moody-men. Covers rotate families since
 *  2026-09-08 (skyscraper is one family, not the default).
 *  DORMANT 2026-09-10 — replaced by generateWatchingTopic. */
export async function generateLineTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "line-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: LINE_THEME,
      // 2026-09-08: rotates families instead of always storm-skyscraper.
      coverRule: rollMenCoverRule(),
    }),
    user: `Write one new hold-the-line post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "line",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: 7,
  });
}

/** WHEN NO ONE'S WATCHING lane (2026-09-10, per Keenan — replaces
 *  HOLD THE LINE). Private-discipline tests; "Name." items.
 *  2026-09-14, per Keenan: pick-list retired — ONE cover + 4-7 items
 *  so posts go out ready-made for auto-publish. `sceneFamily` pins the
 *  whole post to one image family (themed one-offs). */
export async function generateWatchingTopic(
  recentHeadlines: string[],
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "watching-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: WATCHING_THEME,
      coverRule: rollMenCoverRule(sceneFamily),
    }),
    user: `Write one new when-no-one's-watching post with exactly ${itemCount} items.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "watching",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: itemCount,
    brand: "bwk",
  });
}

/** PAY THE PRICE lane — DORMANT (2026-09-10, per Keenan: "get rid of
 *  prove and price" — killed the same day it launched). Each slide
 *  named one real cost of the life he claims he wants; the final slide
 *  landed on "Still want it?". */
export async function generatePriceTopic(
  recentHeadlines: string[],
  sceneFamily?: string
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "price-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: PRICE_THEME,
      coverRule: rollMenCoverRule(sceneFamily),
    }),
    user: `Write one new pay-the-price post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "price",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: 7,
  });
}

/** PROVE IT lane — DORMANT (2026-09-10, per Keenan: "get rid of prove
 *  and price" — killed the same day it launched). Each slide took a
 *  claim men make and converted it into what today must look like. */
export async function generateProveTopic(
  recentHeadlines: string[],
  sceneFamily?: string
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "prove-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: PROVE_THEME,
      coverRule: rollMenCoverRule(sceneFamily),
    }),
    user: `Write one new prove-it post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "prove",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: 7,
  });
}

/** Image prompt for one moody slide — cinematic, text-free, no people.
 *  For women/Ripple, `womenScheme` picks light-airy (dark text) or the
 *  original warm-dim quiet luxury (white text) — 2026-09-01, per
 *  Keenan: "make half the ripple posts light like they currently are,
 *  and the other half dark like they used to be." */
// Camera choices rolled in code per image (2026-09-24 image-quality
// pass): the old "vary the focal length from image to image" line was
// meaningless — every image is a separate call that can't see the
// others, so the model defaulted to the same eye-level medium shot.
const VANTAGES = [
  "low vantage from near the ground, looking up",
  "elevated vantage looking down at an angle",
  "straight-on at eye level with strong one-point perspective",
  "from inside looking out through glass or an opening",
  "three-quarter angle from the side",
  "wide establishing shot from far back",
];
const LENSES = [
  "24mm wide lens, deep focus",
  "35mm lens, natural perspective",
  "50mm lens at f/2.8",
  "85mm lens at f/2, compressed background",
  "135mm telephoto, strong compression",
];
const LIGHT = [
  "hard side light raking across the subject",
  "backlight rimming the subject's edges",
  "low sun or last light from behind the camera",
  "soft overcast light with deep shadows",
  "a single practical light source in the dark",
  "blue-hour ambient light with warm accents",
];
const rollCamera = () => {
  const r = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  return `Camera for THIS image: ${r(VANTAGES)}, ${r(LENSES)}, ${r(LIGHT)}.`;
};

// Carve-out text is included ONLY when the scene names that kind of
// subject (2026-09-24): the old line described armor, poses, statues and
// animals in EVERY men's prompt — cars and buildings included — which is
// the same "standing allowance leaks into every image" failure the
// 2026-09-01 lone-man lesson warns about.
const WARRIOR_RE = /\b(knight|spartan|samurai|viking|warrior|legionar|crusader|highlander|gladiator|hoplite|cataphract|immortal|horse archer|armou?r(ed)?)\b/i;
const DRAGON_RE = /\bdragon/i;
const STATUE_RE = /\b(statue|sculpture|bust|marble figure|bronze figure)\b/i;
const ANIMAL_RE = /\b(wolf|wolves|lion|tiger|panther|leopard|jaguar|eagle|falcon|hawk|condor|bear|elk|stag|deer|moose|bison|buffalo|gorilla|shark|orca|whale|stallion|horse|bull|ram|owl|raven|fox|lynx|animal)\b/i;

export function menSubjectRules(scene: string): string {
  const rules: string[] = [
    "NO people — even if the scene implies a person, render the location EMPTY of humans.",
  ];
  if (STATUE_RE.test(scene)) {
    rules.push("The STATUE named in the scene is sculpture, not a person — render it as weathered stone, marble, or bronze.");
  }
  if (ANIMAL_RE.test(scene)) {
    rules.push("The ONE animal named in the scene is the hero: anatomically exact, real fur/feather/hide texture, natural behavior and natural light only — a frame a wildlife photographer could actually capture, never lightning or painted skies. No other animals.");
  } else {
    rules.push("NO animals.");
  }
  if (WARRIOR_RE.test(scene) && !DRAGON_RE.test(scene)) {
    rules.push("The ONE armored WARRIOR named in the scene is the exception to the no-people rule: always DISTANT in a wide epic shot, never a close-up; FULL hyperreal armor in silver, gold, or blackened steel; face never visible; in the landscape the scene describes, never standing directly on ice; caught in a POWERFUL ACTION pose that reads in silhouette. A prestige-film still, never a video-game look.");
  }
  if (DRAGON_RE.test(scene)) {
    rules.push("The DRAGON (and at most one armored rider or hero) named in the scene is the exception: a hyperreal prestige fantasy-film still, never a painting or game render — believable scale and weight, leathery wing membranes with veins and scars, heavy scales catching the scene's real light, breath fogging in cold air; any rider DISTANT, fully armored, face never visible.");
  }
  rules.push("Screens may glow softly but show NO readable content.");
  return rules.join(" ");
}

export function buildMoodyImagePrompt(
  audience: MoodyAudience | "universal",
  scene: string,
  womenScheme: WomenScheme = "light"
): string {
  // 2026-09-24 image-quality pass: legibility now comes from the adaptive
  // scrim in compose.ts, so the men's grade no longer has to be flat
  // near-monochrome — the scene's own accent color (sunset, gold armor,
  // car paint, ember) is allowed to glow.
  const style =
    audience === "men"
      ? "Dark, dominant, moody photography with a muted cinematic grade — deep blacks, charcoal and slate, cold glass and storm light — where the scene's own accent color (a sunset, burnished gold, a car's paint, an ember) is allowed to glow richly. Austere, powerful, commanding."
      : audience === "universal"
        ? "Dark, moody, cinematic photography. Muted, desaturated color grade with deep shadow — dusk, night, or heavy overcast light. Vast, still, contemplative — the weight of time made visible."
        : womenScheme === "light"
          ? "Soft, aesthetically pleasing feminine photography — quiet luxury in light, airy tones: cream silk, linen, morning sun, white flowers. Warm, dreamy, light color grade — ivory, blush, soft gold. Beautiful, calm, intimate, bright but gentle."
          : "Soft, aesthetically pleasing feminine photography — quiet luxury in warm low light: silk in candlelight, warm lamplight, dried flowers, rain on dark windows. Muted, warm, dreamy color grade with soft shadow. Beautiful, calm, intimate, dim but never cold.";
  // The scheme lines below double as recomposeSlide's text-tone
  // markers ("SOFT and LIGHT" → dark text, "DIM and shadowed" →
  // white) — change the phrases in both places or not at all.
  return [
    // Hyperrealism mandate (2026-09-03, per Keenan: "the images also
    // need to be hyperrealistic for all posts... they should look like
    // someone took a photo across all platforms").
    `A REAL photograph a person actually took with a camera: ${scene}`,
    style,
    audience === "women" && womenScheme === "light"
      ? "The entire frame is SOFT and LIGHT — a bright, even, airy exposure so dark charcoal text placed at the center of the image would be perfectly legible. No harsh highlights or busy detail in the middle of the frame."
      : "Overall DIM and shadowed in mood — low-key with deep blacks — but with full contrast and real, crisp highlights, never flat or murky grey. Keep the CENTER band of the frame calm and darker: no bright sky, glare, or busy detail right behind where centered white text will sit.",
    // Clarity mandate (2026-09-03, per Keenan: "all high quality, clear
    // images that are hyper realistic").
    "Shot on a full-frame camera, editorial magazine quality, true-to-life materials and light. TACK-SHARP and high-resolution, perfectly focused on the subject. Physically believable optics: honest exposure, natural depth of field, a faint touch of grain. It must be INDISTINGUISHABLE from an unretouched real photograph — no CGI, render, or illustration look, no plastic surfaces, no impossible glow.",
    // Fine-detail mandate (2026-09-04, per Keenan's blurred-leaves
    // example: "look how blurred the leaves are... better attention to
    // detail").
    "ATTENTION TO DETAIL: every element is fully resolved with fine, true texture — leaves, fabric weave, wood and stone grain, distant buildings all crisply defined. No mushy, smeared, or painterly areas anywhere, including the background and edges; any softness is genuine optical depth of field.",
    // Aspect (2026-09-24): images are generated 2:3, output 9:16, and
    // IG/FB feeds center-crop to 4:5 — keep what matters in the middle.
    "Vertical frame. Keep the subject and every important detail inside the central 4:5 area — the edges get cropped — with a calm, uncluttered middle band.",
    rollCamera(),
    audience === "men"
      ? menSubjectRules(scene)
      : "NO people, NO animals, NO screens with content.",
    "Absolutely NO text, letters, words, numbers, logos, or watermarks anywhere in the image.",
  ].join("\n");
}

// ─── BWK avatar persona (2026-08-30, per Keenan) ─────────────────────
// Keenan supplied a reference photo of himself: "use me as an avatar
// for pictures that need one... try to hide my face where possible...
// make it feel luxury." HISTORY: using scene-text detection as the
// frequency gate put him in ~every post → retired 2026-08-31, then
// REVIVED same day at a hard cap ("you can include it in 5-10% of
// generated posts, max"). Then 2026-09-01: even with the reference
// gated to ≤8%, the base prompt's "at most ONE person: a lone man"
// allowance made gpt-image-2 paint a GENERIC man into ~every image.
// So now: BWK scenes are people-free by definition, the frequency
// gate is a per-POST random roll in carousel-daily.ts (≤8%), and a
// winning post puts the avatar on the COVER via MOODY_AVATAR_PROMPT's
// exception block. Never gate frequency on scene text again.

/**
 * Appended to buildMoodyImagePrompt output when generating WITH the
 * avatar reference. The phrase "reference photo" doubles as the marker
 * recomposeSlide uses to know a stored imagePrompt needs the reference.
 *
 * Since 2026-09-01 the base prompt renders every BWK location EMPTY,
 * so this block must first RE-INTRODUCE the lone man (the exception),
 * then bind his identity to the reference.
 */
export const MOODY_AVATAR_PROMPT = [
  "EXCEPTION to the no-people rule: this image features exactly ONE lone man, luxury-styled to match the scene (dark tailored knits or an overcoat with an expensive watch, a dark suit with open collar, training gear mid-training, a plain dark tee at a laptop, or black technical expedition gear). His face is hidden — from behind, in silhouette, in deep shadow, or behind dark sunglasses.",
  "IDENTITY: that lone man IS the man in the attached reference photo — the same person: same build, same hair, same skin tone.",
  "Transfer his IDENTITY ONLY. Completely IGNORE the reference photo's setting, mirror, bathroom, clothing, pose, and lighting — build the scene described above from scratch and restyle him in the luxury wardrobe the scene calls for.",
  "Photorealistic, luxury editorial quality.",
].join("\n");

// ─── Ripple lane avatars (2026-09-17, per Keenan) ─────────────────────
// Three FICTIONAL recurring women — one per lane — so each lane's
// covers feature the same character post after post ("avatars look
// good and dialed in"). Unlike the BWK avatar (Keenan himself, capped
// at ≤8% of posts), these are lane characters: EVERY cover for these
// lanes is avatar-led. References were generated face-NOT-visible by
// scripts/generate-avatar-refs.ts and live at
// content-factory/reference/ripple-avatar-<lane>.png.

export const RIPPLE_AVATAR_LANES = [
  "texts-younger",
  "questions",
  "memento",
] as const;
export type RippleAvatarLane = (typeof RIPPLE_AVATAR_LANES)[number];

export function rippleAvatarReferencePath(lane: RippleAvatarLane): string {
  return `reference/ripple-avatar-${lane}.png`;
}

// Identity text mirrors the reference-generation prompts in
// scripts/generate-avatar-refs.ts — keep the two in sync if a
// reference is ever regenerated.
const RIPPLE_AVATAR_IDENTITIES: Record<RippleAvatarLane, string> = {
  "texts-younger":
    "early 40s, long espresso-brown wavy hair falling past her shoulders, average realistic build; her style is cozy feminine everyday — an oversized knit cardigan over a soft tee, relaxed jeans, or similar",
  questions:
    "late 40s, shoulder-length blonde hair (a soft lob, one side tucked behind her ear), tall with an average build; her style is clean and minimal — a light linen shirt, straight-leg trousers, simple sneakers, or similar",
  memento:
    "mid 40s, loose curly copper-auburn hair, average curvy build; her style is warm and earthy — a chunky oatmeal knit sweater, a soft scarf, ankle boots, or similar",
};

/**
 * Appended to buildMoodyImagePrompt output when generating a Ripple
 * avatar-led cover. Like MOODY_AVATAR_PROMPT, the literal phrase
 * "reference photo" doubles as the marker recomposeSlide uses to
 * re-attach the reference on edits, and the block opens with
 * "EXCEPTION to the no-people rule" so recomposeSlide's
 * reference-missing fallback can cut it cleanly.
 */
export function buildRippleAvatarPrompt(lane: RippleAvatarLane): string {
  return [
    `EXCEPTION to the no-people rule: this image features exactly ONE woman — ${RIPPLE_AVATAR_IDENTITIES[lane]}. Dress her in that style, adapted naturally to the scene and weather.`,
    "IDENTITY: that woman IS the woman in the attached reference photo — the same person: same hair, same build, same skin tone, same presence.",
    "HER FACE IS NOT VISIBLE: photograph her from behind or from the side-back — no eyes, nose, or mouth visible. Her identity reads through her hair, build, posture, and clothes.",
    "Transfer her IDENTITY ONLY. Completely IGNORE the reference photo's setting, pose, lighting, and framing — build the scene described above from scratch and place her in it naturally.",
    "She belongs in the scene as a real person caught in a candid moment — natural, unposed, never modeling for the camera.",
  ].join("\n");
}

// ─── Captions: pure discovery hashtags, cloned from the reference ─────
// (2026-08-28, per Keenan — no question on these two funnels.)
const MEN_CORE_TAGS = ["#fyp", "#motivation", "#mindset", "#mentality"];
const MEN_ROTATING_TAGS = [
  "#discipline",
  "#selfimprovement",
  "#trusttheprocess",
  "#growth",
  "#success",
  "#focus",
];
const WOMEN_CORE_TAGS = ["#fyp", "#selfcare", "#mentalhealth", "#mindfulness"];
const WOMEN_ROTATING_TAGS = [
  "#innerpeace",
  "#protectyourpeace",
  "#healing",
  "#selflove",
  "#boundaries",
  "#peacefullife",
];

/** Hashtag-only caption: 4 core tags + 2 rotating (slug-deterministic). */
export function buildMoodyCaption(audience: MoodyAudience, slug: string): string {
  const core = audience === "men" ? MEN_CORE_TAGS : WOMEN_CORE_TAGS;
  const rotating = audience === "men" ? MEN_ROTATING_TAGS : WOMEN_ROTATING_TAGS;
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    rotating[h % rotating.length],
    rotating[(h + 3) % rotating.length],
  ];
  return [...core, ...new Set(extra)].join(" ");
}

// ─── MEMENTO MORI carousel (2026-08-28 PM, per Keenan) ────────────────
// Split into TWO audience lanes (2026-08-28 late night, per Keenan):
// "memento" targets women 40-50 (Ripple), "memento-men" targets young
// men (BWK). Same skeleton: cover + slides of sobering time-math
// ("You'll see your parents about 15 more times."), each landing on a
// short command. 2026-09-25: now headed like every lane — the header
// names what is counted, the number is the italic hook.
// 2026-09-01: "memento" (women) REVIVED into Ripple ("add the 'do the
// math' / less time than you think back to ripple... add memento mori
// posts back"). 2026-09-03: pinned to the DARK scheme with dusk-coast
// covers — per Keenan, the winning post was "the 'do the math' piture
// of the beach. this one did well on instagram/facebook reals with
// multiple shares and likes. so give me more of that."

const MEMENTO_WOMEN_SCENES: Record<WomenScheme, string> = {
  light: `SCENES: soft, aesthetically pleasing feminine photography in LIGHT, airy schemes — an empty porch swing in pale morning sun, a cream kitchen table cleared after breakfast by a bright window, dried flowers on a white sill in soft daylight, a child's empty bedroom with sheer curtains glowing, linen bedding in diffused morning light, a silk robe over a chair by a sunlit window, a garden bench under soft overcast light, a pale staircase with light falling across it, an emptied dining table with one chair pulled out in late-afternoon glow, blank cream stationery and a fountain pen on a sunlit desk, a hallway of small shoes by the door in morning light, a kitchen still and bright after everyone has left. Bright cream, ivory, warm white — every frame LIGHT (dark charcoal text must read on it), the quiet ache carried by emptiness and light, not darkness. No people ever. These are inspiration, not a menu — invent new quiet-daylight locations in the same DNA so no two posts look alike.`,
  dark: `SCENES: soft, aesthetically pleasing feminine photography, contemplative in low warm light — an empty porch swing at dusk, a kitchen table cleared after dinner lit by one lamp, dried flowers by a dark window, a child's empty bedroom in soft evening light, a candlelit bath still steaming, a silk robe over a chair by rain-streaked glass, a dark garden seen through a lit kitchen window, a single lamp on in a house at blue hour, an emptied dining table with one chair pulled out, blank cream stationery and a fountain pen in warm lamplight, a porch light left on over an empty step, the kitchen after everyone is asleep lit by one small light — AND quiet evening world beyond the house (2026-09-18 variety pass): a garden bench under a tree at blue hour, a lake with mist rising at last light, an empty playground swing at dusk, a rain-streaked café window glowing at night, a train window at last light, a country road going dark between fields. Muted, warm, beautiful — every frame DIM (white text must read on it). No people ever. These are inspiration, not a menu — invent new quiet-evening locations in the same DNA, and vary the item slides between house and world so no two posts look alike.`,
};

// Winning-cover family for the dark scheme (the "DO THE MATH" beach).
const MEMENTO_COVER_RULE = `COVER SCENE RULE: "coverScene" MUST come from the dusk-coast family — an empty shoreline at last light: a beach as the tide pulls back from dark wet sand, a thin line of amber on a grey horizon, a lake shore at dusk, dunes at blue hour, a wide bay going dark, a pier reaching into evening mist. Vary the water, the light, and the vantage every post so no two covers repeat, but every cover is unmistakably an empty shore at the end of the day. Item scenes follow the normal SCENES brief with full variety.`;

const buildMementoWomenSystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: MEMENTO MORI LIFE-MATH — numbers at the scale of a WHOLE LIFE, each slide ending on a short command to act on it.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The numbers must hit HER clock at full scale: weekends left in an average lifetime, times she'll see her parents before they're gone, Christmases left with everyone at the table, healthy years remaining, summers while the kids still come home.

${MEMENTO_WOMEN_SCENES[scheme]}${scheme === "dark" ? `\n\n${MEMENTO_COVER_RULE}` : ""}

FORMAT — every slide is a tight three-part build rendered as: bold HEADER, one italic HOOK line, short BODY. Match this shape exactly:
name: "Weekends Left"
lines[0] (hook): "At 45, you have about 1,700 weekends left. On average."
lines[1] (body): "That's the whole number, not this year's. Stop giving them away."

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past. 2-4 words, works in ALL CAPS, a direct command that pulls her into the slides (the shape: an imperative about counting, time, or looking honestly at the numbers, in new words each post; "DO THE MATH" is spent, never reuse it or any recent title). Never a passive label. No number in the title. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must fit what the slides deliver. Do NOT stitch together or remix spent titles; if a title reads odd, garbled, or random without the slides, it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item:
  - "name": the HEADER — what is being counted, in Title Case, 2-4 words, NO trailing period ("Weekends Left", "Visits With Mom", "Summers at Home").
  - "lines": EXACTLY 2 entries.
    - lines[0]: the HOOK — ONE life-scale number, anchored to her age, measured against an average lifespan or an ending that is coming ("At 45, you have about 1,700 weekends left. On average.", "You'll see your parents about 15 more times before they're gone."). It renders in italics under the header. GO BIG: the number must reframe her whole remaining life, not just this year. Plausible arithmetic from average life expectancy only — never invented statistics, never fake precision, hedge with "about", "~", or "on average".
    - lines[1]: the BODY — the one-sentence truth behind the number (optional), ending on a 2-5 word command ("Call them tonight.", "Stop giving them away.").
- HARD LIMIT: each slide's hook + body totals UNDER 30 words.
- Vary the subject across the slides: weekends left, aging parents, summers or holidays with the kids, healthy years, old friendships, hours lost to the phone. Never two slides on the same subject.
- Every sentence short. No metaphors that need decoding. It should feel like cold arithmetic, not poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI. Naming death in the slides is allowed ("before they're gone", "until you die") — but never on the cover.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather) per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["hook", "body"], "scene": "..." }
  ]
}`;

const MEMENTO_MEN_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography. The niche: MEMENTO MORI LIFE-MATH — numbers at the scale of a WHOLE LIFE, each slide ending on a short command to act on it.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. The numbers must hit HIS clock at full scale: weekends left until he dies on average, times he'll see his parents before they're gone, peak physical years in a whole lifetime, healthy decades remaining, the total window to build something. The math should read like a bill coming due — for his entire life, not this week.
VOICE: calm command energy. Short declarative sentences. Direct second person. A mentor stating arithmetic, not a poet. Never bro-slang, never yelling.

SCENES: dark, dramatic, luxurious photography in FOUR families (nothing outside them): dark-luxury architecture (luxury buildings with a DRAMATIC SKY — heavy cloud cover, cool cinematic lighting, or a burning sunset behind every building: a penthouse tower crowned in storm cloud, a cliff mansion above a storm sea at dusk, a skyscraper against a blood-orange sunset — shot low and dramatic, never a flat skyline or plain empty sky), alpha wildlife (ONE alpha animal commanding an epic landscape — a wolf on a cracked frozen lake, a lion crossing black dunes at dusk, a stag in blowing snow; the whole animal kingdom, never a recent post's animal; HYPER-REAL weather only — natural light a wildlife photographer could capture, NEVER lightning bolts or painted-on skies), dark-luxury objects (a classic Ferrari under one cold spotlight, rain beading on an old-school Mercedes gullwing, a vintage Porsche on a wet mountain road at dusk, a Swiss watch on black marble, a private jet on wet tarmac at night — one hero object, shot like a high-end ad; cars rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce — modern Lamborghini-style supercars only rarely; unmistakably LUXURY, NEVER notebooks, pens, books, desks, or any office/stationery still-life), and epic warriors (a lone knight / spartan / samurai / viking in FULL armor, seen from a DISTANCE in an epic landscape THAT MATCHES WHO HE IS — a viking on a windswept grey beach with longships behind, a samurai on a misty bamboo path in rain, a knight leading his horse up a snowy mountain trail, a spartan on sun-bleached coastal rocks; each warrior type gets ITS OWN world, never one generic snowfield, NEVER standing directly on ice or a frozen lake; DOING something powerful — striding into the weather, arms flexed in triumph, sword driven into the earth — a pose that reads in silhouette and radiates strength and drive; hyper-real like a prestige-film still, wide cinematic framing, never close to the camera, face never visible). Desaturated, near-monochrome. Every frame DIM (white text must read on it). ANTI-BLAND RULE: every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape or bare horizon. NO people EVER except the distant-warrior carve-out (face never visible) and the lone animal, each only in its own family's scenes. These are SEEDS, not a menu — invent a brand-new scene for every slide within these families so no two posts look alike.

FORMAT — every slide is a tight three-part build rendered as: bold HEADER, one italic HOOK line, short BODY. Match this shape exactly:
name: "Weekends Left"
lines[0] (hook): "At 30, you have about 2,500 weekends left. On average."
lines[1] (body): "That number only goes down. Stop wasting them."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS, a direct COMMAND to him about time running out (the shape: a strong verb telling him what to do with the time he has left, in new words each post; "DO THE MATH" is spent, never reuse it or any recent title). No number in the title.
- The request tells you EXACTLY how many items to write. Each item:
  - "name": the HEADER — what is being counted, in Title Case, 2-4 words, NO trailing period ("Weekends Left", "Peak Years", "The Build Window").
  - "lines": EXACTLY 2 entries.
    - lines[0]: the HOOK — ONE life-scale number, anchored to his age, measured against an average lifespan or an ending that is coming ("At 30, you have about 2,500 weekends left. On average.", "You'll see your parents about 20 more times before they're gone."). It renders in italics under the header. GO BIG: the number must reframe his whole remaining life, not just this month. Plausible arithmetic from average life expectancy only — never invented statistics, never fake precision, hedge with "about", "~", or "on average".
    - lines[1]: the BODY — the one-sentence truth behind the number (optional), ending on a 2-5 word command ("Stop wasting them.", "Start tonight.").
- HARD LIMIT: each slide's hook + body totals UNDER 30 words.
- Vary the subject across the slides: weekends left until the end, parents, peak physical years, healthy decades, hours lost to the scroll, the window to build something. Never two slides on the same subject.
- Every sentence short. No metaphors that need decoding. It should feel like cold arithmetic, not poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI. Naming death in the slides is allowed ("until you die", "before they're gone") — but never on the cover.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather) per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["hook", "body"], "scene": "..." }
  ]
}`;

/** Generate one memento mori topic for the given audience lane.
 *  Women: slide count varies per post (2026-08-29) — 3-9 items.
 *  Men (BWK): 2026-09-14, per Keenan — pick-list retired, back to ONE
 *  cover + 4-7 items so posts go out ready-made for auto-publish.
 *  `scheme` applies to women only. */
export async function generateMementoTopic(
  audience: MoodyAudience,
  recentHeadlines: string[],
  scheme: WomenScheme = "light",
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const men = audience === "men";
  const itemCount = men
    ? 4 + Math.floor(Math.random() * 4) // men 4-7
    : 3 + Math.floor(Math.random() * 7); // women 3-9
  return generateMoodyFamilyTopic({
    purpose: men ? "memento-men-carousel-topic" : "memento-carousel-topic",
    system: men
      ? `${MEMENTO_MEN_SYSTEM_PROMPT}\n\n${rollMenCoverRule(sceneFamily)}`
      : buildMementoWomenSystemPrompt(scheme),
    user: `Write one new memento mori life-math post with exactly ${itemCount} items.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: men ? "memento-men" : "memento",
    requireName: true,
    minLines: 2,
    minItems: men ? 4 : 3,
    maxItems: itemCount,
    brand: men ? "bwk" : "ripple",
  });
}

const MEMENTO_CORE_TAGS = ["#fyp", "#mindset", "#deepthoughts", "#perspective"];
const MEMENTO_ROTATING_TAGS = [
  "#mementomori",
  "#lifeisshort",
  "#timeflies",
  "#presence",
  "#intentionalliving",
  "#wakeupcall",
];

/** Hashtag-only caption for the memento lane (universal pool). */
export function buildMementoCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    MEMENTO_ROTATING_TAGS[h % MEMENTO_ROTATING_TAGS.length],
    MEMENTO_ROTATING_TAGS[(h + 3) % MEMENTO_ROTATING_TAGS.length],
  ];
  return [...MEMENTO_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── HARD QUESTIONS carousel (2026-08-28 PM, per Keenan) ──────────────
// Women's funnel: cover ("ANSWER HONESTLY" energy) + 5 slides, ONE
// question each, no answers anywhere. The reader supplies the answer —
// that's the save/share mechanic. Women's soft-dim visuals, hashtag-only
// caption from the women's pool.

const buildQuestionsSystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: HARD QUESTIONS — each slide is ONE question the reader can't answer comfortably. No answers, no advice, anywhere. The question does all the work.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The questions should press gently on what they already know but avoid saying out loud: lost pieces of themselves, one-sided giving, deferred wants, who they're becoming.
VOICE: quiet, direct, unsparing but never cruel. Second person. A question a wise friend would ask and then just wait.

${WOMEN_SCENE_BRIEFS[scheme]}

${rollWomenCoverRule()}

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past: a direct PROMPT to the reader that sets up the slides and makes swiping irresistible. 2-4 words, commanding, addressed to her, works in ALL CAPS (the shape: an instruction for HOW to face the questions, often ending "...", in new words each post; "READ THESE SLOWLY", "YOU ALREADY KNOW" and "WHOSE LIFE IS THIS" are spent, never reuse them or any recent title). Not itself a question. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must clearly set up questions to answer. Do NOT stitch together or remix spent titles; "DON'T LIE NOW" is the kind of garbled title that gets a post killed — if a title reads odd or random without the slides, it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each slide renders as: bold HEADER, one italic HOOK line, short BODY. Each item:
  - "name": the HEADER — the nerve the question presses on, named in Title Case, 2-4 words, NO trailing period ("The Waiting Body", "Unsaid Things", "Who Notices").
  - "lines": EXACTLY 2 entries.
    - lines[0]: the HOOK — the question itself. 8-20 words, ends with "?". Plain words, no metaphors that need decoding, no "why don't you" advice-in-disguise. It renders in italics.
    - lines[1]: the BODY — ONE short line (4-12 words) that presses the question closer without answering it or advising ("Not the answer you'd give them. Yours.", "Count the days, not the reasons."). Never a command to fix anything.
- Each question hits a DIFFERENT nerve: identity, resentment, time, what she's postponing, what she'd never admit. Never two questions on the same nerve.
- The questions must be answerable only by the reader — never rhetorical, never yes-obvious.
- US English. No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...?", "..."], "scene": "..." }
  ]
}`;

/** Generate one hard-questions topic (women's funnel). 4-6 questions
 *  per post (2026-08-31 variance). */
export async function generateQuestionsTopic(
  recentHeadlines: string[],
  scheme: WomenScheme = "light",
  feedback?: string | null
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "questions-carousel-topic",
    system: buildQuestionsSystemPrompt(scheme),
    user: `Write one new hard-questions post with exactly ${itemCount} questions.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "questions",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: 6,
    brand: "ripple",
  });
}

// ─── RULES I BROKE carousel (2026-08-28 late PM, per Keenan) ──────────
// Replaces the negative "video" lane (6 UTC). Women's funnel: an
// inversion of the discipline format — instead of five commands, five
// QUIET REBELLIONS ("1. I stopped answering right away.") each with a
// short justification. Same numbered moody skeleton, first person.

const RULES_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: RULES I BROKE — five polite, invisible rules the writer quietly stopped following to get her life back. Not advice. A first-person record of small rebellions.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. Each broken rule should be one they still obey, and reading it should feel like permission.
VOICE: first person, quiet, settled, unapologetic. A woman who has stopped explaining herself, telling you what she quit doing — not telling you what to do. Never preachy, never girlboss, never bitter.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"1. I stopped answering right away.

A text is not a summons. It waited hours to matter to them.

It can wait an hour for me."

RULES:
- "title": the cover text. 3-7 words, first person, works in ALL CAPS ("RULES I BROKE TO GET MY LIFE BACK", "POLITE RULES I QUIT"). No number.
- Exactly 5 items. Each item:
  - "name": the broken rule as a short first-person past-tense line + period ("I stopped answering right away.", "I let the house be imperfect."). 4-8 words.
  - "lines": 1-2 short paragraphs. First: the quiet reasoning in one or two plain sentences. Optional last line: a short settled closer (2-6 words) — a statement, never a command to the reader.
- Every rebellion is SMALL and concrete — answering instantly, over-explaining, hosting every holiday, being the default parent contact, apologizing for resting. Never dramatic (no quitting jobs, leaving marriages).
- Each of the 5 breaks a DIFFERENT kind of rule: availability, explanation, appearance, obligation, self-denial. Never two on the same kind.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one rules-I-broke topic (women's funnel, replaces negative). */
export async function generateRulesTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "rules-carousel-topic",
    system: RULES_SYSTEM_PROMPT,
    user: `Write one new rules-I-broke post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "rules",
    requireName: true,
    minLines: 1,
  });
}

// ─── MISSED CONNECTIONS carousel (2026-08-28 late PM, per Keenan) ─────
// Near-miss math about the people you almost knew — cousin of memento
// mori, but the finite thing is CONNECTION, not time. Two lanes
// (2026-08-28 late night): "missed" = universal (Ripple), "missed-men"
// = the cost-of-the-grind variant for young men (BWK).

const MISSED_SYSTEM_PROMPTS: Record<"universal" | "men", string> = {
  universal: `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: MISSED-CONNECTION MATH — quiet, concrete numbers about the people we walk past, lose touch with, or never quite meet. Each slide is a small ghost story told in plausible arithmetic.

AUDIENCE: everyone scrolling at midnight. The numbers must hit universally — strangers passed, friends drifted, conversations not started, calls not made. No gendered content.

SCENES: soft, aesthetically pleasing feminine photography of quiet in-between moments, empty of people — a rain-streaked café window at dusk, an empty park bench under warm lamplight, a train window at last light, sheer curtains stirring by a phone left face-down, two tea cups on a candlelit table with one untouched, a letter unopened on a nightstand. Muted, warm, beautiful — every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"You'll walk past about 80,000 strangers in your life.

One of them would have been your best friend.

You were looking at your phone."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("THE PEOPLE YOU MISSED", "ALMOST FRIENDS"). No number in the title.
- Exactly 5 items. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete, plausible number about near-missed connection ("You'll walk past about 80,000 strangers.", "The average friendship that fades takes about 2 years to go quiet."). Plausible arithmetic only — never invented precision, hedge with "about" or "~".
  - Middle line: the quiet human truth inside the number.
  - Last line: a short landing — a statement or gentle command (2-6 words: "Look up.", "Text them first.", "You were almost friends.").
- Vary the subject across the 5 slides: strangers passed, friendships gone quiet, family you rarely see, conversations never started, the people one choice removed. Never two slides on the same subject.
- Every sentence short. It should feel like cold arithmetic with an ache inside — never sentimental, never poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`,
  men: `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: MISSED-CONNECTION MATH — quiet, concrete numbers about the people a man loses while he's grinding: friends gone quiet, mentors never asked, calls home not made. Each slide is a small ghost story told in plausible arithmetic.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. They talk about the grind and lone-wolf focus — this format is the cost column they don't audit: the group chat that died, the mentor they never messaged, the calls to dad they keep postponing, the friends success quietly filtered out.
VOICE: calm, flat, unsparing. Short declarative sentences. Direct second person. The sting is arithmetic, not sentiment. Never bro-slang, never mushy.

SCENES: dark minimalist photography of in-between places, empty of people — an empty train platform under sodium light, a gym lobby after close, a rain-streaked car window at night, an airport gate after the last flight, a dorm hallway at 2am, a diner counter at closing. Desaturated, near-monochrome. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"Your group chat used to get 100 messages a day.

Now it gets about 3 a month.

Nobody decided that. It just happened."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("THE PEOPLE YOU LOST", "THE COST OF THE GRIND"). No number in the title.
- Exactly 5 items. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete, plausible number about connection lost or never made ("You'll call your dad about 40 more times.", "It takes about 2 years for a friendship to go quiet."). Plausible arithmetic only — never invented precision, hedge with "about" or "~".
  - Middle line: the flat truth inside the number.
  - Last line: a short landing — a command or flat statement (2-6 words: "Text them first.", "Send the message.", "Nobody decided that.").
- Vary the subject across the 5 slides: old friends gone quiet, the mentor never asked, calls home, the people the grind filtered out, the conversation never started. Never two slides on the same subject.
- Every sentence short. It should feel like cold arithmetic with an ache inside — never sentimental, never poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`,
};

/** Generate one missed-connections topic for the given audience lane. */
export async function generateMissedTopic(
  audience: "universal" | "men",
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: audience === "men" ? "missed-men-carousel-topic" : "missed-carousel-topic",
    system: MISSED_SYSTEM_PROMPTS[audience],
    user: `Write one new missed-connection math post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: audience === "men" ? "missed-men" : "missed",
    requireName: false,
    minLines: 2,
  });
}

const MISSED_CORE_TAGS = ["#fyp", "#deepthoughts", "#perspective", "#mindset"];
const MISSED_ROTATING_TAGS = [
  "#sonder",
  "#connection",
  "#strangers",
  "#lifelessons",
  "#presence",
  "#almost",
];

/** Hashtag-only caption for the missed-connections lane (universal pool). */
export function buildMissedCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    MISSED_ROTATING_TAGS[h % MISSED_ROTATING_TAGS.length],
    MISSED_ROTATING_TAGS[(h + 3) % MISSED_ROTATING_TAGS.length],
  ];
  return [...MISSED_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── DELETE THIS AFTER READING carousel (2026-08-28 late PM) ──────────
// Women's funnel: a cover styled like a warning ("DELETE THIS AFTER
// READING") + slides, each ONE truth you're not supposed to say out
// loud. 2026-09-01: REVIVED into Ripple ("add the delete after reading
// posts back to ripple") — the old QUOTE serif italic is dead, slides
// render as ITEM, with randomized 4-6 slide counts per the variance
// pass; scheme rolls 50/50 light/dark like all Ripple lanes.

const buildForbiddenSystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: FORBIDDEN TRUTHS — each slide is ONE line you're not supposed to say out loud. The post is framed like a note the reader shouldn't have seen. No advice, no answers, anywhere.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. Each line should name something she has thought and never said: the unspoken ledger of marriage, motherhood, friendship, aging, wanting more.
VOICE: quiet, flat, devastatingly honest. Plain statements. Never cruel, never cynical for its own sake — the sting is recognition, not shock.

${WOMEN_SCENE_BRIEFS[scheme]}

FORMAT — each slide is ONE line like:
"You don't miss him. You miss being chosen."
"Some of the love you give is just fear with better manners."

RULES:
- "title": the cover text. 3-6 words with warning-label energy, works in ALL CAPS ("DELETE THIS AFTER READING", "DON'T SCREENSHOT THIS", "YOU DIDN'T SEE THIS"). Not a question.
- The request tells you EXACTLY how many items to write. Each item's "lines": exactly ONE line — the truth. 8-18 words, a plain declarative statement (may be two short sentences). No question marks.
- Each line hits a DIFFERENT nerve: love, motherhood or family, friendship, self, time. Never two lines on the same nerve.
- Short declarative words. No metaphors that need decoding, no clichés, no advice-verbs. Read each line out loud — it should feel like something overheard, not written.
- US English. No emojis, no hashtags, no quotes around the lines. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["..."], "scene": "..." }
  ]
}`;

/** Generate one forbidden-truths topic (women's funnel, Ripple). */
export async function generateForbiddenTopic(
  recentHeadlines: string[],
  scheme: WomenScheme = "light"
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "forbidden-carousel-topic",
    system: buildForbiddenSystemPrompt(scheme),
    user: `Write one new forbidden-truths post with exactly ${itemCount} truths.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "forbidden",
    requireName: false,
    minLines: 1,
    minItems: 4,
    maxItems: 6,
  });
}

// ─── LATE BLOOMERS carousel (2026-08-28 night, per Keenan) ────────────
// Universal lane: real, verifiable people who started late — one person
// per slide, numbered like the discipline lanes ("1. Vera Wang."). The
// daily fn passes recently-used NAMES in the avoid list so the same
// person never repeats within 30 days.

const BLOOMERS_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: LATE BLOOMERS — real, famous people who started late and still made it. Proof, not pep talk.

AUDIENCE: everyone scrolling at midnight who quietly believes their window has closed. Every slide should read as evidence that it hasn't.

SCENES: dark cinematic photography, vast and contemplative — an empty stage in low light, a desk lamp over an open notebook at night, a long road at dawn, a workshop in half-light, a city window lit late. Every frame DIM (white text must read on it). No people ever.

FORMAT — each slide reads like this (match the rhythm):
"1. Vera Wang.

Figure skater, then journalist. Didn't design her first dress until 40.

The empire came after."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("THEY ALL STARTED LATE", "YOUR WINDOW ISN'T CLOSED"). No number in the title.
- Exactly 5 items. Each item:
  - "name": the person's real full name + period ("Vera Wang.").
  - "lines": 1-2 short paragraphs. First: what they were doing before and the REAL age they started or broke through — only widely documented facts about famous people (Vera Wang, Julia Child, Samuel L. Jackson, Toni Morrison, Ray Kroc caliber). If you are not certain of the age, pick someone you are certain about. Last line: a short settled statement (2-6 words), never a command.
- Vary the fields across the 5 slides: business, writing, film or music, food, art or science. Never two people from the same field.
- NEVER invent people, ages, or facts. Real names, real documented timelines only.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one late-bloomers topic (universal). Pass recent NAMES too. */
export async function generateBloomersTopic(
  recentHeadlinesAndNames: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "bloomers-carousel-topic",
    system: BLOOMERS_SYSTEM_PROMPT,
    user: `Write one new late-bloomers post.${avoidBlock(recentHeadlinesAndNames)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "bloomers",
    requireName: true,
    minLines: 1,
  });
}

// ─── WHAT ___ TAUGHT ME carousel (2026-08-28 night, per Keenan) ───────
// Women's funnel: the teacher rotates daily (grief, silence, burnout,
// an empty house...) so the title itself is the dedupe key. Five
// first-person lessons, no headers.

const TAUGHT_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: WHAT ___ TAUGHT ME — one hard teacher per post (grief, silence, burnout, an empty house, being the strong one, waiting rooms), five quiet first-person lessons it left behind.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The lessons should feel earned, not quoted — like a woman telling the truth about what a hard season actually gave her.
VOICE: first person, quiet, settled. Plain sentences with warmth underneath. Never preachy, never inspirational-poster, never bitter.

${SCENE_BRIEF["women"]}

FORMAT — each slide reads like this (match the rhythm):
"Nobody is coming to grade how well I held it together.

So I stopped performing it."

RULES:
- "title": the cover text — "WHAT ___ TAUGHT ME" with ONE hard teacher filled in ("WHAT GRIEF TAUGHT ME", "WHAT THE QUIET HOUSE TAUGHT ME"). Pick a DIFFERENT teacher than any recent title. 3-7 words.
- Exactly 5 items. Each item's "lines": 1-2 short paragraphs — one lesson, first person, concrete. Optional second paragraph: a short settled closer (2-8 words), a statement, never a command to the reader.
- Each lesson hits a DIFFERENT nerve: what she dropped, what she kept, what she stopped believing, what she now protects, what surprised her. Never two on the same nerve.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one what-X-taught-me topic (women's funnel). */
export async function generateTaughtTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "taught-carousel-topic",
    system: TAUGHT_SYSTEM_PROMPT,
    user: `Write one new what-it-taught-me post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "taught",
    requireName: false,
    minLines: 1,
  });
}

// ─── ONE YEAR FROM NOW carousel (2026-08-28 night, per Keenan) ────────
// BWK men's lane (retargeted 2026-08-28 late night, per Keenan):
// forward-pointing time math — five concrete transformations a single
// year of discipline holds, each grounded in plausible arithmetic.
// Memento mori's hopeful twin, in command voice.

const YEAR_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: ONE YEAR FROM NOW — concrete, arithmetic proof of what a single year of discipline quietly builds. Forward-pointing time math. Not motivation — evidence.

AUDIENCE: young aspiring men (18-30) deep in the self-improvement / discipline / "trust the process" niche, scrolling at midnight and telling themselves they'll start Monday. The math should read like orders from a future self.
VOICE: calm command energy. Short declarative sentences. No softness, no hedging on the tone (hedge only the numbers). Direct second person. A mentor who's already made it and doesn't waste words. Never bro-slang, never yelling.

SCENES: dark minimalist photography — an empty running track at night, a dim gym with one light on and a loaded barbell waiting, a desk lamp over an open notebook before dawn, a pre-dawn road disappearing into fog, a city rooftop at first light, rain on a black car windshield, a glowing laptop open on a couch in a near-black living room, a dark penthouse bedroom with floor-to-ceiling glass over a glittering night skyline, a dark stone house on a cliff above a fog-covered sea. Desaturated, near-monochrome. Every frame DIM (white text must read on it). NO people EVER — write every scene EMPTY; the still-glowing laptop, the unused gym, the track nobody is running do the work. These are inspiration, not a menu — invent new locations in the same DNA so no two posts look alike.

FORMAT — each slide reads like this (match the rhythm):
"A year from now you could have read 24 books.

Two a month. Twenty minutes a night.

The year passes either way."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("ONE YEAR FROM NOW", "THE YEAR PASSES ANYWAY"). No number in the title.
- The request tells you EXACTLY how many items to write. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE concrete thing a year could build, with an honest number ("A year from now you could have trained ~300 sessions."). Plausible arithmetic only — hedge with "about" or "~" where needed, never fake precision.
  - Middle line: the small daily math that gets there ("Six days a week. One hour."). Cold and simple.
  - Last line: a short landing (2-6 words) — a command or flat statement ("Start tonight.", "The year passes either way.").
- Vary the subject across the slides: body or training, a skill mastered, money saved or earned, a habit quit, something built (a business, a rep, a name), a language, endurance, a reputation for showing up. Never two slides on the same subject — and never the same subject mix as a recent post.
- It should feel like cold arithmetic pointed forward — never a pep talk, never poetry.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/** Generate one one-year-from-now topic (BWK men's lane). 4-7 items
 *  per post (2026-08-31 variance). */
export async function generateYearTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "year-carousel-topic",
    system: YEAR_SYSTEM_PROMPT,
    user: `Write one new one-year-from-now post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "year",
    requireName: false,
    minLines: 2,
    minItems: 4,
    maxItems: 7,
  });
}

// ─── THINGS THAT ARE STILL FREE carousel (2026-08-28 night) ───────────
// Universal lane: five free things, numbered like the discipline lanes
// ("1. Watching it rain.") with one quiet expansion each. Quietly
// devastating positivity.

const buildFreeSystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: THINGS THAT ARE STILL FREE — small, real, available-tonight things money never touched. Quietly devastating in how obvious they are.

AUDIENCE: everyone scrolling at midnight. Universal — no gendered content, no niche jargon.

${WOMEN_SCENE_BRIEFS[scheme]}

FORMAT — each slide reads like this (match the rhythm):
"1. Watching it rain.

No ticket, no line, no upgrade. The best seat is the one by the window.

It's playing tonight."

RULES:
- "title": the cover text. 3-6 words, works in ALL CAPS ("STILL FREE", "THINGS THAT ARE STILL FREE"). No number in the title.
- The request tells you EXACTLY how many items to write. Each item:
  - "name": the free thing, 2-5 words + period ("Watching it rain.", "Being early.", "Saying it first.").
  - "lines": 1-2 short paragraphs. First: one quiet, concrete expansion of why it matters. Optional last line: a short settled closer (2-6 words), a statement, never a command.
- Vary the kind of free thing across the slides: something in nature, something about time, something human, something sensory, something done alone. Never two of the same kind — and never the same set as a recent post.
- Never saccharine, never a gratitude lecture — the tone is someone pointing out what was on the table the whole time.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one still-free topic (universal). 4-6 items per post
 *  (2026-08-31 variance). */
export async function generateFreeTopic(
  recentHeadlines: string[],
  scheme: WomenScheme = "light"
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "free-carousel-topic",
    system: buildFreeSystemPrompt(scheme),
    user: `Write one new things-that-are-still-free post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "free",
    requireName: true,
    minLines: 1,
    minItems: 4,
    maxItems: 6,
  });
}

// ─── YOU'RE NOT BEHIND carousel (2026-08-28 night, per Keenan) ────────
// BWK men's lane (retargeted 2026-08-28 late night, per Keenan): five
// internet timeline lies, each named as a header ("1. Millionaire by
// 25.") and flatly dismantled underneath.

const BEHIND_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: YOU'RE NOT BEHIND — five timeline lies the reader was handed, each named and flatly dismantled. Not a pep talk — a correction of the record.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche — measuring themselves against highlight reels and made-up deadlines: rich by 25, founder by 22, shredded by summer. Reading it should feel like a mentor finally saying the quiet part: the schedule was invented to sell you something.
VOICE: calm command energy, a little dry. Short declarative sentences. Direct second person. Never bro-slang, never yelling, never "it's never too late!" cheerfulness — flat, factual correction.

${SCENE_BRIEF["men"]}

FORMAT — each slide reads like this (match the rhythm):
"1. Millionaire by 25.

Most real wealth compounds after 40. The guys posting rented it.

The clock is fake."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("YOU'RE NOT BEHIND", "THE TIMELINE WAS MADE UP"). No number.
- Exactly 5 items. Each item:
  - "name": the timeline lie as a short deadline phrase + period ("Millionaire by 25.", "Founder by 22.", "Shredded by summer.", "Figured out by 30."). 2-6 words.
  - "lines": 1-2 short paragraphs. First: dismantle the lie in one or two plain sentences — the real math, where the lie came from, or the documented truth that breaks it. Optional last line: a short flat closer (2-6 words), a statement, never a command.
- Each of the 5 lies comes from a DIFFERENT domain: money, career or title, body, relationship, mastery or purpose. Never two on the same domain.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one you're-not-behind topic (BWK men's lane). */
export async function generateBehindTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "behind-carousel-topic",
    system: BEHIND_SYSTEM_PROMPT,
    user: `Write one new you're-not-behind post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "behind",
    requireName: true,
    minLines: 1,
  });
}

// ─── NOBODY TELLS YOU carousel (2026-08-28 night, per Keenan) ─────────
// Women's funnel: the subject rotates daily ("NOBODY TELLS YOU ABOUT
// 45", "...ABOUT THE QUIET HOUSE") so the title is the dedupe key.
// Five unspoken truths, no headers.

const buildNobodySystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: NOBODY TELLS YOU — one life season per post, five truths about it that nobody says out loud beforehand.

AUDIENCE: women roughly 40-50 carrying a heavy mental load. The seasons rotate: turning 45, the year the kids stop needing you, a long marriage, caring for aging parents, friendship after 40, the quiet house. Each truth should land as recognition — "so it's not just me."
VOICE: quiet, flat, honest. Plain statements with warmth underneath. Never bitter, never dramatic — the sting is recognition.

${WOMEN_SCENE_BRIEFS[scheme]}

FORMAT — each slide reads like this (match the rhythm):
"The hardest part isn't the missing. It's that the missing becomes normal.

Nobody warns you about that part."

RULES:
- "title": the cover text — "NOBODY TELLS YOU" plus ONE specific season ("NOBODY TELLS YOU ABOUT 45", "NOBODY TELLS YOU ABOUT THE QUIET HOUSE"). Pick a DIFFERENT season than any recent title. 4-8 words.
- The request tells you EXACTLY how many items to write. Each item's "lines": 1-2 short paragraphs — one unspoken truth about that season, plain declarative sentences. Optional second paragraph: a short settled closer (2-8 words), a statement, never a command.
- Each truth hits a DIFFERENT nerve of the season: the body, the relationships, the identity, the surprise good part, the part she'd never admit. Exactly ONE truth is unexpectedly good.
- Every sentence short. US English. No emojis, no hashtags, no quotes, no advice-verbs. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "..."], "scene": "..." }
  ]
}`;

/** Generate one nobody-tells-you topic (women's funnel). 4-6 items
 *  per post (2026-08-31 variance). */
export async function generateNobodyTopic(
  recentHeadlines: string[],
  scheme: WomenScheme = "light"
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "nobody-carousel-topic",
    system: buildNobodySystemPrompt(scheme),
    user: `Write one new nobody-tells-you post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "nobody",
    requireName: false,
    minLines: 1,
    minItems: 4,
    maxItems: 6,
  });
}

// ─── UNSENT TEXTS carousel (2026-08-28 night, per Keenan) ─────────────
// Women's funnel: five messages typed and deleted — ONE per slide, in
// the premium QUOTE serif like the forbidden lane. Each to a different
// unnamed recipient.

const UNSENT_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 slides of white text centered on cinematic photography. The niche: UNSENT TEXTS — messages someone typed, read back, and deleted. Each slide is ONE deleted message. No commentary, no advice, anywhere.

AUDIENCE: women roughly 40-50 carrying a heavy mental load. Each message should read as something she herself has typed and erased — to a husband, a mother, an old friend, a grown child, someone gone, or herself.
VOICE: first person, raw but restrained — the honesty of a message that was never going to be sent. Plain texting language, not literary. Lowercase is allowed where it feels real.

${SCENE_BRIEF["women"]}

FORMAT — each slide is ONE message like:
"i'm not mad. i'm just tired of being the only one who notices."
"you were my best friend for 20 years. i don't even know what happened."

RULES:
- "title": the cover text. 2-5 words, works in ALL CAPS ("TYPED AND DELETED", "TEXTS I NEVER SENT"). Not a question.
- Exactly 5 items. Each item's "lines": exactly ONE line — the deleted message. 6-20 words. It must sound like a real text: plain words, contractions, no polish.
- Each message is to a DIFFERENT unnamed recipient: a partner, a parent, an old friend, a grown child or family member, someone gone or her past self. Never name names.
- Each hits a DIFFERENT nerve: exhaustion, drifted love, grief, resentment, tenderness. Exactly ONE of the 5 is tender instead of heavy.
- No metaphors, no aphorisms — these are texts, not quotes. If it sounds writerly, rewrite it plainer.
- US English. No emojis, no hashtags, no quotation marks around the lines. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["..."], "scene": "..." }
  ]
}`;

/** Generate one unsent-texts topic (women's funnel). */
export async function generateUnsentTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "unsent-carousel-topic",
    system: UNSENT_SYSTEM_PROMPT,
    user: `Write one new unsent-texts post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "unsent",
    requireName: false,
    minLines: 1,
  });
}

// ─── Universal-lane caption (bloomers / year / free) ──────────────────
const UNIVERSAL_CORE_TAGS = ["#fyp", "#mindset", "#perspective", "#motivation"];
const UNIVERSAL_ROTATING_TAGS = [
  "#lifelessons",
  "#growth",
  "#presence",
  "#intentionalliving",
  "#reminder",
  "#itsnottoolate",
];

/** Hashtag-only caption for the forward-looking universal lanes. */
export function buildUniversalCaption(slug: string): string {
  let hash = 0;
  for (const c of slug) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0;
  const h = Math.abs(hash);
  const extra = [
    UNIVERSAL_ROTATING_TAGS[h % UNIVERSAL_ROTATING_TAGS.length],
    UNIVERSAL_ROTATING_TAGS[(h + 3) % UNIVERSAL_ROTATING_TAGS.length],
  ];
  return [...UNIVERSAL_CORE_TAGS, ...new Set(extra)].join(" ");
}

// ─── THIS IS YOUR SIGN — single static image (2026-08-28 night) ───────
// Replaces the animated quote loop (which Keenan eliminated the same
// night). ONE dark cinematic image with ONE permission-giving line in
// bold confident lettering (per Keenan: "no fancy italics. bold,
// confident lettering"). Positive polarity — the warm cousin of the
// dead quote format.

export interface SignTopic {
  slug: string;
  /** The full sign line, starts with "THIS IS YOUR SIGN". */
  line: string;
  scene: string;
}

const SIGN_SYSTEM_PROMPT = `You write ONE line for a soft, light, feminine single-image post. The format: bold dark text on a bright, airy photograph. The line always begins "THIS IS YOUR SIGN TO ..." and gives the reader quiet permission to do the thing they've been waiting for a sign to do.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The sign should release something specific: rest, a boundary, a call, letting something go, starting something small.
VOICE: warm, certain, plain. Permission — never pressure, never hustle, never "go get it queen" energy.

RULES:
- ONE line, 8-16 words total, beginning exactly "THIS IS YOUR SIGN TO". Specific and concrete, not generic ("...to stop rehearsing the apology you don't owe", not "...to live your best life").
- No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "scene": one concrete sentence describing the photograph — soft, aesthetically pleasing feminine interiors in LIGHT, airy tones (cream silk and linen in a bright bedroom, a sunlit bath, white peonies by a light-washed window, morning sun through sheer curtains). SOFT and LIGHT (dark text must read on it), beautiful, no people ever.
- "theme": 2-4 words naming what the sign releases (for repeat-avoidance).

OUTPUT (strict JSON, no markdown):
{ "line": "...", "scene": "...", "theme": "..." }`;

/** Generate one this-is-your-sign line + scene (women's funnel). */
export async function generateSignTopic(
  recentLines: string[]
): Promise<SignTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: `${SIGN_SYSTEM_PROMPT}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new sign.${avoidBlock(recentLines)}\n\nReturn ONLY valid JSON.`,
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "sign-image-topic",
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      line?: string;
      scene?: string;
      theme?: string;
    };
    const line = (parsed.line ?? "").trim();
    const scene = (parsed.scene ?? "").trim();
    if (!line.toUpperCase().startsWith("THIS IS YOUR SIGN") || !scene) {
      throw new Error(`sign-image-topic unusable: line="${line}"`);
    }

    // HUMANIZER approval gate (2026-09-04, per Keenan: every social post
    // runs through it before generation). Line only — scene is image
    // direction and never gated. Fails open.
    let gatedLine = line;
    try {
      const gated = await humanizePass<{ line: string }>({
        purpose: "humanize:sign-topic",
        voice: extractVoice(SIGN_SYSTEM_PROMPT),
        payload: { line },
      });
      const gl = (gated.line ?? "").trim();
      if (gl.toUpperCase().startsWith("THIS IS YOUR SIGN")) gatedLine = gl;
    } catch {
      console.warn("[sign-topic] humanizer gate failed — shipping ungated copy");
    }

    const slug = line
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return { slug: `sign-${slug}`, line: gatedLine, scene };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "sign-image-topic",
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// ─── AURA: single-image BWK persona post (2026-08-30, per Keenan) ─────
// "add aura" — the BWK counterpart to SIGN: one cinematic shot of the
// persona mid-element or mid-grind, one bold command line. Cloned from
// his "The photo with the most aura win" reference.
// ☠️ KILLED 2026-09-01 (per Keenan: "get rid of the 'finish what they
// laughed at' post type where it's just one picture generation").
// Generator kept dormant for historical posts; lane removed from
// carousel-daily.ts.

const AURA_SYSTEM_PROMPT = `You write ONE line for a dark, dominant, single-image post. The format: bold white text on a cinematic photograph of a lone man living at full intensity — ascending a snowy ridge in a storm, standing at a cliff edge in rain, cold-plunging at dawn, training alone in a dark gym, working at a glowing laptop in a near-black room, standing at floor-to-ceiling glass over a glittering night skyline, walking a long stone path to a cliff-top house in sea fog, running an empty city street before first light, rowing across cold grey water at dawn. Those are inspiration, not a menu — invent new full-intensity moments in the same DNA so no two posts look alike.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. The image is the aura; the line is the caption burned onto it.
VOICE: calm command energy. Stark, declarative, a little cold. Never bro-slang, never yelling, never cliché hustle quotes.

RULES:
- ONE line, 2-8 words total, ALL-CAPS-friendly ("NOBODY'S COMING.", "EARN THE VIEW.", "COMFORT IS A DEBT."). Punchy and specific — never generic filler like "RISE AND GRIND".
- No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "scene": one concrete sentence describing the photograph — it MUST feature the lone man mid-action in black technical or dark luxury clothing, face hidden (goggles, hood, silhouette, from behind, or deep shadow). Dark, desaturated, DIM overall (white text must read on it).
- "theme": 2-4 words naming the idea (for repeat-avoidance).

OUTPUT (strict JSON, no markdown):
{ "line": "...", "scene": "...", "theme": "..." }`;

/** Generate one aura line + persona scene (men / BWK funnel). */
export async function generateAuraTopic(
  recentLines: string[]
): Promise<SignTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      system: `${AURA_SYSTEM_PROMPT}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new aura post.${avoidBlock(recentLines)}\n\nReturn ONLY valid JSON.`,
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: "aura-image-topic",
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      line?: string;
      scene?: string;
      theme?: string;
    };
    const line = (parsed.line ?? "").trim();
    const scene = (parsed.scene ?? "").trim();
    if (!line || line.split(/\s+/).length > 10 || !scene) {
      throw new Error(`aura-image-topic unusable: line="${line}"`);
    }

    // HUMANIZER approval gate (2026-09-04) — line only, fails open.
    let gatedLine = line;
    try {
      const gated = await humanizePass<{ line: string }>({
        purpose: "humanize:aura-topic",
        voice: extractVoice(AURA_SYSTEM_PROMPT),
        payload: { line },
      });
      const gl = (gated.line ?? "").trim();
      if (gl && gl.split(/\s+/).length <= 10) gatedLine = gl;
    } catch {
      console.warn("[aura-topic] humanizer gate failed — shipping ungated copy");
    }

    const slug = line
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    return { slug: `aura-${slug}`, line: gatedLine, scene };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose: "aura-image-topic",
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// ─── VERSIONS: "two versions of you" contrast carousel (2026-08-30) ───
// Per Keenan: "add ... two versions". Slide pairs contrasting the man
// who kept the promise vs. the one who didn't — same 24 hours.

const VERSIONS_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography. The niche: TWO VERSIONS OF YOU — each slide contrasts the man who kept the promise with the man who didn't, in the same situation. Same 24 hours, two outcomes.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. Each contrast should sting because both versions are plausible — the reader recognizes himself in the weaker one and wants to be the other.
VOICE: calm command energy, flat and factual. Short declarative sentences. Direct. Never mocking, never yelling — the contrast does the work.

SCENES: dark minimalist photography — a lone man at a glowing laptop in a near-black room, a dim gym with one figure training, a pre-dawn road, a silhouette at a rain-streaked window, a black ridgeline at night, an empty desk lit by one lamp. Desaturated, near-monochrome. Every frame DIM (white text must read on it). A man appears ONLY when he elevates the scene — always alone, luxury-styled (dark knits, overcoat, watch; dark suit; training gear; black expedition gear on a ridge or cliff), face usually hidden (behind/silhouette/shadow/sunglasses/goggles), rarely visible.

FORMAT — each slide reads like this (match the rhythm):
"Both were tired at 5 AM.

Only one got up.

The alarm didn't decide. He did."

RULES:
- "title": the cover text. 2-5 words, commanding, works in ALL CAPS ("TWO VERSIONS OF YOU", "SAME 24 HOURS"). 
- Each item: "lines" = 2-3 short paragraphs — first states what BOTH versions faced, then the split, then (optionally) the flat truth underneath. The LAST item must land the close: same time, same tiredness, same excuses available — one chose. End it on a short command ("Choose.", "Pick one.").
- Each item's "scene": one concrete sentence for the photograph, per SCENES above.
- "coverScene": one scene sentence for the cover.
- No emojis, no hashtags. Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "title": "...", "coverScene": "...", "items": [{ "name": "", "lines": ["...", "..."], "scene": "..." }] }`;

/** Generate one two-versions contrast carousel (men / BWK funnel). */
export async function generateVersionsTopic(
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "versions-carousel-topic",
    system: VERSIONS_SYSTEM_PROMPT,
    user: `Write one new two-versions post with 5 or 6 contrast slides.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "versions",
    requireName: false,
    minLines: 2,
  });
}

// ─── PROTOCOL: "DO THIS FOR 30 DAYS" carousel (2026-08-30) ───────────
// Per Keenan: "add ... 30 days". A concrete numbered protocol — the
// save-bait format: people bookmark protocols, not motivation.

// Protocol interval rotation (2026-09-10, per Keenan: "change
// 'protocol' interval... it can rotate between 30 days, 100 days, 365
// days, 5 years, 2 years"). Rolled per post inside the memoized topic
// step, same pattern as the cover-family roll.
const PROTOCOL_INTERVALS = [
  "30 DAYS",
  "100 DAYS",
  "365 DAYS",
  "2 YEARS",
  "5 YEARS",
] as const;

const buildProtocolSystemPrompt = (
  interval: string
) => `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography. The niche: ${interval} OF DISCIPLINE — the concrete progress a man can ACTUALLY make and the results he can expect if he locks in for ${interval.toLowerCase()}. Real math, real outcomes — evidence, not motivation.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. They SAVE posts that show them what the work actually buys. Every slide must name a real, expected result — accumulated hours, measurable body change, money stacked, skills built — never vague promises like "you'll be different" or "everything changes".
VOICE: calm command energy. Short declarative sentences. A mentor stating what the math says, not a poet. Never bro-slang, never yelling.

SCENES: dark, dramatic, luxurious photography in FOUR families (nothing outside them): dark-luxury architecture (luxury buildings with a DRAMATIC SKY — heavy cloud cover, cool cinematic lighting, or a burning sunset behind every building: a penthouse tower crowned in storm cloud, a cliff mansion above a storm sea at dusk, a skyscraper against a blood-orange sunset — shot low and dramatic, never a flat skyline or plain empty sky), alpha wildlife (ONE alpha animal commanding an epic landscape — a wolf on a cracked frozen lake, a lion crossing black dunes at dusk, a stag in blowing snow; the whole animal kingdom, never a recent post's animal; HYPER-REAL weather only — natural light a wildlife photographer could capture, NEVER lightning bolts or painted-on skies), dark-luxury objects (a classic Ferrari under one cold spotlight, rain beading on an old-school Mercedes gullwing, a vintage Porsche on a wet mountain road at dusk, a Swiss watch on black marble, a private jet on wet tarmac at night — one hero object, shot like a high-end ad; cars rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce — modern Lamborghini-style supercars only rarely; unmistakably LUXURY, NEVER notebooks, pens, books, desks, or any office/stationery still-life), and epic warriors (a lone knight / spartan / samurai / viking in FULL armor, seen from a DISTANCE in an epic landscape THAT MATCHES WHO HE IS — a viking on a windswept grey beach with longships behind, a samurai on a misty bamboo path in rain, a knight leading his horse up a snowy mountain trail, a spartan on sun-bleached coastal rocks; each warrior type gets ITS OWN world, never one generic snowfield, NEVER standing directly on ice or a frozen lake; DOING something powerful — striding into the weather, arms flexed in triumph, sword driven into the earth — a pose that reads in silhouette and radiates strength and drive; hyper-real like a prestige-film still, wide cinematic framing, never close to the camera, face never visible). Desaturated, near-monochrome. Every frame DIM (white text must read on it). ANTI-BLAND RULE: every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape or bare horizon. NO people EVER except the distant-warrior carve-out (face never visible) and the lone animal, each only in its own family's scenes. UNLIMITED LIBRARY RULE: every example is a SEED, not a menu — INVENT a brand-new scene for every slide (new subject, location, season, weather, time, vantage) within these families; never render an example verbatim, never repeat a recent post's scene.

FORMAT — every slide is a tight three-part build rendered as: bold HEADER, one italic HOOK line, short BODY. Match this shape exactly:
name: "The Skill"
lines[0] (hook): "About 100 focused hours banked."
lines[1] (body): "One hour a day, every day. Enough to go from clueless to dangerous — most people never log ten."

RULES:
- "title": the cover text is EXACTLY "${interval} OF DISCIPLINE..." — nothing else, all caps, trailing "..." as the swipe bait. Do not add words, do not rephrase.
- The slides answer the cover: HOW MUCH progress he can actually make in ${interval.toLowerCase()}, area by area. Each item is a DIFFERENT area of life (the body, the bank account, the skill, the mind, the reading, the reputation, the business) — vary the areas post to post and NEVER reuse the mix from the recent-posts list.
- Each item: "name" = the HEADER — the area in Title Case, 2-4 words, NO trailing period ("The Body", "The Bank Account"). "lines" = EXACTLY 2 entries: lines[0] = the HOOK — ONE short line stating the accumulated number over ${interval.toLowerCase()} (renders in italics; must land on its own); lines[1] = the BODY — 1-2 short sentences: the daily action and the real expected result. The math must be plausible and scaled to the interval — hedge honest numbers with "about" or "~" (about 100 workouts in 100 days; ~1,800 focused hours in 5 years). Results must be believable, never inflated.
- HARD LIMIT: each slide's hook + body totals UNDER 30 words. Long = generic = scrolled past. Short = screenshotted and saved.
- Each item's "scene": one concrete sentence for the photograph, per SCENES above.
- "coverScene": one scene sentence for the cover.
- No emojis, no hashtags. Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "title": "...", "coverScene": "...", "items": [{ "name": "...", "lines": ["...", "..."], "scene": "..." }] }`;

/** Generate one timeline carousel (men / BWK funnel). The interval
 *  rotates per post (2026-09-10) and the cover is exactly
 *  "{INTERVAL} OF DISCIPLINE..." with slides laying out how much
 *  progress he can actually make and the expected results (2026-09-10,
 *  later — replaced the question cover + protocol-steps format). */
export async function generateProtocolTopic(
  recentHeadlines: string[],
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const interval =
    PROTOCOL_INTERVALS[Math.floor(Math.random() * PROTOCOL_INTERVALS.length)];
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: "protocol-carousel-topic",
    // 2026-09-08: rolled cover-family rule appended so protocol covers
    // rotate too instead of drifting toward buildings.
    // 2026-09-14, per Keenan: pick-list retired — ONE cover + 4-7
    // areas so posts go out ready-made for auto-publish.
    system: `${buildProtocolSystemPrompt(interval)}\n\n${rollMenCoverRule(sceneFamily)}`,
    user: `Write one new "${interval} OF DISCIPLINE..." post with exactly ${itemCount} areas of expected progress.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "protocol",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: itemCount,
    // Title is fixed ("{INTERVAL} OF DISCIPLINE...") — repeats by design.
    headlineDedupe: false,
  });
}

// ─── PHONE-QUOTE: "this quote kept me up all night" (2026-09-03) ─────
// Per Keenan (with reference screenshots): "add a lane for both of
// these types of posts. one for ripple, one for BWK. 'this quote kept
// me up all night...' first slide, and then the next slide is a phone
// screen with a quote about something important. a message that people
// resonate with. something motivational and developmental."
// 2 slides: cover = photo + sentence-case hook; slide 2 = a phone
// notes-app screen with the quote TYPED on it. The quote slide is
// composed PROGRAMMATICALLY in compose.ts (renderPhoneQuoteSlide) —
// gpt-image-2 never touches the text. Lane names are "phone-quote"
// (Ripple) / "phone-quote-men" (BWK) — NOT the dormant
// "quote-women"/"quote-men" from the killed animated-loop format.

export interface PhoneQuoteTopic {
  slug: string;
  /** Sentence-case cover hook, e.g. "this quote kept me up all night..." */
  hook: string;
  coverScene: string;
  /** The quote typed on the notes-app slide. No attribution. */
  quote: string;
}

const PHONE_QUOTE_SYSTEM: Record<MoodyAudience, string> = {
  women: `You write 2-slide quote posts for a soft, feminine account for women roughly 40-50 carrying a heavy mental load. Slide 1 is a photograph with a lowercase sentence-case hook; slide 2 is a phone notes-app screen showing one quote.

- "hook": the cover line, 5-12 words, lowercase sentence case, intimate and confessional, ending with "..." — it teases the quote without revealing it. Rotate the STRUCTURE every post, never reuse a recent hook's framing: what it did to her ("this quote kept me up all night..." shape), when it landed (a moment in her day or week), who it made her think of, how long it took to sink in, what she did after reading it, or who she wishes had read it sooner. Invent new words each time; those are shapes, not lines to copy.
- NO FAKE-CANDID PROVENANCE in the hook (2026-09-23 audit — hooks like "overheard this in a car park and wrote it on my hand..." and "found this folded inside a library book..." read as invented, and this audience clocks them as fake/AI). NEVER claim where the quote physically came from: no found-object stories ("found this in/inside...", "someone left this..."), no overheard strangers ("overheard this...", "a woman i barely know said..."), no copied-down props ("wrote it on my hand / a napkin / a receipt"). The hook is about HER honest reaction to the words, not a backstory for them.
- "quote": 15-40 words, ALL lowercase. Motivational and developmental — self-compassion, growth over perfection, permission to rest, letting go, starting again, quiet strength. STRUCTURE (the winning shape — a universal hard truth, then a turn that hands the reader her power back): 2-4 short plain sentences; the first states something true and a little heavy about time, age, or change; the last flips it into quiet permission or hope. Style north star (NEVER copy or lightly reword it — invent fresh): "no matter your age, you'll always wish you started younger. but today is the youngest you'll ever be." It must read like something a real person would screenshot and send a friend at 2am: warm, plain words, second person welcome, no clichés stacked on clichés. NO attribution, NO quotation marks, NO emojis, NO hashtags.
- "coverScene": one concrete sentence for the photograph, following the COVER SCENE RULE below. DIM, warm, intimate, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "quote": "..." }`,
  men: `You write 2-slide quote posts for a dark, moody, minimal account for young aspiring men (18-30) in the self-improvement / discipline niche. Slide 1 is a photograph with a lowercase sentence-case hook; slide 2 is a phone notes-app screen showing one quote.

- "hook": the cover line, 5-12 words, lowercase sentence case, ending with "..." — it teases the quote without revealing it. Rotate the STRUCTURE every post, never reuse a recent hook's framing: what it did to him ("this quote kept me up all night..." shape), a direct instruction before a decision ("read this before you quit..." shape), the moment it applies to, the cost of learning it late, who needs to hear it, or what changed after he took it seriously. Invent new words each time; those are shapes, not lines to copy.
- NO FAKE-CANDID PROVENANCE in the hook (2026-09-23 audit — hooks like "overheard this in a car park and wrote it on my hand..." and "found this folded inside a library book..." read as invented, and this audience clocks them as fake/AI). NEVER claim where the quote physically came from: no found-object stories ("found this in/inside...", "someone left this..."), no overheard strangers ("overheard this...", "an old man told me..."), no copied-down props ("wrote it on my hand / a napkin / a receipt"). The hook is about HIS honest reaction to the words, not a backstory for them.
- "quote": 15-40 words, ALL lowercase. Motivational and developmental — discipline, patience, building in silence, becoming the man who keeps his word, delayed gratification, standards. STRUCTURE (the winning shape — a universal hard truth, then a turn that hands him his power back): 2-4 short plain sentences; the first states something true and a little heavy about time, age, or the cost of waiting; the last flips it into quiet resolve or possibility. Style north star (NEVER copy or lightly reword it — invent fresh): "no matter your age, you'll always wish you started younger. but today is the youngest you'll ever be." It must read like something a man would screenshot and set as his lock screen: calm command energy, plain declarative words, second person welcome, never bro-slang, never yelling. NO attribution, NO quotation marks, NO emojis, NO hashtags.
- "coverScene": one concrete sentence for the photograph, following the COVER SCENE RULE below. DIM, desaturated, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "quote": "..." }`,
};

/** Generate one phone-quote topic (2-slide format) for either funnel.
 *  2026-09-23: cross-lane headline dedupe + fake-candid hook check —
 *  one retry with feedback if the hook repeats a recent headline or
 *  invents a found/overheard provenance. */
export async function generatePhoneQuoteTopic(
  audience: MoodyAudience,
  recentHeadlines: string[],
  feedback?: string | null
): Promise<PhoneQuoteTopic> {
  return withHeadlineRetry({
    label: audience === "men" ? "phone-quote-men-topic" : "phone-quote-topic",
    generate: (extra) =>
      generatePhoneQuoteTopicOnce(audience, recentHeadlines, feedback, extra),
    headlineOf: (t) => t.hook,
    reject: (t) => fakeCandidFeedback(t.hook),
  });
}

async function generatePhoneQuoteTopicOnce(
  audience: MoodyAudience,
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<PhoneQuoteTopic> {
  const { prisma } = await import("@/lib/prisma");
  const purpose =
    audience === "men" ? "phone-quote-men-topic" : "phone-quote-topic";
  const start = Date.now();
  // Reddit audience pulse (2026-09-17) — soft, angle inspiration only.
  let pulse = "";
  try {
    const { getAudiencePulse } = await import("./reddit-trends");
    pulse = await getAudiencePulse(audience === "men" ? "bwk" : "ripple");
  } catch {
    /* soft — generate without the pulse */
  }
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      // Both funnels rotate cover families — men since 2026-09-08,
      // women since 2026-09-18 (was a fixed night-interior pool).
      system: `${PHONE_QUOTE_SYSTEM[audience]}\n\n${audience === "men" ? rollMenCoverRule() : rollWomenCoverRule()}${pulse}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new phone-quote post.${avoidBlock(recentHeadlines, feedback)}${extra}\n\nReturn ONLY valid JSON.`,
        },
      ],
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      hook?: string;
      coverScene?: string;
      quote?: string;
    };
    const hook = (parsed.hook ?? "").trim();
    const coverScene = (parsed.coverScene ?? "").trim();
    const quote = (parsed.quote ?? "").trim();
    const quoteWords = quote.split(/\s+/).length;
    if (!hook || !coverScene || !quote || quoteWords < 10 || quoteWords > 60) {
      throw new Error(
        `${purpose} unusable: hook="${hook}", quote ${quoteWords} words`
      );
    }

    const slug = hook
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    // Humanizer approval gate (2026-09-04) — hook + quote only, never
    // the coverScene image direction. Fails open on error.
    let gatedHook = hook;
    let gatedQuote = quote;
    try {
      const gated = await humanizePass({
        purpose: `humanize:${purpose}`,
        voice: extractVoice(PHONE_QUOTE_SYSTEM[audience]),
        payload: { hook, quote },
      });
      const gw =
        typeof gated.quote === "string"
          ? gated.quote.trim().split(/\s+/).length
          : 0;
      if (
        typeof gated.hook === "string" &&
        gated.hook.trim() &&
        gw >= 10 &&
        gw <= 60
      ) {
        gatedHook = gated.hook.trim();
        gatedQuote = gated.quote.trim();
      }
    } catch (err) {
      console.warn(
        `[content-factory] humanize gate failed for ${purpose} — shipping ungated copy:`,
        err
      );
    }

    return {
      slug: `${audience === "men" ? "phone-quote-men" : "phone-quote"}-${slug}`,
      hook: gatedHook,
      coverScene,
      quote: gatedQuote,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// Background scenes for the phone-in-photo quote slide (2026-09-08, per
// Keenan: "you need to put the quotes onto some sort of screen and bake
// it into the image"). The AI generates ONLY a text-free out-of-focus
// backdrop — the iPhone and Notes screen are drawn programmatically in
// compose.ts, so the quote text never touches gpt-image-2.
const PHONE_QUOTE_BG_SCENES: Record<MoodyAudience, string[]> = {
  women: [
    "a lamp-lit bedroom at night, warm amber glow on rumpled linen bedding",
    "a dim living room at night, one warm floor lamp beside a soft armchair with a knit throw",
    "a kitchen counter at night lit by a single warm under-cabinet light, a mug of tea steaming",
    "a rain-streaked window at night from inside a warm dim room, soft golden lamplight reflected in the glass",
    "a candlelit bathroom at night, warm flames blurred into soft glowing orbs",
    "a lit porch at dusk, a string of warm fairy lights blurred against deep blue twilight",
  ],
  men: [
    "a classic Ferrari at night under one cold light, body lines blurred into deep reflections",
    "floor-to-ceiling glass at night over a glittering city skyline, lights blurred into bokeh",
    "a dark balcony at night facing distant city lights dissolved into soft glowing points",
    "a black car interior at night, dashboard glow and distant streetlights blurred through the windshield",
    "an empty gym at night with one cold overhead light on, everything else in darkness",
    "a dark bedroom at night, a single lone lit window visible across the street through the glass",
  ],
};

/**
 * Prompt for the AI-generated backdrop behind the drawn phone. The whole
 * scene is softly OUT of focus — as if the camera focused on a phone held
 * in the foreground (which our code composites in afterward).
 */
export function buildPhoneQuoteBgPrompt(audience: MoodyAudience): string {
  const scenes = PHONE_QUOTE_BG_SCENES[audience];
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const palette =
    audience === "men"
      ? "desaturated, near-monochrome, cool dark tones"
      : "warm, dim, intimate amber tones";
  return `A real photograph, vertical 9:16: ${scene}. The ENTIRE scene is softly OUT of focus with gentle bokeh — shallow depth of field, as if the camera is focused on a phone held close in the foreground (the phone itself is NOT in the shot). ${palette}, DIM overall, moody available light, authentic photographic grain. NO people, NO hands, NO phones, NO screens, NO text, NO words, NO letters anywhere in the image.`;
}

// ─── Quote surfaces (2026-09-08) ────────────────────────────────────────────
// Per Keenan (rejecting the drawn-phone composite as "way too generic"):
// "it should be a phone screen in a hand that looks like a true text
// message from a friend coming in, or text on a flip phone as a text
// message, or a car digital screen with words on it... you can also put
// it on a billboard, or on a sign." The AI photographs the scene WITH a
// blank glowing white screen in it; compose.ts finds that screen
// (detectBrightRect) and composites the deterministic text — the quote
// still never touches gpt-image-2.

// "poster" added 2026-09-10 (per Keenan, with a car-dash reference:
// "whether it's a phone screen, a car dash (like pictured), a
// billboard with signage, a poster, doesn't matter").
// neon/marquee/chalkboard/paper added 2026-09-14 (per Keenan: "the
// signs where the lettering built in is doing the best" + "give me 4
// more ideas for each" — four new built-in-lettering surfaces, each
// with brand-flavored scenes).
export const QUOTE_SURFACES = [
  "imessage",
  "flip",
  "car",
  "billboard",
  "sign",
  "poster",
  "neon",
  "marquee",
  "chalkboard",
  "paper",
] as const;
export type QuoteSurface = (typeof QUOTE_SURFACES)[number];

export function rollQuoteSurface(): QuoteSurface {
  return QUOTE_SURFACES[Math.floor(Math.random() * QUOTE_SURFACES.length)];
}

interface SurfaceSpec {
  /** What holds the text, per audience. */
  scenes: Record<MoodyAudience, string[]>;
  /** What we call the text-bearing area in the prompt ("screen" / "face"). */
  screenWord: string;
  /** How much of the frame the text-bearing area should fill. */
  sizeHint: string;
  /** Orientation of the text-bearing area. */
  orientation: string;
  /** How the letters physically exist on this surface (2026-09-11 baked-text pipeline). */
  textMedium: string;
}

const QUOTE_SURFACE_SPECS: Record<QuoteSurface, SurfaceSpec> = {
  imessage: {
    scenes: {
      women: [
        "a woman's hand holding an iPhone in a dim lamp-lit bedroom at night, soft knit blanket blurred behind",
        "a woman's hands cradling an iPhone at a kitchen table at night, a steaming mug of tea blurred beside it",
        "a woman's hand holding an iPhone in a warm dim living room at night, fairy lights blurred into bokeh behind",
      ],
      men: [
        "a man's hand holding an iPhone at a dark desk at night, a single lamp glowing behind",
        "a man's hand holding an iPhone in a parked car at night, city lights blurred through the windshield",
        "a man's hand holding an iPhone in front of a floor-to-ceiling window over a night city skyline, lights blurred into bokeh",
      ],
    },
    screenWord: "screen",
    sizeHint:
      "at least two thirds of the frame's height and more than half its width — the phone is held CLOSE to the camera",
    orientation: "TALL and vertical (portrait, like a phone screen)",
    textMedium:
      "crisp dark lettering typed on the phone's softly glowing pale screen, like a note open on the phone",
  },
  flip: {
    scenes: {
      women: [
        "a woman's hand holding an OPEN classic early-2000s flip phone in a warm lamp-lit room at night",
        "a woman's hand holding an OPEN classic flip phone at a cafe table, warm dim evening light",
      ],
      men: [
        "a man's hand holding an OPEN classic early-2000s flip phone at a dark desk at night, single lamp",
        "a man's hand holding an OPEN classic flip phone at a dark bar counter at night, moody low light",
      ],
    },
    screenWord: "inner display",
    sizeHint:
      "at least half of the frame's width — an EXTREME close-up where the open phone fills the frame and the inner display dominates it",
    orientation: "roughly SQUARE or slightly tall",
    textMedium:
      "softly glowing early-2000s pixel-style text on the small backlit inner display",
  },
  car: {
    scenes: {
      women: [
        "the interior of a car at night seen from the driver's seat, the center dashboard infotainment screen, warm streetlight bokeh blurred through the windshield",
        "a car interior at night in soft rain, the center dashboard screen, warm blurred city lights beyond the glass",
      ],
      men: [
        "the interior of a black car at night seen from the driver's seat, the center dashboard infotainment screen, cold city lights blurred through the windshield",
        "a dark car interior at night parked on an empty street, the center dashboard screen, distant streetlights dissolved into bokeh",
      ],
    },
    screenWord: "screen",
    sizeHint:
      "at least two thirds of the frame's width — shot CLOSE so the dashboard screen dominates the composition",
    orientation: "WIDE and horizontal (landscape, like a dashboard display)",
    textMedium:
      "glowing text on the dashboard media screen, displayed like a now-playing track title",
  },
  billboard: {
    scenes: {
      women: [
        "a city street at dusk with one large blank billboard mounted on a building, warm golden-hour glow, street details blurred below",
        "an empty two-lane road at dusk with one large roadside billboard against a deep blue twilight sky",
      ],
      men: [
        "a dark downtown street at night with one large blank billboard on a building, cold desaturated tones, wet asphalt reflections",
        "a highway shoulder at night with one large billboard lit against the black sky, desaturated and moody",
      ],
    },
    screenWord: "face",
    sizeHint:
      "at least two thirds of the frame's width — shot from close below so the billboard dominates the composition",
    orientation: "WIDE and horizontal (landscape, like a billboard)",
    textMedium:
      "large printed letters filling the billboard face, weathered slightly by sun and city air",
  },
  sign: {
    scenes: {
      women: [
        "a sidewalk outside a small cafe at dusk, one letterboard sign standing on the pavement, warm string lights blurred behind",
        "the front of a cozy shop at dusk, one blank sign face beside the door, warm dim evening light",
      ],
      men: [
        "a dark city sidewalk at night, one letterboard sign standing outside a bar, cold moody low light",
        "an empty street corner at night, one blank sign face lit by a single streetlight, desaturated tones",
      ],
    },
    screenWord: "face",
    sizeHint:
      "at least two thirds of the frame's width — shot CLOSE so the sign face dominates the composition",
    orientation: "roughly SQUARE or slightly tall",
    textMedium:
      "physical changeable black letterboard letters slotted into the sign's tracks, each letter casting its own tiny shadow",
  },
  poster: {
    scenes: {
      women: [
        "a framed poster hanging on a warm brick wall inside a dim cafe at night, one small lamp glowing nearby",
        "a bus-stop poster case on a quiet street at dusk, warm golden streetlight, the sidewalk blurred around it",
      ],
      men: [
        "a framed poster on a dark concrete wall in a moody hallway at night, lit by one cold overhead beam",
        "a bus-stop poster case on an empty city street at night, wet asphalt reflections, desaturated tones",
      ],
    },
    screenWord: "face",
    sizeHint:
      "at least two thirds of the frame's height and more than half its width — shot CLOSE so the poster dominates the composition",
    orientation: "TALL and vertical (portrait, like a poster)",
    textMedium:
      "elegant printed typography that is part of the poster's graphic design, ink on paper",
  },
  neon: {
    scenes: {
      women: [
        "a warm blush-and-amber neon sign glowing on the exposed-brick wall of a dim cozy cafe at night, string lights blurred below",
        "a soft warm-white neon sign mounted above a dresser in a dark bedroom, one small lamp glowing at the edge of frame",
      ],
      men: [
        "a cold white neon sign on the bare concrete wall of an empty gym at night, everything else in darkness",
        "a stark ice-blue neon sign glowing on the dark brick wall of an empty bar after close, wet-street light leaking through a window",
      ],
    },
    screenWord: "sign",
    sizeHint:
      "at least two thirds of the frame's width — shot CLOSE so the glowing sign dominates the composition",
    orientation: "roughly SQUARE or slightly wide",
    textMedium:
      "hand-bent glowing neon tubing forming every word, the tubes casting soft colored light and a faint halo onto the wall behind them",
  },
  marquee: {
    scenes: {
      women: [
        "an old theater marquee at dusk on a small-town main street, rows of warm bulbs glowing against a deep blue twilight sky",
        "a vintage cinema marquee at dusk, warm golden bulbs lit, the quiet street below blurred in golden-hour light",
      ],
      men: [
        "a vintage cinema marquee at night on a dark empty street, cold bulbs lit, desaturated tones, wet asphalt reflections below",
        "an old theater marquee at night against a black sky, stark white bulbs, the street below dissolved into darkness",
      ],
    },
    screenWord: "board",
    sizeHint:
      "at least two thirds of the frame's width — shot from close below so the marquee dominates the composition",
    orientation: "WIDE and horizontal (landscape, like a marquee board)",
    textMedium:
      "black changeable marquee letters slotted into the tracks of the backlit white board, lit by the surrounding rows of bulbs, a couple of letters sitting very slightly crooked",
  },
  chalkboard: {
    scenes: {
      women: [
        "an A-frame chalkboard sign on the sidewalk outside a small flower shop at dusk, warm string lights blurred behind it",
        "an A-frame chalkboard sign outside a cozy cafe at dusk, warm window glow spilling onto the pavement around it",
      ],
      men: [
        "an A-frame chalkboard sign on a dark sidewalk outside a closed coffee shop at night, one streetlight, moody shadows",
        "an A-frame chalkboard sign outside a dark gym entrance at night, cold light from a doorway, desaturated tones",
      ],
    },
    screenWord: "board",
    sizeHint:
      "at least two thirds of the frame's height and more than half its width — shot CLOSE so the chalkboard dominates the composition",
    orientation: "TALL and vertical (portrait, like an A-frame board)",
    textMedium:
      "hand-written white chalk lettering with real chalk texture — slightly dusty strokes, faint smudges, uneven pressure, written by a human hand",
  },
  paper: {
    scenes: {
      women: [
        "a handwritten note on cream paper lying on a wooden nightstand in warm lamplight, a mug of tea blurred beside it",
        "a handwritten note on soft ivory paper on rumpled linen bedding at night, warm dim lamp glow across it",
      ],
      men: [
        "a handwritten note on white paper lying on a dark desk at night, lit by one cold desk lamp, a watch blurred beside it",
        "a handwritten note on plain paper taped to a bathroom mirror's edge, dim cold light, the dark room blurred in the reflection",
      ],
    },
    screenWord: "page",
    sizeHint:
      "at least two thirds of the frame's height and more than half its width — shot from directly above or a natural reading angle, CLOSE so the page dominates",
    orientation: "TALL and vertical (portrait, like a sheet of paper)",
    textMedium:
      "legible handwritten ink lettering in a natural human hand — pen strokes pressed into the paper's fiber, ink weight varying slightly, imperfect but easy to read",
  },
};

/**
 * Prompt for a scene photo where the quote is TYPESET DIRECTLY into the
 * surface by gpt-image-2 (2026-09-11, per Keenan: the composited
 * white-box look was "still not blending in. it should just be
 * letters. the letters need to be BUILT IN to the poster, sign, phone
 * screen... one cohesive picture without a blank white text box").
 * The exact quote goes into the image prompt; verifyBakedQuote checks
 * the rendered letters afterwards.
 */
export function buildBakedQuotePrompt(
  audience: MoodyAudience,
  surface: QuoteSurface,
  quote: string
): string {
  const spec = QUOTE_SURFACE_SPECS[surface];
  const scenes = spec.scenes[audience];
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const palette =
    audience === "men"
      ? "Desaturated, near-monochrome, cool dark tones"
      : "Warm, dim, intimate amber tones";
  return `A real photograph, vertical 9:16: ${scene}. The ${spec.screenWord} displays this text and NOTHING else — rendered EXACTLY, word for word, all lowercase, every word spelled perfectly, no words added, no words missing:

"${quote}"

The text appears as ${spec.textMedium}. The letters are physically PART of the ${spec.screenWord} — they share its exact perspective, lighting, color cast, texture, and grain, photographed together in one shot. The lettering MUST BLEND into the ${spec.screenWord} and its background: it inherits the surface's glow, reflections, wear, and material, sits behind any glare or shadow that falls across the surface, and follows the surface's curvature and angle precisely. If someone zoomed in, nothing about the letters would look added afterward. NEVER a flat white box, NEVER a pasted-on panel, NEVER an overlay, sticker, or mockup look — one cohesive photograph. The text breaks over several lines with natural spacing and is large enough to read easily on a phone. COMPOSITION: the ${spec.screenWord} is ${spec.orientation} and fills ${spec.sizeHint}. A natural, slightly imperfect camera angle is good — this must feel like a candid photo someone actually took. ${palette}, DIM overall, moody available light, authentic photographic grain, shallow depth of field on the surroundings while the text stays tack sharp and clearly legible against its background. NO other text, words, letters, numbers, or logos anywhere else in the image.`;
}

/**
 * Vision QA for baked quote slides: gpt-image-2 renders short lowercase
 * text well but can still typo, duplicate, or drop a word. Claude reads
 * the final slide and confirms the rendered text matches word-for-word.
 * Returns false on API failure — callers treat that as "unverified",
 * never as a hard error.
 */
export async function verifyBakedQuote(
  image: Buffer,
  quote: string
): Promise<boolean> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: image.toString("base64"),
              },
            },
            {
              type: "text",
              text: `Does the main text displayed in this image read EXACTLY as follows — every word present, in order, spelled correctly, with no words added, duplicated, or missing?\n\n"${quote}"\n\nIgnore incidental device UI (clock, battery, signal bars, a small contact-name header) and line-break placement. Any garbled, misspelled, duplicated, or missing word means NO. Answer with ONLY the single word YES or NO.`,
            },
          ],
        },
      ],
    });
    const answer =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    return /^\s*yes\b/i.test(answer);
  } catch (err) {
    console.warn(
      `[carousel] Baked-quote verification call failed (treating as unverified): ${err instanceof Error ? err.message : err}`
    );
    return false;
  }
}

// ─── Image quality gate (2026-09-24 audit) ──────────────────────────
// Only baked-in text was ever verified; a murky, CGI-looking, garbled, or
// people-leaking moody image shipped as-is. One short vision review per
// image; carousel-generate regenerates once on a FAIL. Fail-OPEN: any
// error or refusal counts as a pass so the check can never block a post.
// Model: claude-opus-5 at low effort (the claude-api default; a cheaper
// model is Keenan's call to make). Sent at 768px wide to keep it cheap.
export async function checkMoodyImageQuality(
  image: Buffer,
  scene: string,
  opts: { personAllowed: boolean }
): Promise<{ ok: boolean; reason: string }> {
  try {
    const { default: sharp } = await import("sharp");
    const small = await sharp(image).resize({ width: 768 }).jpeg({ quality: 85 }).toBuffer();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      // effort is newer than this SDK version's types; the API accepts it.
      ...({ output_config: { effort: "low" } } as Record<string, unknown>),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") },
            },
            {
              type: "text",
              text: `You are a photo editor checking one AI-generated background photo before it is posted. The intended scene: "${scene}"

FAIL it if ANY of these is clearly true:
1. It looks like CGI, a 3D render, an illustration, or a painting rather than a real photograph.
2. There are smeared, melted, garbled, or malformed areas (warped objects, broken anatomy, mangled hands or faces).
3. Any readable text, letters, numbers, logos, or watermarks appear.
4. ${opts.personAllowed ? "More than the people the scene describes appear." : "A person appears, unless the scene explicitly describes a distant armored warrior, a rider, or a statue."}
5. It is so dark or murky that the main subject cannot be made out.
6. It clearly does not show the intended scene's main subject.

Otherwise PASS. Reply with exactly PASS, or FAIL: followed by a few words naming the problem.`,
            },
          ],
        },
      ],
    });
    if ((response as { stop_reason?: string }).stop_reason === "refusal") {
      return { ok: true, reason: "check refused — passed through" };
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    if (/^fail/i.test(text)) return { ok: false, reason: text.replace(/^fail:?\s*/i, "").slice(0, 160) };
    return { ok: true, reason: "pass" };
  } catch (err) {
    console.warn(
      `[carousel] Image quality check failed (treating as pass): ${err instanceof Error ? err.message : err}`
    );
    return { ok: true, reason: "check errored — passed through" };
  }
}

// ─── Five new lanes (2026-09-14 night, per Keenan: "do 1, 2, 3 for
// ripple, and 3. and 4. for bwk") ────────────────────────────────────
// Ripple: TEXTS-YOUNGER ("texts to my younger self"), PERMISSION
// ("permission slips"), LETTER ("the unsent letter"). BWK:
// DISCIPLINE-REAL ("what discipline actually looks like"),
// FUTURE-TEXTS ("texts from your future self"). Keenan also asked to
// "get creative with more variation amongst image lanes and themes
// that would match" — so each lane carries its own THEME-MATCHED scene
// pool (the bath for rest, the parked car before dawn for the unseen
// hours) instead of reusing the generic briefs.

// ─── PERMISSION SLIPS (Ripple) ───────────────────────────────────────
// One line of quiet permission per slide — the listicle cousin of the
// dead SIGN format ("THIS IS YOUR SIGN TO..."), multi-slide and
// second-person. Scenes are theme-matched: thresholds and endings of
// the day, each echoing its slide's permission where possible.

const PERMISSION_SCENES = `SCENES: soft, aesthetically pleasing FEMININE photography in warm LOW light, every location a quiet THRESHOLD or END-OF-DAY moment that MATCHES the permission being given — a phone face-down on a nightstand under warm lamplight, a bath running with steam curling in candlelight, a bed left unmade in soft evening light, a car parked in a dark driveway with the porch light glowing ahead, a laptop closed on a kitchen table at dusk, a robe over a chair with the day's clothes left where they fell, a book open face-down beside a cooling cup of tea, an armchair in one pool of lamplight, a door pulled quietly shut at the end of a dark hallway, a dinner table left uncleared under one low lamp, an unanswered doorbell seen from a warm lit kitchen. Muted, warm, dreamy — quiet luxury after dark. Every scene DIM (white text must read on it), soft shadows, intimate, NO people ever. These are INSPIRATION, not a menu — invent new theme-matched locations and vary the vantage and time of evening so no two posts look alike. Where you can, let each scene quietly echo its slide's permission (the running bath for rest, the face-down phone for unavailability, the closed laptop for enough).`;

const PERMISSION_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account for women. Each post is a cover + slides of white text centered on warm, dim cinematic photography. The niche: PERMISSION SLIPS — each slide is ONE line of quiet permission she has been waiting for someone to give her.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. Each permission should release something she already wants to do but feels she must earn, explain, or apologize for.
VOICE: warm, certain, plain. Permission, never pressure. A wise friend saying "you're allowed" and meaning it. Never preachy, never girlboss, never clinical.

${PERMISSION_SCENES}

RULES:
- "title": the cover text — 2-4 words, works in ALL CAPS, and it must PULL her into the slides ("PERMISSION GRANTED", "YOU'RE ALLOWED...", "TAKE THESE"). Never a passive label or topic name. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say — and it must fit what the slides deliver. If a title reads odd, garbled, or random without the slides, it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item's "lines": exactly ONE line — the permission. 6-16 words, plain words. Most may start "you're allowed to..." but VARY the opener across the post ("you can...", "it's okay to...", "you don't have to...") so it never reads like a template.
- Each permission releases a DIFFERENT weight: rest, availability, saying no, imperfection, spending on herself, letting a friendship fade, leaving things unfinished, going to bed early. Never two on the same weight. Every permission SMALL and concrete — never dramatic (no quitting jobs, no leaving marriages).
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location, matched to its slide's permission where possible.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["..."], "scene": "..." }
  ]
}`;

/** Generate one permission-slips topic (women / Ripple). Single-line
 *  slides like questions; 4-6 permissions per post. */
export async function generatePermissionTopic(
  recentHeadlines: string[],
  feedback?: string | null
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "permission-carousel-topic",
    // Cover rolls a Ripple family (2026-09-18 variety pass); item
    // scenes stay theme-matched thresholds per PERMISSION_SCENES.
    system: `${PERMISSION_SYSTEM_PROMPT}\n\n${rollWomenCoverRule()}`,
    user: `Write one new permission-slips post with exactly ${itemCount} permissions.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "permission",
    requireName: false,
    minLines: 1,
    minItems: 4,
    maxItems: itemCount,
  });
}

// ─── WHAT DISCIPLINE ACTUALLY LOOKS LIKE (BWK) ───────────────────────
// Myth-vs-truth pairs: the item name is the romanticized myth, the
// lines are the boring, unglamorous reality. Shares the BWK visual DNA
// and cover-family rotation.

const DISCIPLINE_REAL_THEME = `THEME — every post belongs to the WHAT DISCIPLINE ACTUALLY LOOKS LIKE family: stripping the romance off discipline. EXCEPTION to the name rule: each item's "name" is the romanticized MYTH, 2-6 words ending with a period ("The 4am club.", "Monk mode.", "Beast mode every day.") — the version people post about. The lines then state the mundane, unglamorous TRUTH in one or two plain sentences (the same bedtime kept for 200 nights, the workout done bored on a Tuesday, the meal prepped on a Sunday nobody claps for, the phone left in another room again) and close on a short 2-5 word command ("Do it bored.", "Repeat tomorrow."). The unspoken thesis of every post: discipline is boring, and boring is why it works. Rotate the myths every post — sleep, training, food, focus, money, the phone, mornings, saying no — so no two posts repeat. Titles live in the family too ("THE BORING TRUTH" / "WHAT IT ACTUALLY LOOKS LIKE..." energy) without repeating a recent title.`;

/** Generate one what-discipline-actually-looks-like topic (men / BWK).
 *  Myth as the "Name." header, mundane truth in the lines. */
export async function generateDisciplineRealTopic(
  recentHeadlines: string[],
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "discipline-real-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: DISCIPLINE_REAL_THEME,
      coverRule: rollMenCoverRule(sceneFamily),
    }),
    user: `Write one new what-discipline-actually-looks-like post with exactly ${itemCount} myth-vs-truth items.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "discipline-real",
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: itemCount,
    brand: "bwk",
  });
}

// ─── THE UNSENT LETTER (Ripple) ──────────────────────────────────────
// 2-slide sibling of phone-quote: photo cover + the letter handwritten
// on paper (the "paper" baked surface, FORCED in carousel-daily.ts).
// Returns a PhoneQuoteTopic so the whole phone-quote pipeline (baked
// generation, vision verify, save/email) is reused unchanged. Distinct
// from the DEAD 2026-08-29 "unsent" texts lane — different format,
// different slug prefix.

const LETTER_SYSTEM_PROMPT = `You write 2-slide posts for a soft, feminine account for women roughly 40-50 carrying a heavy mental load. Slide 1 is a photograph with a lowercase sentence-case hook; slide 2 is a handwritten letter on paper — a letter that was never sent.

- "hook": the cover line, 5-12 words, lowercase sentence case, intimate and confessional, ending with "..." — it frames the letter without revealing it ("i wrote this and never sent it...", "this has been sitting in my drawer for years...", "i finally put it on paper..."). Vary the framing every post — never reuse a recent hook's framing.
- "letter": 25-55 words, ALL lowercase, 3-5 short plain sentences — the unsent letter itself. Rotate WHO it's for every post: her younger self, the friend who drifted away, her mother, the version of her that kept going, the person she was before everyone needed her, her body, the house they left behind. It may open with a short address ("to the friend i lost to the years,") or just begin. The shape: something true and a little heavy, then a turn into tenderness or release. It must read like something a real woman would write at midnight and never send — warm, plain words, no clichés stacked on clichés. NO signature, NO quotation marks, NO emojis, NO hashtags.
- "coverScene": one concrete sentence for the photograph — letter-writing still-lifes at night: blank cream stationery and a fountain pen in a pool of warm lamplight, an opened envelope beside a low candle, a folded note in an open nightstand drawer, notepaper on a dark wood desk by rain-streaked glass, a shoebox of old letters on a bed in lamplight. DIM, warm, intimate, NO people, NO readable text in the scene. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "letter": "..." }`;

/** Generate one unsent-letter topic (women / Ripple, 2-slide).
 *  2026-09-23: cross-lane headline dedupe, one retry on a repeat hook. */
export async function generateLetterTopic(
  recentHeadlines: string[],
  feedback?: string | null
): Promise<PhoneQuoteTopic> {
  return withHeadlineRetry({
    label: "letter-carousel-topic",
    generate: (extra) => generateLetterTopicOnce(recentHeadlines, feedback, extra),
    headlineOf: (t) => t.hook,
  });
}

async function generateLetterTopicOnce(
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<PhoneQuoteTopic> {
  const { prisma } = await import("@/lib/prisma");
  const purpose = "letter-carousel-topic";
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      system: `${LETTER_SYSTEM_PROMPT}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new unsent-letter post.${avoidBlock(recentHeadlines, feedback)}${extra}\n\nReturn ONLY valid JSON.`,
        },
      ],
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      hook?: string;
      coverScene?: string;
      letter?: string;
    };
    const hook = (parsed.hook ?? "").trim();
    const coverScene = (parsed.coverScene ?? "").trim();
    const letter = (parsed.letter ?? "").trim();
    const letterWords = letter.split(/\s+/).length;
    if (!hook || !coverScene || !letter || letterWords < 15 || letterWords > 70) {
      throw new Error(
        `${purpose} unusable: hook="${hook}", letter ${letterWords} words`
      );
    }

    const slug = hook
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    // Humanizer approval gate — hook + letter only, never the
    // coverScene image direction. Fails open on error.
    let gatedHook = hook;
    let gatedLetter = letter;
    try {
      const gated = await humanizePass({
        purpose: `humanize:${purpose}`,
        voice: extractVoice(LETTER_SYSTEM_PROMPT),
        payload: { hook, letter },
      });
      const gw =
        typeof gated.letter === "string"
          ? gated.letter.trim().split(/\s+/).length
          : 0;
      if (
        typeof gated.hook === "string" &&
        gated.hook.trim() &&
        gw >= 15 &&
        gw <= 70
      ) {
        gatedHook = gated.hook.trim();
        gatedLetter = gated.letter.trim();
      }
    } catch (err) {
      console.warn(
        `[content-factory] humanize gate failed for ${purpose} — shipping ungated copy:`,
        err
      );
    }

    return {
      slug: `letter-${slug}`,
      hook: gatedHook,
      coverScene,
      quote: gatedLetter,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// ─── TEXT-MESSAGE lanes: TEXTS-YOUNGER (Ripple) / FUTURE-TEXTS (BWK) ─
// Multi-slide texts baked into phone-in-hand photos: cover hook + one
// message bubble per slide, rendered by gpt-image-2 with the same
// blend mandate and vision verification as the baked phone-quote
// pipeline. texts-younger = SENT bubbles to "younger me" (2-4 texts);
// future-texts = RECEIVED bubbles from "future me" (1-2 texts).

export type TextsLane = "texts-younger" | "future-texts";

export interface TextsTopic {
  slug: string;
  /** Sentence-case cover hook, e.g. "texts i'd send my younger self..." */
  hook: string;
  coverScene: string;
  /** One text message per slide, in order. */
  messages: string[];
}

const TEXTS_SYSTEM: Record<TextsLane, string> = {
  "texts-younger": `You write multi-slide text-message posts for a soft, feminine account for women roughly 40-50 carrying a heavy mental load. Slide 1 is a photograph with a lowercase sentence-case hook; each following slide is a photo of a phone showing ONE text message she is sending to her younger self.

- "hook": the cover line, 5-12 words, lowercase sentence case, intimate, ending with "...". EVERY hook MUST explicitly name the younger self: include "my younger self", "younger me", "the girl i was", or a specific age ("to 25-year-old me..."). NEVER an unanchored "her"/"she" — a reader seeing only the cover must instantly know these are texts to her OWN younger self, not to another person ("texts i'd send my younger self...", "what the girl i was needed to hear...", "messages to 25-year-old me..."). Vary the framing every post — but the younger-self anchor is non-negotiable.
- "messages": 2-4 texts, each 8-25 words, ALL lowercase — messages from the woman she is now to the girl she was. Each text lands on a DIFFERENT age and a DIFFERENT wound: the friendship that ends anyway, the body she picked apart, the no she was afraid to say, the thing that felt like the end and wasn't, the years she spent making herself smaller. Plain text-message language — the way a real person actually texts at midnight, warm and direct, second person. One text may be lighter to break the ache. NO emojis, NO hashtags, NO quotation marks.
- "coverScene": one concrete sentence for the photograph, following the COVER SCENE RULE below. DIM, warm, intimate, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "messages": ["...", "..."] }`,
  "future-texts": `You write text-message posts for a dark, moody, minimal account for young aspiring men (18-30) in the self-improvement / discipline niche. Slide 1 is a photograph with a lowercase sentence-case hook; each following slide is a photo of a phone showing ONE text message arriving from his future self.

- "hook": the cover line, 5-12 words, lowercase sentence case, ending with "..." ("a text from the man you're becoming...", "your future self finally texted back...", "this came from ten years ahead..."). Vary the framing every post — never reuse a recent hook's framing.
- "messages": 1-2 texts, each 12-30 words, ALL lowercase — messages from the man he becomes to the man he is now. Calm command energy: what mattered, what didn't, what he's glad he did NOW ("the nights you trained alone are the reason i exist. don't skip tonight."). Plain declarative text-message language, second person, never bro-slang, never yelling. Each text a DIFFERENT angle. NO emojis, NO hashtags, NO quotation marks.
- "coverScene": one concrete sentence for the photograph, following the COVER SCENE RULE below. DIM, desaturated, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "messages": ["..."] }`,
};

/** Generate one text-message topic for either texts lane.
 *  2026-09-23: cross-lane headline dedupe, one retry on a repeat hook. */
export async function generateTextsTopic(
  lane: TextsLane,
  recentHeadlines: string[],
  feedback?: string | null
): Promise<TextsTopic> {
  return withHeadlineRetry({
    label: `${lane}-topic`,
    generate: (extra) => generateTextsTopicOnce(lane, recentHeadlines, feedback, extra),
    headlineOf: (t) => t.hook,
  });
}

async function generateTextsTopicOnce(
  lane: TextsLane,
  recentHeadlines: string[],
  feedback: string | null | undefined,
  extra: string
): Promise<TextsTopic> {
  const { prisma } = await import("@/lib/prisma");
  const purpose = `${lane}-topic`;
  const men = lane === "future-texts";
  const maxMessages = men ? 2 : 4;
  const minMessages = men ? 1 : 2;
  const start = Date.now();
  // Reddit audience pulse (2026-09-17) — soft, angle inspiration only.
  let pulse = "";
  try {
    const { getAudiencePulse } = await import("./reddit-trends");
    pulse = await getAudiencePulse(men ? "bwk" : "ripple");
  } catch {
    /* soft — generate without the pulse */
  }
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      // Both funnels rotate cover families — men use the BWK families,
      // women the Ripple families (2026-09-18 variety pass).
      system: `${TEXTS_SYSTEM[lane]}\n\n${men ? rollMenCoverRule() : rollWomenCoverRule()}${pulse}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new post.${avoidBlock(recentHeadlines, feedback)}${extra}\n\nReturn ONLY valid JSON.`,
        },
      ],
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
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      hook?: string;
      coverScene?: string;
      messages?: string[];
    };
    const hook = (parsed.hook ?? "").trim();
    const coverScene = (parsed.coverScene ?? "").trim();
    const messages = (parsed.messages ?? [])
      .filter((m): m is string => typeof m === "string" && !!m.trim())
      .map((m) => m.trim())
      .slice(0, maxMessages);
    if (!hook || !coverScene || messages.length < minMessages) {
      throw new Error(
        `${purpose} unusable: hook="${hook}", ${messages.length} valid messages`
      );
    }

    const slug = hook
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60);

    // Humanizer approval gate — hook + messages, never the coverScene
    // image direction. Fails open on error.
    let gatedHook = hook;
    let gatedMessages = messages;
    try {
      const gated = await humanizePass({
        purpose: `humanize:${purpose}`,
        voice: extractVoice(TEXTS_SYSTEM[lane]),
        payload: { hook, messages },
      });
      if (
        typeof gated.hook === "string" &&
        gated.hook.trim() &&
        Array.isArray(gated.messages) &&
        gated.messages.length === messages.length &&
        gated.messages.every((m) => typeof m === "string" && m.trim())
      ) {
        gatedHook = gated.hook.trim();
        gatedMessages = gated.messages.map((m) => m.trim());
      }
    } catch (err) {
      console.warn(
        `[content-factory] humanize gate failed for ${purpose} — shipping ungated copy:`,
        err
      );
    }

    return {
      slug: `${lane}-${slug}`,
      hook: gatedHook,
      coverScene,
      messages: gatedMessages,
    };
  } catch (err) {
    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model: CLAUDE_MODEL,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: Date.now() - start,
        success: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      },
    });
    throw err;
  }
}

// Phone-in-hand scene pools for the baked message slides — the
// "creative variation" pass (2026-09-14, per Keenan): every location
// matches the lane's emotional register instead of a generic desk shot.
const TEXTS_PHONE_SCENES: Record<TextsLane, string[]> = {
  "texts-younger": [
    "a woman's hand holding an iPhone in a dim lamp-lit bedroom at night, a soft knit blanket blurred behind",
    "a woman's hands cradling an iPhone at a kitchen table at night, a steaming mug of tea blurred beside it",
    "a woman's hand holding an iPhone in the driver's seat of a car parked at dusk, rain beading on the windshield",
    "a woman's hand holding an iPhone on a porch swing at dusk, warm string lights blurred behind",
    "a woman's hand holding an iPhone beside a candlelit bath at night, flames blurred into soft glowing orbs",
    "a woman's hand holding an iPhone on a bed beside a folded stack of laundry, one warm lamp glowing",
    "a woman's hand holding an iPhone by a rain-streaked window at night, golden lamplight reflected in the glass",
  ],
  "future-texts": [
    "a man's hand holding an iPhone in an empty gym at night, one cold overhead light, a loaded barbell blurred behind",
    "a man's hand holding an iPhone in a parked car before dawn, dashboard glow, an empty street beyond the windshield",
    "a man's hand holding an iPhone on a rooftop at night, city lights blurred into bokeh far below",
    "a man's hand holding an iPhone at a dark desk at night, a single lamp and an open notebook blurred behind",
    "a man's hand holding an iPhone in a bare concrete stairwell under one cold light",
    "a man's hand holding an iPhone at the edge of an empty running track at dawn, lane lines dissolving into mist",
    "a man's hand holding an iPhone on a loading dock at night, rain falling through one sodium light beyond",
  ],
};

/**
 * Prompt for a phone-in-hand photo where ONE message bubble is typeset
 * directly into the screen by gpt-image-2 — same blend mandate as
 * buildBakedQuotePrompt, but the surface is always a messages thread.
 */
export function buildBakedTextsPrompt(lane: TextsLane, message: string): string {
  const scenes = TEXTS_PHONE_SCENES[lane];
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const women = lane === "texts-younger";
  const palette = women
    ? "Warm, dim, intimate amber tones"
    : "Desaturated, near-monochrome, cool dark tones";
  const contact = women ? "younger me" : "future me";
  const bubble = women
    ? "ONE sent message bubble aligned to the RIGHT of the thread — a soft blue rounded bubble with white text, as if she just sent it"
    : "ONE received message bubble aligned to the LEFT of the thread — a dark gray rounded bubble with white text, as if it just arrived";
  return `A real photograph, vertical 9:16: ${scene}. The phone's screen shows a text-messaging conversation: at the very top of the screen, the contact name "${contact}" in small letters; below it, ${bubble}, containing this text and NOTHING else — rendered EXACTLY, word for word, all lowercase, every word spelled perfectly, no words added, no words missing:

"${message}"

The message bubble is large and fills most of the screen's width, the text breaking over several lines with natural spacing, large enough to read easily on a phone. The screen's glow, the lettering, and the interface are physically PART of the phone — they share its exact perspective, tilt, reflections, and the scene's lighting, photographed together in one shot. The lettering MUST BLEND into the screen: it sits behind any glare that falls across the glass and follows the screen's angle precisely. If someone zoomed in, nothing about the text would look added afterward. NEVER a flat white box, NEVER a pasted-on panel, NEVER an overlay, sticker, or mockup look — one cohesive photograph. COMPOSITION: the phone is TALL and vertical and fills at least two thirds of the frame's height — held CLOSE to the camera. A natural, slightly imperfect camera angle is good — this must feel like a candid photo someone actually took. ${palette}, DIM overall, moody available light, authentic photographic grain, shallow depth of field on the surroundings while the screen text stays tack sharp and clearly legible. NO other text, words, letters, numbers, or logos anywhere else in the image — no keyboard, no timestamps, no other messages.`;
}

// ─── SPEC-DRIVEN LANES (2026-09-15, lanes-as-data) ───────────────────
// Part of the co-pilot lane system (per Keenan: weekly try-new /
// kill-underperforming lanes, with his oversight). Every hard-coded
// moody-family lane above is one shared core call + a THEME string +
// a few flags — this section turns that recipe into data so a NEW lane
// can be born as a ContentLane DB row (template "moody") with no code
// change or deploy. Legacy lanes keep their bespoke generators; only
// born lanes flow through here.

/** The tunable part of a ContentLane row's `spec` JSON (template
 *  "moody"). `theme` is the lane's soul — written in the same
 *  "THEME — every post belongs to the X family: ..." register as the
 *  hard-coded lane themes above (see SILENCE_THEME / WATCHING_THEME
 *  for the pattern, including rotation + title rules). */
export interface MoodyLaneSpec {
  /** Drives voice, scene DNA, caption pool, and brand visual rules. */
  audience: MoodyAudience;
  /** Locked lane theme, "THEME — every post belongs to..." register. */
  theme: string;
  /** true = items carry a "Name." header line (discipline/protocol
   *  style); false = headerless lines (memento/questions style). */
  named: boolean;
  /** Slide-count range; defaults 4-7 (the 2026-09-14 go-live shape). */
  minItems?: number;
  maxItems?: number;
  /** Reddit freelance lane (2026-09-17, per Keenan: "we'll have
   *  another lane per category that freelances posts based on
   *  reddit"). true = each post's SUBJECT is mandated by the day's
   *  strongest RedditTrendDigest theme; the spec theme stays the
   *  lane's standing voice/format brief. Soft: no digest = the lane
   *  generates from the base theme alone. */
  redditTheme?: boolean;
  /** Competitor mimic lane (2026-09-17, per Keenan: "use the content
   *  of others to generate two new lanes and posts daily"). true =
   *  each post runs the MECHANIC (hook/format/beat) of the day's
   *  strongest competitor mimic brief in our own voice. Soft: no
   *  brief = the lane generates from the base theme alone. */
  mimicBrief?: boolean;
}

/** Parse + validate a ContentLane.spec JSON blob. Returns null when
 *  the spec is unusable — callers treat that as a config error and
 *  fail the run loudly rather than generating off-brand content. */
export function parseMoodyLaneSpec(raw: unknown): MoodyLaneSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.audience !== "men" && s.audience !== "women") return null;
  if (typeof s.theme !== "string" || s.theme.trim().length < 40) return null;
  const minItems =
    typeof s.minItems === "number" && s.minItems >= 2 && s.minItems <= 10
      ? Math.floor(s.minItems)
      : undefined;
  const maxItems =
    typeof s.maxItems === "number" && s.maxItems >= 2 && s.maxItems <= 10
      ? Math.floor(s.maxItems)
      : undefined;
  return {
    audience: s.audience,
    theme: s.theme.trim(),
    named: s.named === true,
    minItems,
    maxItems,
    redditTheme: s.redditTheme === true,
    mimicBrief: s.mimicBrief === true,
  };
}

// ─── REDDIT SOLVE FORMAT (2026-09-19, per Keenan) ────────────────────
// "write posts that tell people exactly how to solve the issues
// they're dealing with in those reddit subthreads." The pulse lanes
// (spec.redditTheme) no longer bend the day's theme into the lane's
// standing format — every post is an independent PROBLEM → FIX build:
// the cover names the issue, each following slide is ONE concrete step
// of the solution. The writer picks from the top ranked themes so the
// same issue doesn't repeat while it sits atop the 7-day rolling
// blend. Soft: no digest = the lane falls back to its base spec theme.

const buildRedditSolveSystemPrompt = (
  audience: MoodyAudience,
  themes: import("./reddit-trends").RedditTheme[],
  sceneFamily?: string
): string => {
  const men = audience === "men";
  const issues = themes
    .map(
      (t, i) =>
        `${i + 1}. "${t.theme}" — ${t.why} Angle: ${t.angle}${t.phrases.length ? ` Their words: ${t.phrases.join(", ")}.` : ""}`
    )
    .join("\n");
  const header = men
    ? "You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + item slides of white text centered on cinematic photography."
    : WOMEN_PROMPT_HEADER.dark;
  return `${header} The niche: THE FIX — each post takes ONE real issue this audience is wrestling with right now and tells them EXACTLY how to solve it, one concrete step per slide.

${AUDIENCE_BRIEF[audience]}

LIVE AUDIENCE ISSUES (ranked, from today's research):
${issues}

PICK ONE issue — the strongest one that does NOT overlap anything in the avoid list. The whole post lives inside that single issue; never blend two.

${men ? SCENE_BRIEF.men : WOMEN_SCENE_BRIEFS.dark}

${men ? rollMenCoverRule(sceneFamily) : rollWomenCoverRule(sceneFamily)}

RULES:
- "title": the cover text — the chosen issue named so the reader instantly feels seen, in their own plain words. 3-8 words, works in ALL CAPS: ${men ? `a direct COMMAND that names the fix ("TAKE YOUR EVENINGS BACK" — shape only; see COVER COMMAND RULE)` : `either the pain as a direct question ("CAN'T SWITCH OFF AT NIGHT?") or a direct fix promise ("HOW TO GET YOUR EVENINGS BACK")`}. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN and name a problem a real person would recognize as theirs — if it reads vague, clever, or garbled without the slides, it is WRONG.
- The request tells you EXACTLY how many items to write. Each item is ONE step of the fix, in the exact order to do them. Each slide renders as: bold HEADER, one italic HOOK line, short BODY.
  - "name": the HEADER — the step as a short imperative in Title Case, 2-4 words, NO trailing period ("Move the Charger", "Send One Text", "Pick the Night").
  - "lines": EXACTLY 2 entries.
    - lines[0]: the HOOK — ONE short sentence on why this step works or what it breaks (renders in italics; must land on its own).
    - lines[1]: the BODY — EXACTLY what to do in 1-2 short sentences: specific actions, times, amounts, and the exact words to say where a script helps. Vague advice is BANNED: "set boundaries" is WRONG; "text back: i can't take that on this week." is RIGHT.
- HARD LIMIT: each slide's hook + body totals UNDER 30 words. Long = generic = scrolled past. Short = screenshotted and saved.
- Step 1 must be doable within the hour of reading. The final step may end on what changes after a week of doing this — a plain statement, never a pep talk.
- Every step is a DIFFERENT physical action. No theory slides, no mindset-only slides — every slide is something to actually DO.
- US English. No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI — and NEVER mention the research, any community, or trends.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above and the COVER SCENE RULE. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "..."], "scene": "..." }
  ]
}`;
};

/** Generate one topic for a spec-driven (DB-born) moody-family lane.
 *  Mirrors the hard-coded theme lanes: men get the BWK cover-family
 *  roll; women get the pinned-dark scene brief (Ripple has been
 *  scheme-pinned to dark since 2026-09-03, and the shared system
 *  prompt's header already describes the dark treatment). */
export async function generateSpecTopic(
  laneKey: string,
  spec: MoodyLaneSpec,
  recentHeadlines: string[],
  sceneFamily?: string,
  feedback?: string | null
): Promise<MoodyTopic> {
  const men = spec.audience === "men";
  const brand = men ? ("bwk" as const) : ("ripple" as const);
  const lo = Math.min(spec.minItems ?? 4, spec.maxItems ?? 7);
  const hi = Math.max(spec.minItems ?? 4, spec.maxItems ?? 7);
  const itemCount = lo + Math.floor(Math.random() * (hi - lo + 1));

  // Reddit solve lanes (2026-09-19, replaces the 09-17 mandated-subject
  // approach): the post becomes an independent PROBLEM → FIX build in
  // the solve format above. Soft: no digest (or any error) = fall
  // through to the lane's base spec theme.
  let mandate = "";
  if (spec.redditTheme) {
    try {
      const { getTopThemes } = await import("./reddit-trends");
      const themes = await getTopThemes(brand, 4);
      if (themes.length > 0) {
        return generateMoodyFamilyTopic({
          purpose: `lane-${laneKey}-topic`,
          system: buildRedditSolveSystemPrompt(
            spec.audience,
            themes,
            sceneFamily
          ),
          user: `Write one new solve-it post for the ${men ? "young aspiring men" : "women 40-50"} funnel with exactly ${itemCount} step slides.${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
          slugPrefix: laneKey,
          // The solve format always carries step-name headers,
          // regardless of the lane spec's `named` flag.
          requireName: true,
          minLines: 1,
          minItems: Math.min(lo, 4),
          maxItems: itemCount,
          // No `brand` pulse injection — the issues block IS the signal.
        });
      }
    } catch {
      /* soft — fall through to the base theme */
    }
  }

  // Mimic lanes (2026-09-17): the day's strongest competitor mimic
  // brief mandates the MECHANIC — hook shape, format, emotional beat —
  // never the words. Soft: no brief = base theme alone.
  if (spec.mimicBrief && !mandate) {
    try {
      const { getTopMimicBrief } = await import("./competitor-mimic");
      const b = await getTopMimicBrief(brand);
      if (b) {
        mandate = `\n\nTODAY'S MANDATED MECHANIC (from live creative research — build THIS post around it):\nHook mechanic: ${b.hook}\nFormat: ${b.format}\nWhy it lands: ${b.whyItWorks}\nHow we run it: ${b.howWeApply}${b.phrases.length ? `\nAudience words for the feeling: ${b.phrases.join(", ")}` : ""}\nRun this mechanic inside the lane's own subject matter and voice — never copy anyone's wording, never mention the research, any creator, or trends.`;
      }
    } catch {
      /* soft — generate without the mandate */
    }
  }

  return generateMoodyFamilyTopic({
    purpose: `lane-${laneKey}-topic`,
    system: buildMoodySystemPrompt(spec.audience, {
      theme: spec.theme,
      coverRule: men
        ? rollMenCoverRule(sceneFamily)
        : rollWomenCoverRule(sceneFamily),
      sceneBrief: men ? undefined : WOMEN_SCENE_BRIEFS.dark,
    }),
    user: `Write one new post for the ${men ? "young aspiring men" : "women 40-50"} funnel with exactly ${itemCount} items.${mandate}${avoidBlock(recentHeadlines, feedback)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: laneKey,
    // Every lane is headed (2026-09-25, per Keenan: header + italic
    // hook + body on ALL posts) — the spec's `named` flag is legacy.
    requireName: true,
    minLines: 2,
    minItems: Math.min(lo, 4),
    maxItems: itemCount,
    // Ambient pulse only for ordinary spec lanes — a mandated lane
    // (reddit or mimic) already carries its strongest signal, no
    // double injection.
    brand: spec.redditTheme || spec.mimicBrief ? undefined : brand,
  });
}
