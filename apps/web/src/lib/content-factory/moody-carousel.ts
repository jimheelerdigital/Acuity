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
  light: `SCENES: soft, aesthetically pleasing FEMININE photography in LIGHT, airy tones — morning sun through sheer linen curtains, cream silk bedding in a bright bedroom, white peonies in a glass vase on a pale table, a sunlit bath with steam rising, a light-washed vanity, a robe over a linen chair in soft daylight, tea steaming by a bright window, a balcony breakfast in early sun, a garden path after light rain, market flowers wrapped in paper on a pale counter, a lake seen from a wooden dock in soft morning light, white linen breathing on a line, a bright window seat with an open book — AND letter-writing still-lifes: blank cream stationery and a fountain pen on a pale desk in morning sun, an opened envelope beside a bright window, unwritten notepaper under soft daylight with a flower laid across it — AND quiet-house scenes: emotionally loaded empty rooms in daylight — a kitchen still and sunlit after everyone has left, a made bed in a child's old bedroom with curtains glowing, a hallway of small shoes by the door in morning light, a bright emptied living room with one cushion out of place. Cream, ivory, blush, soft gold — warm, dreamy, beautiful, never cluttered, and every scene SOFT and LIGHT (dark charcoal text must read on it). Gentle and airy, never dark or heavy. No people ever. These are INSPIRATION, not a menu — invent new light-airy locations (garden, coast, bright morning interiors, a sunlit balcony over a soft city, blank stationery, quiet emptied rooms) and vary the vantage and time of morning so no two posts look alike.`,
  dark: `SCENES: soft, aesthetically pleasing FEMININE photography in warm LOW light — silk bedding in candlelight, a kitchen table cleared after dinner lit by one warm lamp, dried flowers by a dark window, a bath steaming in flickering candlelight, a silk robe over a chair by rain-streaked night glass, a dark garden seen through a lit kitchen window, tea steaming under a single lamp at blue hour, an armchair and open book in a pool of lamplight, a lit porch at dusk with rain falling beyond, an emptied dining table with one chair pulled out at night — AND letter-writing still-lifes: blank cream stationery and a fountain pen in a pool of warm lamplight, an opened envelope beside a low candle, unwritten notepaper on a dark wood desk at night — AND quiet-house scenes: emotionally loaded empty rooms after dark — the kitchen after everyone is asleep lit by one small light, a made bed in a child's old bedroom at dusk, a porch light left on over an empty step, a hallway nightlight glowing at 2am. Muted, warm, dreamy — quiet luxury after dark, never harsh or cold. Every scene DIM (white text must read on it), soft shadows, intimate. No people ever. These are INSPIRATION, not a menu — invent new warm-evening locations (a candlelit bedroom, a rainy night window seat, a garden at dusk, blank stationery in lamplight, quiet sleeping-house rooms) and vary the vantage and time of evening so no two posts look alike.`,
};

// First sentence of every women-lane system prompt, by scheme — the
// text treatment must match the photography the scheme produces.
const WOMEN_PROMPT_HEADER: Record<WomenScheme, string> = {
  light:
    "You write text for a soft, light, feminine minimal photo-carousel account. Each post is a cover + slides of dark text centered on bright, airy photography.",
  dark: "You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography.",
};

export const SCENE_BRIEF: Record<MoodyAudience, string> = {
  men: `SCENES: dark, dramatic, luxurious photography in FOUR families (2026-09-10 library — nothing outside them): (1) DARK-LUXURY ARCHITECTURE — luxury buildings with a dark aesthetic and a DRAMATIC SKY (every building scene MUST have heavy cloud cover, cool cinematic lighting, or a burning sunset behind it): a black-glass penthouse tower with its crown wrapped in storm cloud, a cliff mansion glowing above a storm sea at dusk, a skyscraper silhouetted against a blood-orange sunset, a brutalist villa under rolling thunderheads. The building shot low and dramatic, grand and expensive, never a flat distant skyline, never a plain empty sky. (2) ALPHA WILDLIFE — one alpha animal commanding a super-cool landscape: a wolf on a cracked frozen lake beneath storm pines, a lion crossing black dunes under lightning, a stag on a ridgeline in blowing snow, an eagle sweeping low over a fjord, a panther on wet rock in night rain. Draw from the ENTIRE animal kingdom; the animal is the clear hero of the frame, the landscape epic around it; never reuse an animal from a recent post. (3) DARK-LUXURY OBJECTS — luxury items with a dark theme, shot like a high-end ad: a classic Ferrari gleaming under one cold garage spotlight, rain beading on an old-school Mercedes gullwing at night, a vintage Porsche on a wet mountain road at dusk, a Rolls-Royce grille in deep shadow, a Swiss watch on black marble, a signet ring beside a crystal tumbler in lamplight, a private jet on wet tarmac at night. CAR RULE: rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce, Aston Martin, anything timeless, luxurious, and inspiring; modern Lamborghini-style supercars only rarely, never the default. One hero object, deep shadow, tactile hyperreal detail — the object must be unmistakably LUXURY and dramatic, NEVER notebooks, journals, pens, books, desks, paperwork, or any flat office/stationery still-life. (4) EPIC WARRIORS — a lone armored warrior seen from a DISTANCE in an epic snowy atmosphere: a medieval knight, a spartan, a samurai, a viking, any legendary warrior in FULL armor (gleaming silver, burnished gold, or blackened steel), DOING something powerful — mid-stride walking alone into the storm, arms flexed in triumph with head raised to the sky, driving a sword into the frozen ground, climbing a ridgeline against the wind. The pose reads in silhouette and radiates STRENGTH, CONSISTENCY, and DRIVE — the frame should make a man want to get to work. WIDE cinematic framing in an immense frozen landscape, NEVER close to the camera, never a close-up; falling snow and storm atmosphere do the work; face never visible (helmet on, visor down, or too distant to read). Desaturated, near-monochrome, night or storm light. Every scene DIM and shadowed (white text must read on it), austere and powerful. ANTI-BLAND RULE (non-negotiable): every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape, never bare ground, reeds, or a plain horizon with nothing commanding the frame. NO people EVER — write every scene EMPTY of humans, with exactly two exceptions inside their own families: ONE lone alpha animal in wildlife scenes, and ONE distant armored warrior (face never visible) in warrior scenes. UNLIMITED LIBRARY RULE: every example above is a SEED, not a menu — INVENT a brand-new scene for every single slide of every post (new subject, new location, new season, new weather, new time, new vantage) within these four families, and never render an example verbatim or repeat a scene from a recent post. No two images across any posts should ever look alike.`,
  women: WOMEN_SCENE_BRIEFS.light,
};

const buildMoodySystemPrompt = (
  audience: MoodyAudience,
  opts?: { theme?: string; coverRule?: string }
) => `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + 5 item slides of white text centered on cinematic photography.

${AUDIENCE_BRIEF[audience]}
${opts?.theme ? `\n${opts.theme}\n` : ""}
${SCENE_BRIEF[audience]}
${opts?.coverRule ? `\n${opts.coverRule}\n` : ""}
FORMAT — study this real slide and match its rhythm exactly:
"Reset day.

Clean your space, organize your room, car, digital files, notes.

Chaos outside = chaos inside.

Bring order back."

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past. 2-4 words, works in ALL CAPS, and it must PULL the reader into the slides: either a direct command to act ("EARN YOUR SILENCE", "HOLD THE LINE") or a direct prompt to engage what's inside ("READ THESE SLOWLY", "ANSWER THIS FIRST..."). Never a passive label or topic name. No number. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must fit what the slides deliver. Do NOT stitch together or remix the example phrases; if a title reads odd, garbled, or random without the slides ("DON'T LIE NOW"), it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item:
  - "name": 1-3 words + period ("Reset day.", "Go quiet.").
  - "lines": 2-3 short paragraphs. First expands the item concretely in one sentence (can use lists: "room, car, digital files, notes"). Optional middle line: a compressed truth, equations welcome ("Chaos outside = chaos inside."). Last line: a 2-5 word command ("Bring order back.").
- Every sentence short. No commas chained past two. No metaphors that need decoding. Read it out loud — it should sound inevitable, not written.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to" or "consider". Never mention any app, product, journaling, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather, materials) following SCENES above. Every scene in the post is a DIFFERENT location — vary boldly.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "name": "...", "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/**
 * Shared generation core for every moody-family carousel (discipline,
 * memento, questions): one Claude call, ClaudeCallLog bookkeeping, JSON
 * parse + validation, slug. `requireName` is off for formats whose
 * slides carry no "N. Name." header (memento/questions); `minLines`
 * allows single-line slides (questions).
 */
async function generateMoodyFamilyTopic(opts: {
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
}): Promise<MoodyTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 2000,
      // HUMAN_VOICE_RULES (2026-09-04): prevention layer — the full
      // humanizer gate still runs on the output below.
      system: `${opts.system}\n\n${HUMAN_VOICE_RULES}`,
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
function avoidBlock(recentHeadlines: string[]): string {
  return recentHeadlines.length > 0
    ? `\n\nRECENT POSTS — this ground is already covered:\n${recentHeadlines.map((h) => `- ${h}`).join("\n")}\nYour post must be genuinely NEW against that list — not the same ideas under a different title. Do not re-teach the same points, reuse the same subjects or numbers, or mirror the same structure. Take an angle the list hasn't touched.`
    : "";
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
const SILENCE_THEME = `THEME — every post belongs to the SILENCE family: moving in silence, building in private, working unseen, no announcements, letting results speak. Rotate the angle every post — going quiet for a season, killing announcement culture, private standards nobody sees, disappearing to build, the quiet hours before the world wakes, winning without telling anyone — so no two posts repeat, but every post is unmistakably a silence post. Titles live in the family too ("EARN YOUR SILENCE" energy) without repeating a recent title.`;

// DORMANT 2026-09-10 (per Keenan: "change 'hold the line' to a
// new-style discipline line" — replaced by the WATCHING lane below).
// Kept for revival, like every retired format.
const LINE_THEME = `THEME — every post belongs to the HOLD THE LINE family: endurance, standards that do not move, staying when it gets hard, refusing to break the streak, holding position when motivation dies. Rotate the angle every post — holding the morning line, standards under pressure, the days nobody claps, finishing what the first week started, never negotiating with yourself — so no two posts repeat, but every post is unmistakably a hold-the-line post. Titles live in the family too ("HOLD THE LINE" energy) without repeating a recent title.`;

// ─── Three discipline lanes (2026-09-10, per Keenan) ─────────────────
// "replace [hold the line] with 2 [WHEN NO ONE'S WATCHING], and also
// add 'pay the price' line, and a 'prove it' one too." All three are
// moody-family men's lanes sharing the BWK visual DNA + cover-family
// rotation; each has its own locked theme.
const WATCHING_THEME = `THEME — every post belongs to the WHEN NO ONE'S WATCHING family: private discipline — what a man does when nobody would ever know either way. Every item is a private test: the bed made in an empty house, the workout that never gets posted, the alarm kept on a free morning, the food logged with no one checking, the promise kept to himself alone at midnight. The tension is always integrity vs audience — who he is when there is no camera, no story, no applause. Rotate the angle every post — the 5am hours nobody sees, standards kept in hotel rooms, what he does after everyone is asleep, the reps counted honestly when lying would be free — so no two posts repeat, but every post is unmistakably about the unwatched hours. Titles live in the family too ("WHEN NO ONE'S WATCHING..." energy) without repeating a recent title.`;

const PRICE_THEME = `THEME — every post belongs to the PAY THE PRICE family: naming the REAL cost of the life he says he wants — the sleep, the comfort, the nights out declined, the friends who stop calling, the opinions ignored, the years of looking stupid before it works. Each item names ONE price in plain, unsentimental terms: what exactly gets paid, and what paying it buys. No romanticizing — it should read like an itemized bill. EXCEPTION to the last-line rule: the FINAL item's last line must be exactly "Still want it?" — the one place a command becomes a question. Rotate the goal every post — the body, the money, the freedom, the skill, the name — so no two posts repeat. Titles live in the family too ("PAY THE PRICE." energy) without repeating a recent title.`;

const PROVE_THEME = `THEME — every post belongs to the PROVE IT family: call-out energy. Every item takes a claim men love to make and turns it into what TODAY has to look like if the claim is true. EXCEPTION to the name rule: each item's "name" is the claim itself, 3-6 words ending with a period ("I want the money.", "I'm built different.", "I want the body.") — no quotation marks. The lines then convert the claim into one concrete, checkable action for today (a time, a count, a rule) and close on a short command with "prove it" energy ("Prove it before noon."). The unspoken thesis of every post: talk is free, the calendar doesn't lie. Rotate the claims every post — money, physique, discipline, skill, independence, focus — so no two posts repeat. Titles live in the family too ("PROVE IT." energy) without repeating a recent title.`;

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
const MEN_COVER_FAMILIES: { name: string; brief: string }[] = [
  {
    name: "dark-luxury architecture",
    brief:
      "luxury buildings with a dark aesthetic and a DRAMATIC SKY — every building scene MUST have heavy cloud cover, cool cinematic lighting, or a burning sunset behind it: a black-glass penthouse tower with its crown wrapped in storm cloud, a modern cliff mansion glowing above a storm-lit sea at dusk, a skyscraper silhouetted against a blood-orange sunset, a brutalist villa under rolling thunderheads, a marble estate lit cool blue beneath a breaking storm. Grand, expensive, cinematic — the building is the SUBJECT, shot low and dramatic with real presence, never a flat distant skyline, never a plain empty sky.",
  },
  {
    name: "alpha wildlife",
    brief:
      "ONE alpha animal commanding a super-cool landscape — a wolf standing on a cracked frozen lake beneath storm pines, a lion crossing black dunes under a lightning sky, a stag on a ridgeline in blowing snow, a golden eagle sweeping low over a fjord, a black panther on wet rock in night rain, a bison facing a whiteout. Draw from the ENTIRE animal kingdom; the animal is the clear HERO of the frame — close enough to feel its presence, the landscape epic around it. NEVER reuse an animal from a recent post.",
  },
  {
    name: "dark-luxury objects",
    brief:
      "luxury items with a dark theme, shot like a high-end ad — a classic Ferrari under one cold spotlight in a dark garage, rain beading on an old-school Mercedes gullwing parked on a night street, a vintage Porsche on a wet mountain road at dusk, a Rolls-Royce grille catching a single beam in deep shadow, a Swiss watch on black marble in low light, a signet ring beside a crystal tumbler in lamplight, a private jet on wet tarmac at night, a chess king in dramatic side light. CAR RULE: rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce, Aston Martin, anything timeless, luxurious, and inspiring; modern Lamborghini-style supercars only rarely, never the default. ONE hero object, deep shadow, controlled highlights, tactile hyperreal detail. The object must be unmistakably LUXURY and dramatic — NEVER notebooks, journals, pens, books, desks, paperwork, or any flat office/stationery still-life.",
  },
  {
    name: "epic warrior",
    brief:
      "a lone armored warrior seen from a DISTANCE in an epic snowy atmosphere, hyperrealistic — a medieval knight, a spartan, a samurai, a viking, any legendary warrior in FULL armor (gleaming silver, burnished gold, or blackened steel). The warrior is DOING something powerful, never posing idle: mid-stride walking alone into the storm, fists clenched and arms flexed in triumph with head raised to the sky, driving a sword or spear into the frozen ground, climbing a ridgeline against the wind, standing braced as a blizzard breaks around him. The pose must read in silhouette and radiate STRENGTH, CONSISTENCY, and DRIVE — the frame should make a man want to stand up and get to work. The shot is WIDE and cinematic: the warrior small-to-mid in an immense frozen landscape — a snowfield under a storm sky, a frozen mountain pass, a blizzard-swept ridgeline — NEVER close to the camera, NEVER a close-up or portrait framing. The atmosphere does the work: falling snow, blowing mist, storm light, scale. Face never visible — helmet on, visor down, or too distant to read.",
  },
];

/** Roll one cover-scene family and return the injectable rule string.
 *  The family constrains the DNA; the scene itself must be INVENTED
 *  fresh (2026-09-08, per Keenan: "unlimited amounts actually. every
 *  post should be a unique image"). Pass `forcedFamily` (a
 *  MEN_COVER_FAMILIES name, e.g. "epic warrior") to pin the whole
 *  post — cover AND item scenes — to one family for themed one-offs
 *  (2026-09-10, per Keenan: "create a knight themed post"). */
function rollMenCoverRule(forcedFamily?: string): string {
  const forced = forcedFamily
    ? MEN_COVER_FAMILIES.find((f) => f.name === forcedFamily)
    : undefined;
  const fam =
    forced ??
    MEN_COVER_FAMILIES[Math.floor(Math.random() * MEN_COVER_FAMILIES.length)];
  const itemRule = forced
    ? `FAMILY LOCK: EVERY item scene in this post must ALSO come from the ${fam.name} family — the whole post lives in one visual world, with each slide a DIFFERENT freshly-invented scene inside it.`
    : `Item scenes follow the normal SCENES brief with the same rule: every scene invented fresh, never copied from the examples.`;
  return `COVER SCENE RULE: "coverScene" MUST come from the ${fam.name} family — ${fam.brief} The examples are SEEDS, not a menu: INVENT a brand-new scene inside this family that has never appeared before — choose a fresh subject, setting, season, weather, time, and vantage so no two covers are ever alike. ${itemRule}`;
}

/** Pick-list cover rule (2026-09-10, per Keenan: "add 3 cover photos
 *  and 15 different images per lane. that way I can pick the ones that
 *  actually make sense/are good"). Asks for `count` candidate cover
 *  scenes — each from a DIFFERENT family so he gets real options — and
 *  leaves item scenes on the normal four-family rotation. A forced
 *  family (themed one-offs) locks everything to that family instead. */
function buildMultiCoverRule(count: number, forcedFamily?: string): string {
  const forced = forcedFamily
    ? MEN_COVER_FAMILIES.find((f) => f.name === forcedFamily)
    : undefined;
  if (forced) {
    return `COVER SCENE RULE: return "coverScenes" — an ARRAY of exactly ${count} cover scene sentences, EVERY one from the ${forced.name} family — ${forced.brief} Each of the ${count} is a COMPLETELY DIFFERENT freshly-invented scene inside the family. Also set "coverScene" to the first of them. FAMILY LOCK: EVERY item scene in this post must ALSO come from the ${forced.name} family — the whole post lives in one visual world, each slide a DIFFERENT freshly-invented scene inside it.`;
  }
  return `COVER SCENE RULE: return "coverScenes" — an ARRAY of exactly ${count} cover scene sentences, each from a DIFFERENT one of the four SCENES families (never two covers from the same family). Every cover is a freshly-invented scene: the examples are SEEDS, not a menu — new subject, setting, season, weather, time, and vantage, never a scene from a recent post. Also set "coverScene" to the first of them. Item scenes follow the normal SCENES brief with the same rule: every scene invented fresh, spread across the families.`;
}

/** Generate one moody-carousel topic for the given audience funnel.
 *  Slide count varies 4-7 items per post (2026-08-31, per Keenan:
 *  "create a ton of variance between posts"). The men's lane is
 *  theme-locked to the SILENCE family (2026-09-03). */
export async function generateMoodyTopic(
  audience: MoodyAudience,
  recentHeadlines: string[]
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 4); // 4-7 items
  return generateMoodyFamilyTopic({
    purpose: `moody-carousel-topic-${audience}`,
    system: buildMoodySystemPrompt(
      audience,
      audience === "men"
        ? { theme: SILENCE_THEME, coverRule: rollMenCoverRule() }
        : undefined
    ),
    user: `Write one new post for the ${audience === "men" ? "young aspiring men" : "women 40-50"} funnel with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: `moody-${audience}`,
    requireName: true,
    minLines: 2,
    minItems: 4,
    maxItems: 7,
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
 *  Pick-list format (2026-09-10, later): 3 candidate covers + 15
 *  items so Keenan curates the good ones. `sceneFamily` pins the
 *  whole post to one image family (themed one-offs). */
export async function generateWatchingTopic(
  recentHeadlines: string[],
  sceneFamily?: string
): Promise<MoodyTopic> {
  return generateMoodyFamilyTopic({
    purpose: "watching-carousel-topic",
    system: buildMoodySystemPrompt("men", {
      theme: WATCHING_THEME,
      coverRule: buildMultiCoverRule(3, sceneFamily),
    }),
    user: `Write one new when-no-one's-watching post with exactly 15 items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "watching",
    requireName: true,
    minLines: 2,
    minItems: 12,
    maxItems: 15,
    coverCount: 3,
    maxTokens: 6000,
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
export function buildMoodyImagePrompt(
  audience: MoodyAudience | "universal",
  scene: string,
  womenScheme: WomenScheme = "light"
): string {
  const style =
    audience === "men"
      ? "Dark, dominant, moody minimalist photography. Desaturated, near-monochrome color grade — charcoal, slate, black, cold glass, storm light. Deep shadows, austere, powerful, commanding."
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
      : "The entire frame is DIM and shadowed — dark enough that clean white text placed at the center of the image would be perfectly legible.",
    // Clarity mandate (2026-09-03, per Keenan: "all high quality, clear
    // images that are hyper realistic").
    "Shot on a full-frame camera, editorial architecture-magazine quality, true-to-life materials and light. TACK-SHARP and high-resolution — crisp, clear, and perfectly focused on the subject; never blurry, hazy, murky, soft, or low-quality. Physically believable optics: honest exposure, natural depth of field, at most a faint touch of grain, light behaving the way it actually does. It must be INDISTINGUISHABLE from a real photograph someone took.",
    "Absolutely NOT a 3D render, NOT CGI, NOT digital art, NOT an illustration, NOT a matte painting, and NOT the oversaturated too-perfect AI look — no plastic surfaces, no impossible glow, no fake-clean geometry.",
    // Fine-detail mandate (2026-09-04, per Keenan's blurred-leaves
    // example: "look how blurred the leaves are... better attention to
    // detail").
    "ATTENTION TO DETAIL: every element in the frame is fully resolved with fine, true texture — individual leaves on trees, fabric weave, wood and stone grain, distant buildings all crisply defined. NO mushy, smeared, half-melted, or painterly areas ANYWHERE in the frame, including the background and edges. Any background softness must be genuine optical depth of field, never smear.",
    "Vertical 9:16 composition, calm and uncluttered in the middle of the frame.",
    // Variance directive (2026-08-31, per Keenan: "create a ton of
    // variance between posts and image generations while keeping the
    // theme intact"; widened 2026-09-03: "there should be variance
    // everywhere").
    "Choose a distinctive vantage for THIS image — low from the ground or a bed, from inside looking out through glass, elevated, or deep one-point perspective — so it doesn't compose like a default eye-level shot. Also make its OTHER choices its own: vary the focal length (wide vs. tight), camera distance, weather, and the light's direction and character from image to image — no two frames should ever feel like the same shot. Keep the color grade and mood exactly on theme.",
    // People-free EVERYWHERE (2026-09-01, per Keenan: "the avatar is in
    // literally every single post again" — the standing "at most ONE
    // person: a lone man" allowance made gpt-image-2 paint a generic
    // man into ~every BWK image even though the avatar reference was
    // never attached). A man may ONLY enter via generateMoodyImage's
    // avatar-winner exception block (≤8% of posts, and then he's
    // Keenan).
    // Statue/wildlife carve-outs (2026-09-08) are CONDITIONAL on the
    // scene text naming one — never a standing allowance (the 2026-09-01
    // "lone man" lesson: standing allowances leak into every image).
    audience === "men"
      ? "NO people — even if the scene description implies a person, render the location EMPTY of humans. A stone/marble/bronze STATUE is sculpture, not a person: render it ONLY when the scene explicitly describes one. ONE lone wild ANIMAL is allowed ONLY when the scene explicitly names one; otherwise NO animals. ONE armored WARRIOR (medieval knight, spartan, samurai, viking, or similar) is allowed ONLY when the scene explicitly describes one — always DISTANT in the frame (wide epic shot, never close to the camera, never a close-up), FULL hyperreal armor in silver, gold, or blackened steel, face never visible (helmet on, visor down, or too far to read), in a snowy or storm-swept epic atmosphere, caught in a POWERFUL ACTION pose that reads in silhouette (striding into the storm, arms flexed in triumph, sword driven into the ground) — heroic strength and drive, never standing idle. Screens may glow softly but show NO readable content."
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
// short command. NO "N. Name." headers — the numbers ARE the content.
// 2026-09-01: "memento" (women) REVIVED into Ripple ("add the 'do the
// math' / less time than you think back to ripple... add memento mori
// posts back"). 2026-09-03: pinned to the DARK scheme with dusk-coast
// covers — per Keenan, the winning post was "the 'do the math' piture
// of the beach. this one did well on instagram/facebook reals with
// multiple shares and likes. so give me more of that."

const MEMENTO_WOMEN_SCENES: Record<WomenScheme, string> = {
  light: `SCENES: soft, aesthetically pleasing feminine photography in LIGHT, airy schemes — an empty porch swing in pale morning sun, a cream kitchen table cleared after breakfast by a bright window, dried flowers on a white sill in soft daylight, a child's empty bedroom with sheer curtains glowing, linen bedding in diffused morning light, a silk robe over a chair by a sunlit window, a garden bench under soft overcast light, a pale staircase with light falling across it, an emptied dining table with one chair pulled out in late-afternoon glow, blank cream stationery and a fountain pen on a sunlit desk, a hallway of small shoes by the door in morning light, a kitchen still and bright after everyone has left. Bright cream, ivory, warm white — every frame LIGHT (dark charcoal text must read on it), the quiet ache carried by emptiness and light, not darkness. No people ever. These are inspiration, not a menu — invent new quiet-daylight locations in the same DNA so no two posts look alike.`,
  dark: `SCENES: soft, aesthetically pleasing feminine photography, contemplative in low warm light — an empty porch swing at dusk, a kitchen table cleared after dinner lit by one lamp, dried flowers by a dark window, a child's empty bedroom in soft evening light, a candlelit bath still steaming, a silk robe over a chair by rain-streaked glass, a dark garden seen through a lit kitchen window, a single lamp on in a house at blue hour, an emptied dining table with one chair pulled out, blank cream stationery and a fountain pen in warm lamplight, a porch light left on over an empty step, the kitchen after everyone is asleep lit by one small light. Muted, warm, beautiful — every frame DIM (white text must read on it). No people ever. These are inspiration, not a menu — invent new quiet-evening locations in the same DNA so no two posts look alike.`,
};

// Winning-cover family for the dark scheme (the "DO THE MATH" beach).
const MEMENTO_COVER_RULE = `COVER SCENE RULE: "coverScene" MUST come from the dusk-coast family — an empty shoreline at last light: a beach as the tide pulls back from dark wet sand, a thin line of amber on a grey horizon, a lake shore at dusk, dunes at blue hour, a wide bay going dark, a pier reaching into evening mist. Vary the water, the light, and the vantage every post so no two covers repeat, but every cover is unmistakably an empty shore at the end of the day. Item scenes follow the normal SCENES brief with full variety.`;

const buildMementoWomenSystemPrompt = (
  scheme: WomenScheme
) => `${WOMEN_PROMPT_HEADER[scheme]} The niche: MEMENTO MORI LIFE-MATH — numbers at the scale of a WHOLE LIFE, each slide ending on a short command to act on it.

AUDIENCE: women roughly 40-50 carrying a heavy mental load — always holding it together for everyone else. The numbers must hit HER clock at full scale: weekends left in an average lifetime, times she'll see her parents before they're gone, Christmases left with everyone at the table, healthy years remaining, summers while the kids still come home.

${MEMENTO_WOMEN_SCENES[scheme]}${scheme === "dark" ? `\n\n${MEMENTO_COVER_RULE}` : ""}

FORMAT — each slide reads like this (match the rhythm):
"At 45, you have about 1,700 weekends left. On average.

That's the whole number. Not this year's.

Stop giving them away."

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past. 2-4 words, works in ALL CAPS, a direct command that pulls her into the slides ("DO THE MATH", "COUNT THESE HONESTLY...", "LOOK AT THE CLOCK"). Never a passive label. No number in the title. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must fit what the slides deliver. Do NOT stitch together or remix the example phrases; if a title reads odd, garbled, or random without the slides, it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE life-scale number — anchored to her age, measured against an average lifespan or an ending that is coming ("At 45, you have about 1,700 weekends left. On average.", "You'll see your parents about 15 more times before they're gone."). GO BIG: the number must reframe her whole remaining life, not just this year. Plausible arithmetic from average life expectancy only — never invented statistics, never fake precision, hedge with "about", "~", or "on average".
  - Optional middle line: the one-sentence math or truth behind it.
  - Last line: a 2-5 word command ("Call them tonight.", "Stop giving them away.").
- Vary the subject across the slides: weekends left, aging parents, summers or holidays with the kids, healthy years, old friendships, hours lost to the phone. Never two slides on the same subject. Vary the rhythm too — let one slide be just the number and the command, no middle line.
- Every sentence short. No metaphors that need decoding. It should feel like cold arithmetic, not poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI. Naming death in the slides is allowed ("before they're gone", "until you die") — but never on the cover.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather) per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

const MEMENTO_MEN_SYSTEM_PROMPT = `You write text for a dark, moody, minimal photo-carousel account. Each post is a cover + slides of white text centered on cinematic photography. The niche: MEMENTO MORI LIFE-MATH — numbers at the scale of a WHOLE LIFE, each slide ending on a short command to act on it.

AUDIENCE: young aspiring men (18-30) in the self-improvement / discipline niche. The numbers must hit HIS clock at full scale: weekends left until he dies on average, times he'll see his parents before they're gone, peak physical years in a whole lifetime, healthy decades remaining, the total window to build something. The math should read like a bill coming due — for his entire life, not this week.
VOICE: calm command energy. Short declarative sentences. Direct second person. A mentor stating arithmetic, not a poet. Never bro-slang, never yelling.

SCENES: dark, dramatic, luxurious photography in FOUR families (nothing outside them): dark-luxury architecture (luxury buildings with a DRAMATIC SKY — heavy cloud cover, cool cinematic lighting, or a burning sunset behind every building: a penthouse tower crowned in storm cloud, a cliff mansion above a storm sea at dusk, a skyscraper against a blood-orange sunset — shot low and dramatic, never a flat skyline or plain empty sky), alpha wildlife (ONE alpha animal commanding an epic landscape — a wolf on a cracked frozen lake, a lion under lightning, a stag in blowing snow; the whole animal kingdom, never a recent post's animal), dark-luxury objects (a classic Ferrari under one cold spotlight, rain beading on an old-school Mercedes gullwing, a vintage Porsche on a wet mountain road at dusk, a Swiss watch on black marble, a private jet on wet tarmac at night — one hero object, shot like a high-end ad; cars rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce — modern Lamborghini-style supercars only rarely; unmistakably LUXURY, NEVER notebooks, pens, books, desks, or any office/stationery still-life), and epic warriors (a lone knight / spartan / samurai / viking in FULL silver-or-gold armor, seen from a DISTANCE in an epic snowy atmosphere, DOING something powerful — striding into the storm, arms flexed in triumph, sword driven into frozen ground — a pose that reads in silhouette and radiates strength and drive; wide cinematic framing, never close to the camera, face never visible). Desaturated, near-monochrome. Every frame DIM (white text must read on it). ANTI-BLAND RULE: every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape or bare horizon. NO people EVER except the distant-warrior carve-out (face never visible) and the lone animal, each only in its own family's scenes. These are SEEDS, not a menu — invent a brand-new scene for every slide within these families so no two posts look alike.

FORMAT — each slide reads like this (match the rhythm):
"At 30, you have about 2,500 weekends left. On average.

That number only goes down.

Stop wasting them."

RULES:
- "title": the cover text. 2-5 words, commanding, works in ALL CAPS ("YOU'RE ON THE CLOCK", "DO THE MATH"). No number in the title.
- The request tells you EXACTLY how many items to write. Each item's "lines": 2-3 short paragraphs.
  - First line: ONE life-scale number — anchored to his age, measured against an average lifespan or an ending that is coming ("At 30, you have about 2,500 weekends left. On average.", "You'll see your parents about 20 more times before they're gone."). GO BIG: the number must reframe his whole remaining life, not just this month. Plausible arithmetic from average life expectancy only — never invented statistics, never fake precision, hedge with "about", "~", or "on average".
  - Optional middle line: the one-sentence math or truth behind it.
  - Last line: a 2-5 word command ("Stop wasting them.", "Start tonight.").
- Vary the subject across the slides: weekends left until the end, parents, peak physical years, healthy decades, hours lost to the scroll, the window to build something. Never two slides on the same subject. Vary the rhythm too — let one slide be just the number and the command, no middle line.
- Every sentence short. No metaphors that need decoding. It should feel like cold arithmetic, not poetry.
- US English. No emojis, no hashtags, no quotes, no advice-verbs like "try to". Never mention any app, product, journaling, or AI. Naming death in the slides is allowed ("until you die", "before they're gone") — but never on the cover.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph (place, light, weather) per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...", "...", "..."], "scene": "..." }
  ]
}`;

/** Generate one memento mori topic for the given audience lane.
 *  Women: slide count varies per post (2026-08-29) — 3-9 items.
 *  Men (BWK): pick-list format (2026-09-10, later) — 3 candidate
 *  covers + 15 items so Keenan curates the good ones.
 *  `scheme` applies to women only. */
export async function generateMementoTopic(
  audience: MoodyAudience,
  recentHeadlines: string[],
  scheme: WomenScheme = "light",
  sceneFamily?: string
): Promise<MoodyTopic> {
  const men = audience === "men";
  const itemCount = men ? 15 : 3 + Math.floor(Math.random() * 7); // men 15, women 3-9
  return generateMoodyFamilyTopic({
    purpose: men ? "memento-men-carousel-topic" : "memento-carousel-topic",
    system: men
      ? // 2026-09-10 (memento-men revived into BWK): multi-cover
        // pick-list rule — 3 candidate covers across the families.
        `${MEMENTO_MEN_SYSTEM_PROMPT}\n\n${buildMultiCoverRule(3, sceneFamily)}`
      : buildMementoWomenSystemPrompt(scheme),
    user: `Write one new memento mori life-math post with exactly ${itemCount} items.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: men ? "memento-men" : "memento",
    requireName: false,
    minLines: 2,
    minItems: men ? 12 : 3,
    maxItems: itemCount,
    coverCount: men ? 3 : 1,
    maxTokens: men ? 6000 : undefined,
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

RULES:
- "title": the cover text — short, sweet, and impossible to scroll past: a direct PROMPT to the reader that sets up the slides and makes swiping irresistible. 2-4 words, commanding, addressed to her, works in ALL CAPS ("ANSWER THESE HONESTLY...", "READ THESE SLOWLY", "DON'T LOOK AWAY"). Not itself a question. A trailing "..." is allowed when it baits the swipe. SENSE CHECK (non-negotiable): the title must make instant, obvious sense COMPLETELY ON ITS OWN — a natural phrase a real person would actually say, and it must clearly set up questions to answer. Do NOT stitch together or remix the example phrases; "DON'T LIE NOW" is the kind of garbled title that gets a post killed — if a title reads odd or random without the slides, it is WRONG — write a different one.
- The request tells you EXACTLY how many items to write. Each item's "lines": exactly ONE line — the question. 8-20 words, ends with "?". Plain words, no metaphors that need decoding, no "why don't you" advice-in-disguise.
- Each question hits a DIFFERENT nerve: identity, resentment, time, what she's postponing, what she'd never admit. Never two questions on the same nerve.
- The questions must be answerable only by the reader — never rhetorical, never yes-obvious.
- US English. No emojis, no hashtags, no quotes. Never mention any app, product, journaling, therapy, or AI.
- "coverScene" and each item's "scene": one concrete sentence describing the photograph per SCENES above. Every scene a DIFFERENT location.

OUTPUT (strict JSON, no markdown):
{
  "title": "...",
  "coverScene": "...",
  "items": [
    { "lines": ["...?"], "scene": "..." }
  ]
}`;

/** Generate one hard-questions topic (women's funnel). 4-6 questions
 *  per post (2026-08-31 variance). */
export async function generateQuestionsTopic(
  recentHeadlines: string[],
  scheme: WomenScheme = "light"
): Promise<MoodyTopic> {
  const itemCount = 4 + Math.floor(Math.random() * 3); // 4-6 items
  return generateMoodyFamilyTopic({
    purpose: "questions-carousel-topic",
    system: buildQuestionsSystemPrompt(scheme),
    user: `Write one new hard-questions post with exactly ${itemCount} questions.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "questions",
    requireName: false,
    minLines: 1,
    minItems: 4,
    maxItems: 6,
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

SCENES: dark, dramatic, luxurious photography in FOUR families (nothing outside them): dark-luxury architecture (luxury buildings with a DRAMATIC SKY — heavy cloud cover, cool cinematic lighting, or a burning sunset behind every building: a penthouse tower crowned in storm cloud, a cliff mansion above a storm sea at dusk, a skyscraper against a blood-orange sunset — shot low and dramatic, never a flat skyline or plain empty sky), alpha wildlife (ONE alpha animal commanding an epic landscape — a wolf on a cracked frozen lake, a lion under lightning, a stag in blowing snow; the whole animal kingdom, never a recent post's animal), dark-luxury objects (a classic Ferrari under one cold spotlight, rain beading on an old-school Mercedes gullwing, a vintage Porsche on a wet mountain road at dusk, a Swiss watch on black marble, a private jet on wet tarmac at night — one hero object, shot like a high-end ad; cars rotate LUXURY and CLASSIC marques — vintage Ferraris, old-school Mercedes, classic Porsches, Rolls-Royce — modern Lamborghini-style supercars only rarely; unmistakably LUXURY, NEVER notebooks, pens, books, desks, or any office/stationery still-life), and epic warriors (a lone knight / spartan / samurai / viking in FULL silver-or-gold armor, seen from a DISTANCE in an epic snowy atmosphere, DOING something powerful — striding into the storm, arms flexed in triumph, sword driven into frozen ground — a pose that reads in silhouette and radiates strength and drive; wide cinematic framing, never close to the camera, face never visible). Desaturated, near-monochrome. Every frame DIM (white text must read on it). ANTI-BLAND RULE: every frame needs a clear dramatic SUBJECT with presence — never an empty flat landscape or bare horizon. NO people EVER except the distant-warrior carve-out (face never visible) and the lone animal, each only in its own family's scenes. UNLIMITED LIBRARY RULE: every example is a SEED, not a menu — INVENT a brand-new scene for every slide (new subject, location, season, weather, time, vantage) within these families; never render an example verbatim, never repeat a recent post's scene.

FORMAT — each slide reads like this (match the rhythm):
"The skill.

One focused hour a day. That's about 100 hours in.

Enough to go from clueless to dangerous. Most people never log ten."

RULES:
- "title": the cover text is EXACTLY "${interval} OF DISCIPLINE..." — nothing else, all caps, trailing "..." as the swipe bait. Do not add words, do not rephrase.
- The slides answer the cover: HOW MUCH progress he can actually make in ${interval.toLowerCase()}, area by area. Each item is a DIFFERENT area of life (the body, the bank account, the skill, the mind, the reading, the reputation, the business) — vary the areas post to post and NEVER reuse the mix from the recent-posts list.
- Each item: "name" = the area, 2-4 words ("The body.", "The bank account."). "lines" = 2-3 short paragraphs: the daily action, the accumulated math over ${interval.toLowerCase()}, and the real expected result. The math must be plausible and scaled to the interval — hedge honest numbers with "about" or "~" (about 100 workouts in 100 days; ~1,800 focused hours in 5 years). Results must be believable, never inflated.
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
  sceneFamily?: string
): Promise<MoodyTopic> {
  const interval =
    PROTOCOL_INTERVALS[Math.floor(Math.random() * PROTOCOL_INTERVALS.length)];
  return generateMoodyFamilyTopic({
    purpose: "protocol-carousel-topic",
    // 2026-09-08: rolled cover-family rule appended so protocol covers
    // rotate too instead of drifting toward buildings.
    // 2026-09-10: pick-list format — 3 candidate covers + 15 areas so
    // Keenan can curate the good frames instead of taking pot luck.
    system: `${buildProtocolSystemPrompt(interval)}\n\n${buildMultiCoverRule(3, sceneFamily)}`,
    user: `Write one new "${interval} OF DISCIPLINE..." post with exactly 15 areas of expected progress.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
    slugPrefix: "protocol",
    requireName: true,
    minLines: 2,
    minItems: 12,
    maxItems: 15,
    coverCount: 3,
    maxTokens: 6000,
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

- "hook": the cover line, 5-12 words, lowercase sentence case, intimate and confessional, ending with "..." — it teases the quote without revealing it ("this quote kept me up all night...", "someone sent me this and i can't stop thinking about it...", "i found this at exactly the right moment..."). Vary the framing every post — never reuse a recent hook's framing.
- "quote": 20-45 words. Motivational and developmental — self-compassion, growth over perfection, permission to rest, letting go, starting again, quiet strength. It must read like something a real person would screenshot and send a friend at 2am: warm, plain words, second person welcome, no clichés stacked on clichés. NO attribution, NO quotation marks, NO emojis, NO hashtags.
- "coverScene": one concrete sentence for the photograph — a quiet night interior in warm low light: a lamp-lit bedroom at night, tea by a dark rain-streaked window, a candlelit bath, a lit porch at dusk, a phone glowing face-up on dark bedding, blank stationery and a fountain pen in lamplight, the kitchen after everyone is asleep lit by one small light. DIM, warm, intimate, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "quote": "..." }`,
  men: `You write 2-slide quote posts for a dark, moody, minimal account for young aspiring men (18-30) in the self-improvement / discipline niche. Slide 1 is a photograph with a lowercase sentence-case hook; slide 2 is a phone notes-app screen showing one quote.

- "hook": the cover line, 5-12 words, lowercase sentence case, ending with "..." — it teases the quote without revealing it ("this quote kept me up all night...", "read this before you quit...", "someone sent me this at 2am..."). Vary the framing every post — never reuse a recent hook's framing.
- "quote": 20-45 words. Motivational and developmental — discipline, patience, building in silence, becoming the man who keeps his word, delayed gratification, standards. It must read like something a man would screenshot and set as his lock screen: calm command energy, plain declarative words, second person welcome, never bro-slang, never yelling. NO attribution, NO quotation marks, NO emojis, NO hashtags.
- "coverScene": one concrete sentence for the photograph, following the COVER SCENE RULE below. DIM, desaturated, NO people. Vary the location every post.
- Never mention any app, product, journaling, therapy, or AI.

OUTPUT (strict JSON, no markdown):
{ "hook": "...", "coverScene": "...", "quote": "..." }`,
};

/** Generate one phone-quote topic (2-slide format) for either funnel. */
export async function generatePhoneQuoteTopic(
  audience: MoodyAudience,
  recentHeadlines: string[]
): Promise<PhoneQuoteTopic> {
  const { prisma } = await import("@/lib/prisma");
  const purpose =
    audience === "men" ? "phone-quote-men-topic" : "phone-quote-topic";
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      // Men's covers rotate scene families (2026-09-08) — the rolled
      // rule replaces the old fixed night-city-vantage bullet.
      system: `${PHONE_QUOTE_SYSTEM[audience]}${audience === "men" ? `\n\n${rollMenCoverRule()}` : ""}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `Write one new phone-quote post.${avoidBlock(recentHeadlines)}\n\nReturn ONLY valid JSON.`,
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

export const QUOTE_SURFACES = [
  "imessage",
  "flip",
  "car",
  "billboard",
  "sign",
] as const;
export type QuoteSurface = (typeof QUOTE_SURFACES)[number];

export function rollQuoteSurface(): QuoteSurface {
  return QUOTE_SURFACES[Math.floor(Math.random() * QUOTE_SURFACES.length)];
}

interface SurfaceSpec {
  /** What holds the blank screen, per audience. */
  scenes: Record<MoodyAudience, string[]>;
  /** What we call the blank area in the prompt ("screen" / "face"). */
  screenWord: string;
  /** How much of the frame the blank area should fill. */
  sizeHint: string;
  /** Orientation demand matching compose.ts SURFACE_ASPECT validation. */
  orientation: string;
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
  },
};

/**
 * Prompt for a scene photo CONTAINING a blank glowing white surface.
 * The blank area must be pure white, straight-on, and the brightest
 * thing in the frame — that's what detectBrightRect keys on.
 */
export function buildQuoteSurfacePrompt(
  audience: MoodyAudience,
  surface: QuoteSurface
): string {
  const spec = QUOTE_SURFACE_SPECS[surface];
  const scenes = spec.scenes[audience];
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const palette =
    audience === "men"
      ? "Desaturated, near-monochrome, cool dark tones"
      : "Warm, dim, intimate amber tones";
  return `A real photograph, vertical 9:16: ${scene}. The ${spec.screenWord} is completely BLANK — a uniformly bright, pure WHITE glowing rectangle with absolutely NOTHING on it: no text, no icons, no interface, no image, no reflections, no smudges, no gradient. The blank white ${spec.screenWord} faces the camera PERFECTLY straight-on and level — zero tilt, zero rotation, zero perspective angle; its four edges run exactly parallel to the edges of the photo. It is ${spec.orientation}. CLOSE-UP COMPOSITION (critical): the ${spec.screenWord} must be LARGE — it fills ${spec.sizeHint}. Never a wide shot where the ${spec.screenWord} is small in the frame. The blank white ${spec.screenWord} is by FAR the brightest thing in the photo — everything else is dim and moody, and there are NO other bright lights, white surfaces, or glowing areas anywhere. ${palette}, DIM overall, moody available light, authentic photographic grain, shallow depth of field on the surroundings while the ${spec.screenWord} stays tack sharp. NO text, NO words, NO letters, NO numbers, NO logos anywhere in the image.`;
}
