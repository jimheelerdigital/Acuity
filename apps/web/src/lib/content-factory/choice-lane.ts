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
import { humanizePass, HUMAN_VOICE_RULES, copyFlagFor } from "./humanizer";

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
  // 2026-09-30: catalog widened from Keenan's reference account
  // (the_mage_page_, doing very well with these shapes).
  "legendary armor to wear into battle",
  "a legendary weapon to wield",
  "a war helm to wear",
  "a fantasy class to be (paladin, ranger, rogue, battlemage, warlock, druid, berserker)",
  "a mythical companion to raise from a hatchling",
  "a beast warrior to command in a strange realm",
  "a legendary unit to command (one choice, choose wisely)",
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
  "which quest you and your bro accept",
  "which faction you and your bro join when the realm goes to war",
  "which guild you and your bro join when the guilds are recruiting",
  "which ship you and your bro take on a sea quest",
  "which ally you and your bro recruit in a strange realm",
];

const DUO_RULES = `THIS POST IS A DUO POST: "who are you and your bro?" The reader picks the pair that is him and his best friend, then sends it to that friend.
- "title": the cover question, 4-8 words, ALL-CAPS ready, ending with "?" (shapes like "WHICH DUO ARE YOU AND YOUR BRO?", "WHO ARE YOU TWO ON THE QUEST?"; new words every post, never a recent title).
- Each option is a PAIR of two characters: "name" is the duo, 3-7 words with "&" ("The Knight & The Wyvern", "Samurai & Spirit Fox"). "lore" is one line (6-14 words) about what they do together: the quest, the fight, how they cover each other. Make each duo a different friendship dynamic (the reckless one and the one who saves him, two loyal brawlers, the brains and the muscle, the chaos pair, the silent pair) so the pick says something about the friendship.
- "scene": BOTH characters together in one frame, clearly two figures, mid-quest or fighting side by side, full bodies visible, epic setting matched to them.
- "motion": one measured thing the two do together in five seconds, at natural speed (they turn back to back and raise their weapons; the rider leans forward as the dragon glides through cloud).
- "endCard": 2-6 words, ALL-CAPS ready, telling him to send it to his bro; vary it every post ("SEND THIS TO YOUR BRO.", "TAG YOUR RIDE OR DIE.", "SEND IT. HE KNOWS.").
- "captionQuestion": asks which duo they are and to tag the friend ("Which duo are you two? Tag him.").
Everything else in the format above still applies.`;

/**
 * PLACE mode (2026-09-29, per Keenan: "add super cool PLACES to go to...
 * 'where would you get a beer with bro?' or 'what tavern are you tearing up
 * with bro?'"). Five legendary locations instead of characters.
 */
export const PLACE_CATEGORIES = [
  "legendary taverns and inns to tear up with your bro",
  "where you and your bro grab a beer after the quest",
  "a hideout or base for you and your crew",
  "an arena or proving ground to fight in together",
  "a realm or city to explore with your bro",
  "a feast hall to celebrate the win",
  "where you and your bro make your last stand when the kingdom falls",
  "where you and your bro hide out when a plague of the undead covers the realm",
  "which fortress you and your bro defend",
  "which realm you and your bro enter when a portal opens",
  "where you and your maiden go for a weekend away",
  "which town you and your bae settle down in",
  "your sanctuary as the realm falls",
];

const PLACE_RULES = `THIS POST IS A PLACES POST: the options are five legendary LOCATIONS, not characters. The reader picks where he and his bro are going.
- "title": the cover question, 4-9 words, ALL-CAPS ready, ending with "?" (shapes like "WHICH TAVERN ARE YOU TEARING UP WITH YOUR BRO?", "WHERE ARE YOU TWO GRABBING A BEER?"; new words every post, never a recent title).
- Each option is a PLACE: "name" is 2-5 words ("The Drowned Dragon Inn", "Skyforge Mead Hall"). "lore" is one line (6-14 words) about what goes down there: the drinks, the fights, the view, the house rule. Make the five places feel completely different (a rowdy dockside tavern, a quiet mountain hall, a place built into a sleeping giant, a floating sky-market, an underground fight pit), so the pick says something about the pair.
- "scene": the PLACE is the subject, never a creature or hero. Describe the architecture, the room or the landscape filling the frame: the long feast tables, the carved pillars, the hearth, the view, the light. No creature, beast, hero or character in the foreground or as the focus; at most a few tiny, distant figures to show scale. (2026-09-30, per Keenan: the "where are you feasting" post showed creatures instead of the places.)
- "coverScene": the most inviting of these places, or a sweeping establishing shot of a legendary place, with no hero or creature as the subject.
- "motion": calm atmospheric movement in five seconds, at natural speed (firelight flickers and lanterns sway as snow drifts past the door; mist rolls across the torch-lit bridge).
- "endCard": 2-6 words, ALL-CAPS ready, telling him to send it to his bro or pick the spot; vary it every post ("SEND THIS TO YOUR BRO.", "WHERE ARE WE GOING?", "FIRST ROUND'S ON HIM.").
- "captionQuestion": asks which spot they're hitting and to tag the friend.
Where these rules differ from the format above (scene, coverScene, motion), THESE win: a places post never makes a creature or hero the subject of an image. Everything else in the format above still applies.`;

/**
 * KNOW mode (2026-09-30, from Keenan's reference account): "IF YOU KNOW
 * HER, WHAT ARMOR DOES SHE CHOOSE?" — a post built to be SENT to one
 * specific person. Alternates him / her.
 */
export const KNOW_CATEGORIES = [
  "if you know her, what legendary armor does she choose",
  "if you know him, what legendary armor does he choose",
  "if you know her, what weapon does she wield",
  "if you know him, what legendary weapon does he choose",
  "if you know her, what war helm does she choose",
  "if you know him, what warrior is he",
  "if you know her, what legendary mount does she ride into battle",
  "if she ruled the realm, which queen would she be",
];

const KNOW_RULES = `THIS POST IS A "IF YOU KNOW HIM / HER" POST: the reader thinks of one specific person and sends the post to them.
- "title": the cover question, 6-11 words, ALL-CAPS ready, ending with "?", in the shape "IF YOU KNOW HER, WHAT ARMOR DOES SHE CHOOSE?" / "IF YOU KNOW HIM, WHAT WARRIOR IS HE?" (match the subject given; new wording for the item every post).
- Each option is one distinct item or warrior: "name" is 2-5 words ("Obsidian Valkyrie Plate", "The Sunforged Greatsword"). Each one shows a different personality (the elegant one, the wild one, the dark one, the regal one, the fierce one), so picking it says something about that person.
- "scene": the item worn or wielded by one heroic figure of that gender, full figure or three-quarter, powerful and armored, epic setting. Women are portrayed as fierce, capable warriors in full armor, never sexualized.
- "endCard": 2-6 words, ALL-CAPS ready, telling them to send it to that person ("SEND THIS TO HER.", "SEND IT TO HIM.", "SHE KNOWS IT'S HER.").
- "captionQuestion": asks which number that person is and to tag them.
Everything else in the format above still applies.`;

/**
 * SCENARIO mode (2026-09-30, from Keenan's reference account): a one-line
 * story setup, then the choice — "YOU CLEARED THE DUNGEON. CHOOSE YOUR
 * LEGENDARY ITEM." The setup is the hook.
 */
export const SCENARIO_CATEGORIES = [
  "you cleared the dungeon: choose your legendary item",
  "you have 100 gold: hire your mercenary company",
  "the royal tournament begins: which event are you entering",
  "the high priest grants you one artifact for your quest: which one",
  "they attack at dawn: choose your legendary weapon",
  "you've reached the final boss: choose your weapon",
  "you've entered a strange realm: choose your unit",
  "the quest paid enough to retire: choose your new life",
  "a dying king offers you one reward: which one",
];

const SCENARIO_RULES = `THIS POST IS A SCENARIO POST: the cover sets up a short story moment, then asks for the choice.
- "title": the cover, 6-12 words, ALL-CAPS ready: one short setup sentence then the choice ("YOU CLEARED THE DUNGEON. CHOOSE YOUR LEGENDARY ITEM.", "THE TOURNAMENT BEGINS. WHICH EVENT ARE YOU ENTERING?"). Use the scenario given, in fresh words.
- Each option fits the scenario (an item, a unit, an event, a reward, a new life) and is clearly different from the others, so the pick says something about the reader. "name" is 2-5 words, easy to type in a comment.
- "coverScene": the moment of the setup itself (a knight kneeling at an open treasure chest glowing gold; banners and a packed arena at dawn).
- "endCard": 2-6 words asking for their pick in the scenario's voice ("CHOOSE WISELY.", "WHAT'S YOUR PICK?", "ONE CHOICE. MAKE IT.").
Everything else in the format above still applies.`;

type ChoiceTopicOpts = {
  /** "duo" = who-are-you-and-your-bro; "place" = where you two are going;
   *  "know" = if you know him/her; "scenario" = story setup + choice. */
  mode?: "choice" | "duo" | "place" | "know" | "scenario";
  category: string;
  theme?: string;
  recentTitles: string[];
  recentNames: string[];
  feedback?: string | null;
};

/**
 * Write a choice/duo/place post, then check the five options with Jev
 * (#6, 2026-09-30): a post only works when all five are tempting AND
 * different, so near-twins ("Frost Dragon" next to "Ice Wyrm") and a
 * throwaway option each earn ONE rewrite with the problem named. Also
 * honors the copy check's flags. Fails open: Jev off or erroring ships
 * the first draft, and a failed rewrite ships the first draft.
 */
export async function generateChoiceTopic(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  return withBestTitle(await generateChoiceTopicChecked(opts), opts.mode ?? "choice");
}

/**
 * Best-of-5 cover question (Jev #1): Sonnet writes four more cover
 * questions for the same five options, Jev scores all five, the top one
 * ships. Fails open to the writer's title.
 */
async function withBestTitle(topic: ChoiceTopic, mode: NonNullable<ChoiceTopicOpts["mode"]>): Promise<ChoiceTopic> {
  try {
    const { pickBestCover } = await import("./cover-picker");
    const picked = await pickBestCover({
      label: `mythic-${mode}`,
      brand: "mythicals",
      lane: `mythic-picks:${mode}`,
      current: topic.title,
      context: `Five options on the slides: ${topic.options.map((o) => `${o.name} (${o.lore})`).join("; ")}`,
      rules:
        mode === "duo"
          ? "A cover question, 4-9 words, ALL CAPS, ending with \"?\", asking which duo the reader and his bro are."
          : mode === "place"
            ? "A cover question, 4-9 words, ALL CAPS, ending with \"?\", asking where the reader and his bro are going (a tavern, hall or legendary place)."
            : mode === "know"
              ? "A cover question, 6-11 words, ALL CAPS, ending with \"?\", in the shape \"IF YOU KNOW HER, WHAT ARMOR DOES SHE CHOOSE?\" (same him/her and same item type as the original)."
              : mode === "scenario"
                ? "A cover, 6-12 words, ALL CAPS: one short story setup then the choice, ending with \"?\" or \".\" (\"YOU CLEARED THE DUNGEON. CHOOSE YOUR LEGENDARY ITEM.\"). Same scenario as the original."
                : "A cover question, 4-9 words, ALL CAPS, ending with \"?\", asking which of the five the reader would choose or which one is him.",
    });
    const h = picked?.headline.trim();
    if (!h || h === topic.title || (mode !== "scenario" && !h.endsWith("?"))) return topic;
    const prefix = topic.slug.match(/^mythic(-duo|-place|-know|-scenario)?/)?.[0] ?? "mythic";
    const slug = `${prefix}-${h.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)}`;
    console.log(`[choice-lane] best-of-5 cover "${topic.title}" -> "${h}"`);
    return { ...topic, title: h, slug };
  } catch (err) {
    console.warn("[choice-lane] best-of-5 cover failed — keeping the writer's title:", err instanceof Error ? err.message : err);
    return topic;
  }
}

async function generateChoiceTopicChecked(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  const first = await generateChoiceTopicOnce(opts);
  const firstProblems = await choiceTopicProblems(first);
  if (firstProblems.length === 0) return first;
  console.warn(`[choice-lane] "${first.title}" rejected: ${firstProblems.join("; ")} — rewriting once`);
  try {
    const second = await generateChoiceTopicOnce({
      ...opts,
      feedback: `${opts.feedback ?? ""}\n\nREJECTED DRAFT "${first.title}" (${first.options
        .map((o) => o.name)
        .join(", ")}): ${firstProblems.join("; ")}. Write a new post that fixes this: five options that are each tempting and clearly different from each other.`,
    });
    const secondProblems = await choiceTopicProblems(second);
    if (secondProblems.length > firstProblems.length) {
      console.warn(`[choice-lane] rewrite was worse (${secondProblems.join("; ")}) — shipping the first draft`);
      return first;
    }
    return second;
  } catch (err) {
    console.warn("[choice-lane] rewrite failed — shipping the first draft:", err instanceof Error ? err.message : err);
    return first;
  }
}

const TWIN_THRESHOLD = 0.8;
const THROWAWAY_THRESHOLD = 0.25;

async function choiceTopicProblems(topic: ChoiceTopic): Promise<string[]> {
  const problems: string[] = [];
  const flag = copyFlagFor(topic.title);
  if (flag) problems.push("the copy check flagged the text (a line that doesn't make plain sense)");
  const { askJev, noulOf, scoreOf } = await import("./jev");
  const questions: Parameters<typeof askJev>[2] = {};
  topic.options.forEach((_, i) => {
    questions[`twin_${i}`] = {
      type: "noul",
      instructions: `Ignoring what every option must share to answer \`question\`, is \`options[${i}]\` nearly a copy of one OTHER entry in \`options\`: the same element, look and idea under a different name (like a frost dragon next to an ice wyrm)?`,
    };
    questions[`tempt_${i}`] = {
      type: "score",
      instructions: `How much would a fantasy fan reading \`question\` want to pick \`options[${i}]\`?`,
      criteria: [
        "Not at all: a dull or throwaway pick nobody would choose",
        "A little: fine but forgettable next to the others",
        "Clearly: a pick plenty of people would argue for",
        "Hugely: the one people would fight about in the comments",
      ],
    };
  });
  const r = await askJev(
    "choice-diversity",
    { question: topic.title, options: topic.options.map((o) => ({ name: o.name, lore: o.lore })) },
    questions
  );
  if (!r) return problems;
  const twins: string[] = [];
  const weak: string[] = [];
  topic.options.forEach((o, i) => {
    const t = noulOf(r, `twin_${i}`);
    const s = scoreOf(r, `tempt_${i}`);
    if (t !== null && t >= TWIN_THRESHOLD) twins.push(o.name);
    if (s !== null && s < THROWAWAY_THRESHOLD) weak.push(o.name);
  });
  console.log(
    `[choice-lane] Jev check "${topic.title}": ` +
      topic.options
        .map((o, i) => `${o.name} twin=${noulOf(r, `twin_${i}`)?.toFixed(2)} tempt=${scoreOf(r, `tempt_${i}`)?.toFixed(2)}`)
        .join(" | ")
  );
  // One twin flag alone can be the model noticing its partner; two or more is a real pair.
  if (twins.length >= 2) problems.push(`these options are too alike: ${twins.join(", ")}`);
  if (weak.length) problems.push(`these options are throwaways nobody would pick: ${weak.join(", ")}`);
  return problems;
}

async function generateChoiceTopicOnce(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
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
    system: `${SYSTEM}${
      opts.mode === "duo"
        ? `\n\n${DUO_RULES}`
        : opts.mode === "place"
          ? `\n\n${PLACE_RULES}`
          : opts.mode === "know"
            ? `\n\n${KNOW_RULES}`
            : opts.mode === "scenario"
              ? `\n\n${SCENARIO_RULES}`
              : ""
    }\n\n${HUMAN_VOICE_RULES}`,
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

  // Copy check on reader-facing text (never scenes): dash fix + Jev flags,
  // no rewriting since 2026-09-30. Fails open.
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

  const slug = `${opts.mode && opts.mode !== "choice" ? `mythic-${opts.mode}` : "mythic"}-${gatedTitle
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

/**
 * Image prompt for a cover or option: hyper-real epic film still, subject
 * in the middle band. Places posts frame the LOCATION as the subject.
 */
export function buildMythicImagePrompt(
  scene: string,
  kind: "cover" | "option",
  mode: NonNullable<ChoiceTopicOpts["mode"]> = "choice"
): string {
  if (mode === "place") {
    return [
      `A breathtaking, hyper-real cinematic establishing shot, vertical composition: ${scene}`,
      "The PLACE itself is the subject: its architecture, interior or landscape fills the frame, rich with detail and inviting atmosphere. No creature, beast, hero or character as the subject or in the foreground; at most a few tiny, distant figures for scale.",
      kind === "option"
        ? "Keep open atmosphere in the top fifth of the frame (the place's name is added there later)."
        : "Keep open atmosphere in the top quarter (the title is added there later).",
      "Shot like a prestige fantasy film: real weather, real light, tactile detail in wood, stone, fire, water and fabric, dramatic but natural lighting, rich color, tack-sharp focus.",
      "Not a cartoon, not anime, not a video-game render, not a painting or illustration. No text, letters, numbers, logos or watermarks anywhere in the image. Nothing gory.",
    ].join("\n");
  }
  return [
    `A breathtaking, hyper-real cinematic film still, vertical composition: ${scene}`,
    kind === "option"
      ? "The creature or fighter is the unmistakable hero of the frame, shown whole and centered in the MIDDLE of the image, with open sky or atmosphere in the top fifth of the frame (its name is added there later)."
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
