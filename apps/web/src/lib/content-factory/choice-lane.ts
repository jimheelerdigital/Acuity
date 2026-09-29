/**
 * Legendary Mythicals — "WHICH WOULD YOU CHOOSE?" lane (2026-09-29, per
 * Keenan: "split off the fantasy lane into a separate lane entirely with a
 * new social posting calendar (3x/day)... 'which fighter would you
 * choose?' 'which beast would be your mount?' 'which dragon are you?'...
 * 5 different slide options for different, unique animals, beasts,
 * fighters that are super cool and mythical... a cover image for the
 * title of the post... VIDEO format").
 *
 * One post = cover (the question) + 5 numbered options (name + one line of
 * lore over a hyper-real epic image) + a closing "which will you choose?"
 * card whose wording varies post to post. carousel-daily's "choice"
 * template branch renders it; the Higgsfield post-video builder animates
 * the cover and all five options. Numbered options are a deliberate,
 * lane-only exception to the no-slide-numbering rule (Keenan chose
 * "Number + name" so people can comment "#3").
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import { copyObjectives } from "./copy-objectives";
import { humanizePass, HUMAN_VOICE_RULES } from "./humanizer";

export interface ChoiceOption {
  name: string;
  lore: string;
  scene: string;
  /** Signature action for the video clip (2026-09-29: animations were "basically just zooming in"). */
  motion: string;
}

export interface ChoiceTopic {
  slug: string;
  title: string;
  coverScene: string;
  coverMotion: string;
  options: ChoiceOption[];
  endCard: string;
  captionQuestion: string;
  category: string;
}

export interface ChoiceLaneSpec {
  theme?: string;
}

export function parseChoiceLaneSpec(raw: unknown): ChoiceLaneSpec | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { theme: typeof r.theme === "string" ? r.theme : undefined };
}

/**
 * Question families, rolled in code (inside the memoized Inngest step) so
 * a day's three posts land in different families. The model writes fresh
 * wording each time; these are subjects, not titles.
 */
export const CHOICE_CATEGORIES = [
  "a beast to ride as your mount (winged, armored, clawed, serpentine, spectral)",
  "which dragon the reader is (each dragon a temperament: storm, ember, frost, shadow, verdant, abyssal, celestial)",
  "a legendary fighter to fight beside them (knight, samurai, valkyrie, spartan, ranger, monk, berserker, beastmaster, spellblade)",
  "a guardian creature to protect their home",
  "a companion beast that follows them into the unknown",
  "a creature of the sea or deep to command",
  "a warrior clan or order to join",
  "a legendary wolf, lion or great cat to lead their pack",
  "a phoenix, thunderbird or sky-beast to summon",
  "a beast from world mythology to have on their side (kitsune, qilin, griffin, kraken, fenrir, simurgh, thunderbird and more)",
  "an armored war-mount for battle",
  "a mythical creature that matches their personality",
];

export function rollChoiceCategory(recentCategories: string[]): string {
  const fresh = CHOICE_CATEGORIES.filter((c) => !recentCategories.includes(c));
  const pool = fresh.length ? fresh : CHOICE_CATEGORIES;
  return pool[Math.floor(Math.random() * pool.length)];
}

const SYSTEM = `${copyObjectives("mythicals")}

YOUR JOB: write one "which would you choose?" post.

- "title": the cover question, 3-7 words, ALL-CAPS ready, ending with "?". It names the choice directly and makes the reader want to see all five ("WHICH BEAST WOULD YOU RIDE?", "WHICH DRAGON ARE YOU?", "WHO FIGHTS BESIDE YOU?" show the shape only; write new words every post and never reuse a recent title). It must make complete sense on its own.
- "options": exactly five. Each one:
  - "name": 2-4 words in Title Case, legendary-sounding and easy to type in a comment ("The Storm Wyvern", "Kitsune of Nine Flames"). No numbers; the renderer adds them.
  - "lore": one line, 6-12 words, giving one vivid, specific reason to pick it: what it does, what it guards, what it costs, what it says about you. Never a pile of adjectives.
  - "scene": one or two sentences describing the image for this option: the creature or fighter as the clear hero, its colors, silhouette, pose, and a setting that matches it. The five scenes must look completely different from each other (different element, color palette, silhouette, environment and time of day), so the choice is visual as well as written.
  - "motion": what it DOES in a five-second video clip made from that image: one clear, signature action at natural speed, written as a single sentence (the wyvern lifts its head and slowly unfolds its wings as wind stirs the grass; the rhino lowers its armored head and paws the ground once; the kirin turns its head toward the viewer and its glowing mane ripples as mist rolls past). Visible and true to the creature, but realistic and measured: no charging at the camera, no frantic movement. It must be possible from the pose in the scene, and the creature stays in frame.
- The five options must be genuinely different kinds of choice (a loyal one, a wild one, a patient one, a terrifying one, a wise one), so that picking one says something about the person picking. All five should be tempting; none is the obvious joke or throwaway.
- "coverScene": the cover image: an epic establishing shot that sets up the question without showing all five options (a lone rider on a ridge looking out at a stormy sky full of shapes, an armory hall, a vast lair entrance).
- "coverMotion": one sentence of calm, atmospheric movement for the cover's five-second clip (storm clouds drift and a huge shadow passes slowly across the ridge; torches flicker as the great doors ease open).
- "endCard": the closing line, 2-6 words, ALL-CAPS ready, asking for their pick. Vary it every post ("WHICH ONE IS YOURS?", "COMMENT YOUR NUMBER.", "CHOOSE WISELY.", "ONE CHANCE. PICK."); never reuse a recent end card.
- "captionQuestion": one short caption question that gets a pick AND a reason in the comments ("Which one, and what would you name it?").
- Creatures of legend from any culture are welcome, and so are original inventions. Keep them respectful and not gory. No emojis.

OUTPUT (JSON):
{
  "title": "...",
  "coverScene": "...",
  "coverMotion": "...",
  "options": [{ "name": "...", "lore": "...", "scene": "...", "motion": "..." }],
  "endCard": "...",
  "captionQuestion": "..."
}

Return only the JSON object.`;

/**
 * DUO mode (2026-09-29, per Keenan: "'who are you and bro?' where it's two
 * different characters on a quest or fighting together and then the last
 * slide says to send to their bro"). Same shape as a choice post — five
 * numbered options — but every option is a PAIR, and the closing card asks
 * to send it to a friend (shares are the strongest reach signal).
 */
export const DUO_CATEGORIES = [
  "warrior + beast duos (a rider and their mount, a hunter and their wolf)",
  "two legendary fighters back to back (knight and samurai, viking and spartan, monk and ranger)",
  "dragon + rider duos, each pair a different kind of dragon",
  "unlikely duos: a creature and a warrior from completely different legends",
  "sibling beasts and twin guardians",
  "a mage and a fighter on a quest together",
];

const DUO_RULES = `THIS POST IS A DUO POST: "who are you and your bro?" The reader picks the pair that is him and his best friend, then sends it to that friend.
- "title": the cover question, 4-8 words, ALL-CAPS ready, ending with "?" (shapes like "WHICH DUO ARE YOU AND YOUR BRO?", "WHO ARE YOU TWO ON THE QUEST?"; new words every post, never a recent title).
- Each option is a PAIR of two characters: "name" is the duo, 3-7 words with "&" ("The Knight & The Wyvern", "Samurai & Spirit Fox"). "lore" is one line (6-14 words) about what they do together: the quest, the fight, how they cover each other. Make each duo a different friendship dynamic (the reckless one and the one who saves him, two loyal brawlers, the brains and the muscle, the chaos pair, the silent pair) so the pick says something about the friendship.
- "scene": BOTH characters together in one frame, clearly two figures, mid-quest or fighting side by side, full bodies visible, epic setting matched to them.
- "motion": one measured thing the two do together in five seconds, at natural speed (they turn back to back and raise their weapons; the rider leans forward as the dragon glides through cloud).
- "endCard": 2-6 words, ALL-CAPS ready, telling him to send it to his bro; vary it every post ("SEND THIS TO YOUR BRO.", "TAG YOUR RIDE OR DIE.", "SEND IT. HE KNOWS.").
- "captionQuestion": asks which duo they are and to tag the friend ("Which duo are you two? Tag him.").
Everything else in the format above still applies.`;

export async function generateChoiceTopic(opts: {
  /** "duo" = the who-are-you-and-your-bro variant. */
  mode?: "choice" | "duo";
  category: string;
  theme?: string;
  recentTitles: string[];
  recentNames: string[];
  feedback?: string | null;
}): Promise<ChoiceTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const user = [
    `This post's subject: ${opts.category}.`,
    opts.theme ? `Lane notes: ${opts.theme}` : "",
    opts.recentTitles.length
      ? `Recent titles (don't repeat or lightly reword these):\n${opts.recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
    opts.recentNames.length
      ? `Options used recently (pick different creatures and fighters):\n${opts.recentNames.slice(0, 60).join(", ")}`
      : "",
    opts.feedback ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await contentAnthropic.messages.create({
    max_tokens: 2500,
    system: `${SYSTEM}${opts.mode === "duo" ? `\n\n${DUO_RULES}` : ""}\n\n${HUMAN_VOICE_RULES}`,
    messages: [{ role: "user", content: user }],
  });
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  await prisma.claudeCallLog
    .create({
      data: {
        purpose: "choice-topic",
        model: CONTENT_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN) * 100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    })
    .catch(() => {});

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = JSON.parse(lastJsonText(text)) as Partial<ChoiceTopic> & {
    options?: Partial<ChoiceOption>[];
  };
  const options = (parsed.options ?? [])
    .filter((o) => typeof o?.name === "string" && typeof o?.lore === "string" && typeof o?.scene === "string")
    .map((o) => ({
      name: o.name!.trim(),
      lore: o.lore!.trim(),
      scene: o.scene!.trim(),
      motion: typeof o.motion === "string" ? o.motion.trim() : "",
    }))
    .slice(0, 5);
  const title = (parsed.title ?? "").trim();
  if (!title || options.length < 5 || !parsed.coverScene) {
    throw new Error(`choice topic unusable: title="${title}", ${options.length} options`);
  }
  let endCard = (parsed.endCard ?? "").trim() || "WHICH ONE IS YOURS?";
  let captionQuestion = (parsed.captionQuestion ?? "").trim() || "Which one would you choose, and why?";
  let gatedTitle = title;
  let gatedOptions = options;

  // Humanizer gate on reader-facing text (never scenes). Fails open.
  try {
    const gated = await humanizePass({
      purpose: "humanize:choice-topic",
      voice: "epic, playful, a friend hyping a debate",
      payload: {
        title,
        options: options.map((o) => ({ name: o.name, lore: o.lore })),
        endCard,
        captionQuestion,
      },
    });
    if (typeof gated.title === "string" && gated.title.trim()) gatedTitle = gated.title.trim();
    if (Array.isArray(gated.options) && gated.options.length === options.length) {
      gatedOptions = options.map((o, i) => ({
        ...o,
        name: typeof gated.options[i]?.name === "string" && gated.options[i].name.trim() ? gated.options[i].name.trim() : o.name,
        lore: typeof gated.options[i]?.lore === "string" && gated.options[i].lore.trim() ? gated.options[i].lore.trim() : o.lore,
      }));
    }
    if (typeof gated.endCard === "string" && gated.endCard.trim()) endCard = gated.endCard.trim();
    if (typeof gated.captionQuestion === "string" && gated.captionQuestion.trim()) captionQuestion = gated.captionQuestion.trim();
  } catch (err) {
    console.warn("[choice-lane] humanize gate failed — shipping ungated copy:", err);
  }

  const slug = `${opts.mode === "duo" ? "mythic-duo" : "mythic"}-${gatedTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)}`;
  return {
    slug,
    title: gatedTitle,
    coverScene: parsed.coverScene.trim(),
    coverMotion: typeof parsed.coverMotion === "string" ? parsed.coverMotion.trim() : "",
    options: gatedOptions,
    endCard,
    captionQuestion,
    category: opts.category,
  };
}

/** Image prompt for a cover or option: hyper-real epic film still, subject in the middle band. */
export function buildMythicImagePrompt(scene: string, kind: "cover" | "option"): string {
  return [
    `A breathtaking, hyper-real cinematic film still, vertical composition: ${scene}`,
    kind === "option"
      ? "The creature or fighter is the unmistakable hero of the frame, shown whole and centered in the MIDDLE of the image, with open sky or atmosphere in the top fifth and bottom fifth of the frame (text is added there later)."
      : "Epic scale and depth; the main subject sits in the middle of the frame, with open atmosphere in the top quarter and bottom fifth (the title is added at the top later).",
    "Shot like a prestige fantasy film: real weather, real light, tactile detail in scales, fur, feathers, armor and stone, believable anatomy, dramatic but natural lighting, rich color, tack-sharp focus on the subject.",
    "Not a cartoon, not anime, not a video-game render, not a painting or illustration. No text, letters, numbers, logos or watermarks anywhere in the image. Nothing gory.",
  ].join("\n");
}

/**
 * The stored imagePrompt carries the clip's action on a "MOTION:" line so
 * the post-video builder can animate the creature doing it (see
 * living-reel.ts livingMotionPrompt, action mode).
 */
export function withMotion(imagePrompt: string, motion: string): string {
  return motion ? `${imagePrompt}\nMOTION: ${motion}` : imagePrompt;
}

/** Hashtag caption used until the caption writer replaces it at publish time. */
export function buildChoiceCaption(question: string): string {
  const pools = [
    ["#mythicalcreatures", "#fantasyart", "#dragon", "#pickone"],
    ["#mythology", "#legendary", "#epicfantasy", "#whichoneareyou"],
    ["#fantasy", "#beasts", "#dragons", "#chooseone"],
  ];
  const tags = pools[Math.floor(Math.random() * pools.length)];
  return `${question}\n\n${tags.join(" ")}`;
}
