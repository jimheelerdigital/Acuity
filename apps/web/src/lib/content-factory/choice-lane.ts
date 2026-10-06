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
  /** CompetitorPost id of the research brief this post was built on (pick lanes, 2026-10-01). */
  researchSeed?: string;
  /** Jev's scores for the chosen pick concept, kept for calibration (2026-10-02). */
  jev?: Record<string, number>;
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
  "a legendary armored hero to fight beside them (dragon knight, rune-armored valkyrie, titan-slayer, demon-hunter, storm paladin, each in sick mythic armor with a legendary weapon)",
  "a guardian creature to protect their home",
  "a companion beast that follows them into the unknown",
  "a creature of the sea or deep to command",
  "a colossal mythical alpha to lead their pack (dire wolf the size of a house, Fenrir-kin, Nemean lion, nine-tailed beast; never an ordinary wolf, lion or big cat)",
  "a colossal sky-beast to summon (phoenix, thunderbird, roc, storm dragon; never an ordinary bird)",
  "a beast from world mythology to have on their side (kitsune, qilin, griffin, kraken, fenrir, simurgh, thunderbird and more)",
  "an armored war-mount for battle",
  "a mythical creature that matches their personality",
  // 2026-09-30: catalog widened from Keenan's reference account
  // (the_mage_page_, doing very well with these shapes).
  "legendary armor to wear into battle",
  "a legendary weapon to wield",
  "a war helm to wear",
  "a mythical companion to raise from a hatchling",
  "a colossal war beast to command in battle",
  // 2026-09-30, per Keenan: "add 'which superpower would you pick' and
  // 'which weapon would you choose' as options too".
  "which superpower would you pick (a legendary power: command storms, shapeshift into a beast, walk through shadow, bend fire, speak with dragons, stop time)",
  "which weapon would you choose (each a legendary weapon with its own power and story)",
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
  - "motion": one sentence for its five-second clip: the subject stays essentially STILL in its pose (slow breathing, a slight head turn at most) while its SIGNATURE POWER plays on it as a subtle, cool EFFECT, not an action (the frost dragon's eyes glow icy blue as frost mist curls from its jaws and scales; lightning flickers quietly between the storm wyvern's horns; embers drift off the obsidian armor as its runes pulse orange; pale blue flame licks along the resting blade). The ONLY actions allowed are slow, powerful wingbeats and a dragon or creature breathing fire or ice (into the sky or across the landscape, never at a person) (2026-10-05, per Keenan: "wing beats is ok, and so is breathing fire or ice, but that's it"). Everything else is banned: no attacks, no swings, no rearing, no charging, no leaping, no lunging. The subject stays in frame.
- The five options must be genuinely different kinds of choice (a loyal one, a wild one, a patient one, a terrifying one, a wise one), so that picking one says something about the person picking. All five should be tempting; none is the obvious joke or throwaway.
- "coverScene": the cover image: an epic establishing shot that sets up the question without showing all five options (a lone rider on a ridge looking out at a stormy sky full of shapes, an armory hall, a vast lair entrance).
- "coverMotion": one sentence of SUBTLE, atmospheric movement for the cover's five-second clip: only the environment and light move (mist drifts, embers float, clouds roll slowly, torchlight flickers); any creature or hero stays still apart from breathing or a slow blink. No big reveals, charges or camera swoops (a slow wingbeat is fine) (2026-10-05, per Keenan: the opening animations looked "way too over the top").
- "endCard": the closing line, 2-6 words, ALL-CAPS ready, asking for their pick. Vary it every post ("WHICH ONE IS YOURS?", "COMMENT YOUR NUMBER.", "CHOOSE WISELY.", "ONE CHANCE. PICK."); never reuse a recent end card.
- "captionQuestion": one short caption question that gets a pick AND a reason in the comments ("Which one, and what would you name it?").
- Creatures of legend from any culture are welcome, and so are original inventions. Keep them respectful and not gory. No emojis.

TITLE STYLE (2026-10-06, per Keenan, after "ONE ARMOR TO SURVIVE A DRAGON'S BREATH. IF YOU KNOW HIM, WHICH?": "this makes no sense and sounds horrible... just ask the reader what they'd pick"):
- The title is a plain, natural question or instruction TO THE READER, the way a person would actually say it out loud. Read it aloud: if it sounds odd, rewrite it.
- Good: "A DRAGON IS BREATHING FIRE AT YOU. WHICH ARMOR DO YOU USE TO DEFEND YOURSELF?", "PICK YOUR ARMOR TO SURVIVE A DRAGON'S FIRE BREATH", "PICK THE ARMOR YOU'RE SURVIVING A DRAGON'S FIRE BREATH IN".
- Never a fragment ("ONE ARMOR TO SURVIVE..."), never two ideas stitched together, never "IF YOU KNOW HIM/HER" or "SEND THIS TO..." unless this post is explicitly an if-you-know post. Ask what THEY would pick.
- Every option answers the title. If the title asks for armor, all five options are armor, and each scene shows that armor as the hero (worn by a warrior or on display); a dragon or other threat may appear only small in the background.

EPIC, NEVER ORDINARY (2026-10-02, per Keenan: "focus more on beasts and weapons and mythical creatures and sick armor... the cooler concept, the better. size also matters"):
- Every creature is a MYTHICAL beast: dragons, wyverns, krakens, griffins, chimeras, hydras, basilisks, titans, phoenixes, and colossal legendary versions of animals. Never a real-world animal (no jaguars, dogs, wolves, lions, horses, tortoises, ordinary birds), even with a fancy name, unless it is unmistakably mythical: huge, armored, elemental or many-headed.
- Every creature is BIG: colossal, towering, dwarfing the people and places around it. Say its scale in the scene.
- EVERY DRAGON HAS WINGS (2026-10-04, per Keenan): dragons, wyrms, drakes and wyverns always have big, clearly visible wings, and their scenes say so. No wingless serpent dragons or lizard-like dragons.
- NO HUMAN FACES ON CREATURES (2026-10-04, per Keenan, after "The Bronze Lamassu" with a bearded man's face): no lamassu, sphinxes, manticores, centaurs, harpies, nagas or sirens, and no man-like faces on any beast. A creature's face is fully animal, reptilian or monstrous.
- Every hero is a legendary, larger-than-life warrior in sick mythic armor with a legendary weapon: dragon knights, titan-slayers, rune-armored valkyries, demon hunters. Never an ordinary person, a job or a quiet life (no fishers, cartographers, archivists, innkeepers).
- Weapons and armor are legendary and striking: forged from dragon bone, storm-forged, glowing runes, ornate and intimidating.
- SIGNATURE POWERS AS EFFECTS (2026-10-04 powers, toned down 2026-10-05 per Keenan): every option has one visible power, shown in its scene and in its "motion" as a minor, cool EFFECT on a still subject: glowing eyes or runes, embers or sparks drifting off, flames licking along armor or a blade, frost mist curling from scales or jaws, faint lightning crackling across horns or plates, an aura of light. Breathing fire or ice and slow wingbeats are the only actions allowed. Fit it to the creature, weapon or armor. Each option's power is different.
- BEASTS NEVER USE WEAPONS (2026-10-05, per Keenan: "it's a god damn beast, it can't use a sword"): a creature never holds, swings or wields a sword, axe, spear or any weapon. Only a humanoid hero or warrior may hold a weapon, and even then it rests in hand, never swung.
- No places, towns, inns, taverns or "new lives" as options.

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
  "two legendary armored champions back to back, each in sick mythic armor with a legendary weapon",
  "dragon + rider duos, each pair a different kind of dragon",
  "unlikely duos: a creature and a warrior from completely different legends",
  "sibling beasts and twin guardians",
  "a battle-mage and an armored champion against a colossal beast",
  "which colossal beast you and your bro ride into war",
  "which legendary weapons you and your bro carry into the final battle",
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
  "you cleared the dungeon: choose your legendary weapon",
  "you slew the dragon: choose your armor forged from its scales",
  "they attack at dawn: choose your legendary weapon",
  "you've reached the final boss: choose your weapon",
  "a dragon egg hatches for you: choose your dragon",
  "the realm is falling: choose the colossal beast you ride into battle",
  "the gods offer you one set of armor: which one",
  "you enter the beast's lair: choose the mythical creature that fights beside you",
];

const SCENARIO_RULES = `THIS POST IS A SCENARIO POST: the cover sets up a short story moment, then asks for the choice.
- "title": the cover, 6-12 words, ALL-CAPS ready: one short setup sentence then the choice ("YOU CLEARED THE DUNGEON. CHOOSE YOUR LEGENDARY ITEM.", "THE TOURNAMENT BEGINS. WHICH EVENT ARE YOU ENTERING?"). Use the scenario given, in fresh words.
- Each option fits the scenario (an item, a unit, an event, a reward, a new life) and is clearly different from the others, so the pick says something about the reader. "name" is 2-5 words, easy to type in a comment.
- "coverScene": the moment of the setup itself (a knight kneeling at an open treasure chest glowing gold; banners and a packed arena at dawn).
- "endCard": 2-6 words asking for their pick in the scenario's voice ("CHOOSE WISELY.", "WHAT'S YOUR PICK?", "ONE CHOICE. MAKE IT.").
Everything else in the format above still applies.`;

/**
 * SIZE mode (2026-10-01, per Keenan: "'how big would they really be' is
 * crushing" — part 1 got ~11x the usual views — "keep it as a series ...
 * that consistently posts daily"). Removed 2026-10-04, back 2026-10-05 as
 * five kaiju-film shots: each creature in an iconic real place from a
 * cinematic angle (no "as big as a school bus" comparisons), smallest to
 * biggest. Fixed series title "HOW BIG WOULD THEY REALLY BE?
 * PART N" (N set by the cron from how many have run).
 */
export const SIZE_CATEGORIES = [
  // 2026-10-05 rewrite (Keenan: "super cool perspective shots ... no more
  // 'as big as a school bus'. that's super lame. think more godzilla
  // standing in a city, dragon on a football stadium, kraken over an
  // aircraft carrier"): iconic real places, cinematic angles.
  "monsters in great cities: avenues, skylines, bridges, harbors",
  "monsters at sea: carrier groups, container ports, oil rigs, lighthouses",
  "monsters on landmarks and arenas: stadiums, towers, dams, monuments",
  "monsters in the sky and on mountains: airliners, summits, cloud tops over cities",
  "mixed legends from different myths across the world's most famous places",
];

const SIZE_RULES = `THIS POST IS A POST in the series "HOW BIG WOULD THEY REALLY BE?": five colossal legendary creatures shown at their true size in the real world, each in a jaw-dropping cinematic shot.
- "title": exactly the series title you are given. Do not change it.
- Each option is ONE colossal creature. "name" is ALL-CAPS ready, 2-6 words: the creature and ONE bold measurement ("THE KRAKEN: 400 M", "BAHAMUT: 2 KM LONG", "FENRIR: 90 M AT THE SHOULDER", "THE ROC: 300 M WINGSPAN"). NEVER compare it to an everyday object (no "as big as a school bus", no "taller than a house", no "size of a bus"); the picture shows the scale. Sizes are huge and epic: tens to hundreds of meters, up to kilometers for the biggest.
- Order the five from SMALLEST to BIGGEST, so the post builds to the biggest reveal.
- "scene": the creature in an ICONIC, instantly recognizable real place, filmed like a blockbuster, in the spirit of a kaiju film: a titan standing between skyscrapers on a city avenue at night with traffic and people far below, a dragon perched on the rim of a packed football stadium under the floodlights, a kraken rising out of the ocean and wrapping an aircraft carrier, a serpent coiled around a suspension bridge, a phoenix over a cityscape at dusk, a colossal wolf on a mountain above a lit town, a sky whale passing an airliner. Say the camera angle and why it's dramatic: street level looking up, from a helicopter, from the stadium stands, from the deck of a ship, from a skyscraper roof, from inside an airliner window. The real place, the people and the vehicles must be clearly visible and recognizable so the scale is obvious and stunning. Different place, creature type and angle for all five.
- "coverScene": the most iconic colossal shot of all: a giant silhouette looming over a famous skyline or harbor at dusk.
- "motion": slow, heavy, majestic movement that shows its bulk, at natural speed (the titan takes one ground-shaking step as cars stop; the kraken's tentacles tighten around the carrier as spray explodes; the dragon spreads its wings over the stadium as floodlights flicker).
- "endCard": exactly "WHICH ONE WOULD YOU RUN FROM?"
- "captionQuestion": asks which one they'd run from, or which one they'd least want to see in their city.
- Never repeat a creature or a place used in recent posts of this series if you can avoid it.
Everything else in the format above still applies.`;

/**
 * VERSUS mode (2026-10-01, per Keenan: "monsters versus monsters, who would
 * win? 5 fights between two monsters, both pictured"). Five matchups; every
 * slide shows BOTH monsters in one frame squaring off. Built for comments
 * (people argue the winner of each fight).
 */
export const VERSUS_CATEGORIES = [
  "sea monsters vs sky monsters",
  "dragons vs giant beasts",
  "monsters from Norse myth vs monsters from Greek myth",
  "apex predators of legend, evenly matched",
  "fire creatures vs ice creatures",
  "serpents vs winged beasts",
  "titans and giants vs dragons",
  "underworld beasts vs heavenly beasts",
  "cryptids vs mythical beasts",
];

const VERSUS_RULES = `THIS POST IS A "WHO WOULD WIN?" POST: five fights, each between TWO legendary monsters.
- "title": the cover question, 4-9 words, ALL-CAPS ready, ending with "?" ("MONSTER VS MONSTER: WHO WOULD WIN?", "FIVE FIGHTS. WHO WINS EACH ONE?"; new words every post, never a recent title).
- Each option is one MATCHUP: "name" is ALL-CAPS ready, "MONSTER A VS MONSTER B", 3-7 words ("KRAKEN VS LEVIATHAN", "FENRIR VS CERBERUS", "THE ROC VS THE THUNDERBIRD"). "lore" is one line (6-14 words) on why the fight is close: what each one has going for it. Make every matchup genuinely close and debatable; never an obvious mismatch. Ten different monsters across the five fights.
- "scene": BOTH monsters in ONE frame, facing each other, squaring off or locked in combat, BOTH whole bodies clearly visible and equally prominent (neither hidden, cropped or in the far background), in a setting that suits the fight (a storm-lashed sea, a volcanic plain, a frozen fjord). Not gory: power, tension and impact, no wounds or blood.
- "coverScene": two colossal monsters about to collide, both clearly visible, epic setting.
- "motion": one measured clash beat in five seconds at natural speed (they lunge and collide as the waves explode around them; the dragon dives and the wolf rears up to meet it). Both keep their shapes.
- "endCard": 2-6 words asking for their winners ("COMMENT YOUR WINNERS. 1 TO 5.", "WHO WINS EACH FIGHT?", "PICK YOUR WINNERS."); vary it.
- "captionQuestion": asks who wins each fight, answered by number.
Everything else in the format above still applies.`;

type ChoiceTopicOpts = {
  /** "duo" = who-are-you-and-your-bro; "place" = where you two are going;
   *  "know" = if you know him/her; "scenario" = story setup + choice. */
  mode?: "choice" | "duo" | "place" | "know" | "scenario" | "size" | "versus";
  category: string;
  /** SIZE mode: the series part number for "HOW BIG WOULD THEY REALLY BE? PART N". */
  part?: number;
  theme?: string;
  recentTitles: string[];
  recentNames: string[];
  feedback?: string | null;
  /**
   * Exact cover question requested by hand (2026-10-04, per Keenan). Locks
   * the title: the best-of-5 cover step and any rewrite can't replace it.
   */
  fixedTitle?: string;
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
  const topic = await generateChoiceTopicChecked(opts);
  if (opts.fixedTitle) {
    let title = opts.fixedTitle.trim().toUpperCase();
    if (!/[?.!]$/.test(title)) title += "?";
    const prefix = topic.slug.match(/^mythic(-duo|-place|-know|-scenario|-size|-versus)?/)?.[0] ?? "mythic";
    const slug = `${prefix}-${title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)}`;
    return { ...topic, title, slug };
  }
  // The size series keeps its fixed title (no best-of-5 cover).
  return opts.mode === "size" ? topic : withBestTitle(topic, opts.mode ?? "choice");
}

/** The size series' title for part N. */
export function sizeSeriesTitle(part: number): string {
  return `HOW BIG WOULD THEY REALLY BE? PART ${part}`;
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
                : mode === "versus"
                  ? "A cover question, 4-9 words, ALL CAPS, ending with \"?\", asking who would win the five monster fights (\"MONSTER VS MONSTER: WHO WOULD WIN?\")."
                : "A cover question, 4-9 words, ALL CAPS, ending with \"?\", asking which of the five the reader would choose or which one is him.",
    });
    const h = picked?.headline.trim();
    if (!h || h === topic.title || (mode !== "scenario" && !h.endsWith("?"))) return topic;
    const prefix = topic.slug.match(/^mythic(-duo|-place|-know|-scenario|-size|-versus)?/)?.[0] ?? "mythic";
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
/** Below this "epic and mythical" probability an option earns a rewrite (2026-10-02). */
const EPIC_MIN = 0.5;

/** Below this, an option doesn't read as what the title promises (2026-10-04). */
const KIND_MIN = 0.5;
/** 2026-10-06: each option's PICTURE must show the asked-for thing as the hero. */
const SCENE_MIN = 0.5;
/** 2026-10-06: the title must read as a natural question/instruction to the reader. */
const TITLE_CLEAR_MIN = 0.5;
/** At or above this, an option is a human-faced creature (2026-10-04). */
const HUMAN_FACE_MAX = 0.5;

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
    questions[`epic_${i}`] = {
      type: "noul",
      instructions: `Is \`options[${i}]\` an epic, mythical concept: a colossal mythical beast, a legendary weapon, legendary armor, or a larger-than-life legendary armored hero?`,
      criteria: {
        true: "Yes: mythical and epic, the kind of thing a fantasy fan finds sick",
        false: "No: a real-world animal, an ordinary person or job, a place, or everyday life",
      },
    };
    // 2026-10-04 (Keenan, after "Bogmire the Patient" in "ONE EGG. FIVE
    // POSSIBLE DRAGONS"): every option must read as the thing the title
    // promises, from its name alone.
    questions[`kind_${i}`] = {
      type: "noul",
      instructions: `\`question\` promises a kind of thing (for example "five possible dragons" promises dragons). From its NAME alone, does \`options[${i}].name\` unmistakably read as that kind of thing? If \`question\` doesn't promise one kind of thing, answer yes.`,
      criteria: {
        true: "Yes: the name alone says it is the promised kind of thing",
        false: "No: from the name you can't tell it's the promised kind of thing (e.g. 'Bogmire the Patient' for a dragon)",
      },
    };
    questions[`scene_${i}`] = {
      type: "noul",
      instructions: `\`question\` asks the reader to pick one kind of thing (armor, a weapon, a dragon, a mount...). Does \`options[${i}].scene\` make THAT thing the clear hero of the picture? A creature or threat in the background is fine; a scene where something else (like a dragon, when the question asks for armor) dominates is not.`,
      criteria: {
        true: "Yes: the picture's hero is the kind of thing the question asks the reader to pick",
        false: "No: something else dominates the picture (e.g. a dragon when the question is about armor)",
      },
    };
    questions[`humanface_${i}`] = {
      type: "noul",
      instructions: `Is \`options[${i}]\` a creature normally shown with a HUMAN face or human head (a lamassu, sphinx, manticore, centaur, harpy, naga, siren, or similar)? Armored human heroes and warriors are not creatures: answer no for them.`,
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
  questions.title_clear = {
    type: "noul",
    instructions:
      "Is `question` a plain, natural, grammatical question or instruction to the reader, the way a person would actually say it out loud? Good: 'PICK YOUR ARMOR TO SURVIVE A DRAGON'S FIRE BREATH', 'A DRAGON IS BREATHING FIRE AT YOU. WHICH ARMOR DO YOU USE?'. Bad: 'ONE ARMOR TO SURVIVE A DRAGON'S BREATH. IF YOU KNOW HIM, WHICH?' (a fragment plus a stitched-on 'if you know him').",
    criteria: {
      true: "Yes: reads naturally and asks the reader something clear",
      false: "No: a fragment, stitched-together, awkward or unclear",
    },
  };
  const r = await askJev(
    "choice-diversity",
    { question: topic.title, options: topic.options.map((o) => ({ name: o.name, lore: o.lore, scene: o.scene })) },
    questions
  );
  if (!r) return problems;
  const twins: string[] = [];
  const weak: string[] = [];
  const ordinary: string[] = [];
  const offKind: string[] = [];
  const humanFaced: string[] = [];
  const offScene: string[] = [];
  topic.options.forEach((o, i) => {
    const sc = noulOf(r, `scene_${i}`);
    if (sc !== null && sc < SCENE_MIN) offScene.push(o.name);
    const hf = noulOf(r, `humanface_${i}`);
    if (hf !== null && hf >= HUMAN_FACE_MAX) humanFaced.push(o.name);
    const k = noulOf(r, `kind_${i}`);
    if (k !== null && k < KIND_MIN) offKind.push(o.name);
    const t = noulOf(r, `twin_${i}`);
    const s = scoreOf(r, `tempt_${i}`);
    if (t !== null && t >= TWIN_THRESHOLD) twins.push(o.name);
    if (s !== null && s < THROWAWAY_THRESHOLD) weak.push(o.name);
    const e = noulOf(r, `epic_${i}`);
    if (e !== null && e < EPIC_MIN) ordinary.push(o.name);
  });
  console.log(
    `[choice-lane] Jev check "${topic.title}": ` +
      topic.options
        .map((o, i) => `${o.name} kind=${noulOf(r, `kind_${i}`)?.toFixed(2)} twin=${noulOf(r, `twin_${i}`)?.toFixed(2)} tempt=${scoreOf(r, `tempt_${i}`)?.toFixed(2)} epic=${noulOf(r, `epic_${i}`)?.toFixed(2)}`)
        .join(" | ")
  );
  // One twin flag alone can be the model noticing its partner; two or more is a real pair.
  if (twins.length >= 2) problems.push(`these options are too alike: ${twins.join(", ")}`);
  if (weak.length) problems.push(`these options are throwaways nobody would pick: ${weak.join(", ")}`);
  if (humanFaced.length)
    problems.push(
      `these creatures have human faces, which Keenan never wants: ${humanFaced.join(", ")}. Replace them with creatures whose faces are fully animal, reptilian or monstrous`
    );
  if (offScene.length)
    problems.push(
      `these options' pictures don't show what the title asks the reader to pick as the hero: ${offScene.join(", ")}. Rewrite their scenes so that thing fills the frame (worn, wielded or on display); any creature or threat stays small in the background`
    );
  const clear = noulOf(r, "title_clear");
  if (clear !== null && clear < TITLE_CLEAR_MIN && !/^IF YOU KNOW/i.test(topic.title))
    problems.push(
      `the title doesn't read naturally ("${topic.title}"). Rewrite it as a plain question or instruction to the reader, e.g. "PICK YOUR ARMOR TO SURVIVE A DRAGON'S FIRE BREATH"`
    );
  if (offKind.length)
    problems.push(
      `these option names don't say they are what the title promises: ${offKind.join(", ")}. Rename them (and match their scenes) so the name alone makes it obvious, e.g. "Vyrnax the Emerald Dragon" or "The Storm Wyrm" when the title promises dragons`
    );
  if (ordinary.length)
    problems.push(
      `these options are realistic or ordinary, not epic: ${ordinary.join(", ")}. Replace them with colossal mythical beasts, legendary weapons, legendary armor or larger-than-life armored heroes`
    );
  return problems;
}

async function generateChoiceTopicOnce(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const user = [
    `This post's subject: ${opts.category}.`,
    opts.mode === "size" ? `Series title for this post (use it exactly): "${sizeSeriesTitle(opts.part ?? 1)}".` : "",
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
              : opts.mode === "size"
                ? `\n\n${SIZE_RULES}`
                : opts.mode === "versus"
                  ? `\n\n${VERSUS_RULES}`
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

  endCard = await fitEndCard(gatedTitle, endCard, opts.mode ?? "choice");

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
/** 2026-10-04 (Keenan: "no human faces on mythical creatures"). */
const NO_HUMAN_FACE_LINE =
  "No creature has a human face or human head: its face is fully animal, reptilian or monstrous (never a lamassu, sphinx, manticore or bearded man-like face on a beast). Every dragon, wyrm, drake or wyvern has large, clearly visible wings (2026-10-04, per Keenan).";

/**
 * The quality bar (2026-10-05, per Keenan, sending a reference frame: "we
 * should be aiming for this level of detail and quality in all of our
 * posts"): a colossal obsidian dragon's head filling the frame, glowing
 * magma in every crack, orange eyes, smoke and embers, a tiny cloaked
 * figure from behind for scale.
 */
const QUALITY_BAR_LINE =
  "QUALITY BAR: extreme, tactile detail on the subject. Every scale, plate, horn and rune is sharply defined, with cracks, chips and wear; glowing seams, embers or frost add light from within. A restrained palette: deep near-black and charcoal tones with ONE vivid accent color that glows (molten orange, icy blue, emerald or violet). Dramatic low-key lighting with volumetric smoke or fog, rim light on the edges, drifting embers or particles, and glowing eyes that hold the viewer. Bold, simple composition: the subject is big, close and frontal, staring into the lens.";
const COVER_SCALE_LINE =
  "SCALE: the creature is so colossal that its head or body fills most of the frame; one tiny cloaked figure stands in the foreground, seen from behind, facing it, to show the scale.";

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
  if (mode === "size" && kind === "option") {
    return [
      `A breathtaking, hyper-real cinematic film still, vertical composition, wide shot: ${scene}`,
      NO_HUMAN_FACE_LINE,
      "A blockbuster kaiju-film shot at true scale: the colossal creature in an iconic, instantly recognizable real place (city, stadium, harbor, bridge, carrier, skyline), from a dramatic cinematic angle. The real place, the people and the vehicles are clearly visible and tiny next to it, so the scale is obvious and awe-inspiring. The creature is the clear hero of the frame. Open sky or atmosphere in the top fifth of the frame (a label is added there later).",
      "Shot like a prestige film: real weather, real light, tactile detail, believable anatomy, true-to-life scale, tack-sharp focus.",
      "Not a cartoon, not anime, not a video-game render, not a painting or illustration. No text, letters, numbers, logos or watermarks anywhere in the image. Nothing gory.",
    ].join("\n");
  }
  if (mode === "versus" && kind === "option") {
    return [
      `A breathtaking, hyper-real cinematic film still, vertical composition: ${scene}`,
      NO_HUMAN_FACE_LINE,
      "BOTH monsters are in the frame, facing each other, whole bodies clearly visible and equally prominent in the MIDDLE of the image, neither cropped, hidden or tiny in the background. Both are colossal: their scale dwarfs the landscape around them. Open sky or atmosphere in the top fifth of the frame (the matchup is added there later).",
      "Shot like a prestige fantasy film: real weather, real light, tactile detail in scales, fur, feathers and stone, believable anatomy, dramatic but natural lighting, tack-sharp focus on both.",
      "Not a cartoon, not anime, not a video-game render, not a painting or illustration. No text, letters, numbers, logos or watermarks anywhere in the image. Nothing gory: no wounds, no blood.",
    ].join("\n");
  }
  return [
    `A breathtaking, hyper-real cinematic film still, vertical composition: ${scene}`,
    "Epic and mythical: a creature is COLOSSAL and imposing, its huge scale clear against the landscape around it; a hero is a larger-than-life warrior in ornate, intimidating legendary armor with a legendary weapon.",
    NO_HUMAN_FACE_LINE,
    QUALITY_BAR_LINE,
    kind === "cover"
      ? COVER_SCALE_LINE
      : "Show ONLY what the scene describes: never add a warrior, knight, rider or any person unless the scene names one (2026-10-05: a frost dragon option came back with an armored knight in front).",
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

/** Safe closing line per mode, used when the written one doesn't fit the post. */
const SAFE_END_CARD: Record<string, string> = {
  choice: "WHICH ONE IS YOURS?",
  duo: "SEND THIS TO YOUR BRO.",
  place: "SEND THIS TO YOUR BRO.",
  know: "SEND THIS TO THEM.",
  scenario: "WHAT'S YOUR PICK?",
  size: "WHICH ONE WOULD YOU RUN FROM?",
  versus: "PICK YOUR WINNERS.",
};

/**
 * End-card fit check (2026-10-02, per Keenan: "TRIPLE CHECK that all of our
 * social scripts were run through jev"). The copy check only screened for
 * nonsense, so "WHICH HIDDEN INN ARE YOU AND YOUR BRO BOOKING?" shipped
 * with "SEND THIS TO HER." Two layers: a hard rule for the person the
 * title names (him/bro vs her), then a Jev Noul on whether the closing line
 * fits the post. Anything that fails gets the mode's safe end card.
 * Jev failing open keeps the written card.
 */
export async function fitEndCard(
  title: string,
  endCard: string,
  mode: string
): Promise<string> {
  const safe = SAFE_END_CARD[mode] ?? SAFE_END_CARD.choice;
  const t = ` ${title.toUpperCase()} `;
  const e = ` ${endCard.toUpperCase().replace(/[^A-Z' ]/g, " ")} `;
  const titleMale = /\b(BRO|BROTHER|BROS|HIM|HIS|HE)\b/.test(t);
  const titleFemale = /\b(HER|SHE|QUEEN|GIRL|WIFE|SISTER)\b/.test(t);
  const cardMale = /\b(BRO|HIM|HE|HIS)\b/.test(e);
  const cardFemale = /\b(HER|SHE)\b/.test(e);
  if (
    (titleMale && !titleFemale && cardFemale) ||
    (titleFemale && !titleMale && cardMale)
  ) {
    console.warn(
      `[choice-lane] end card "${endCard}" names the wrong person for "${title}" — using "${safe}"`
    );
    return safe;
  }
  const { askJev, noulOf } = await import("./jev");
  const r = await askJev(
    "choice-endcard-fit",
    { postTitle: title, closingLine: endCard },
    {
      fits: {
        type: "noul",
        instructions:
          "A short social video opens with postTitle and ends with closingLine. Does closingLine make sense as the last line of THIS post: it asks for the same kind of answer the title asks for, and if it names a person (her, him, your bro) it is the same person the title is about?",
      },
    }
  );
  const fits = noulOf(r, "fits");
  if (fits !== null && fits < 0.4) {
    console.warn(
      `[choice-lane] Jev: end card "${endCard}" doesn't fit "${title}" (${fits.toFixed(2)}) — using "${safe}"`
    );
    return safe;
  }
  return endCard;
}
