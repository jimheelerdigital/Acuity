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
  /** Lock the lane to one post type instead of the daily mix. */
  mode?: "countdown";
}

export function parseChoiceLaneSpec(raw: unknown): ChoiceLaneSpec | null {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    theme: typeof r.theme === "string" ? r.theme : undefined,
    // A lane locked to one post type (2026-10-06: mythic-countdown = "countdown").
    mode: r.mode === "countdown" ? "countdown" : undefined,
  };
}

/**
 * Question families, rolled in code (inside the memoized Inngest step) so
 * a day's three posts land in different families. The model writes fresh
 * wording each time; these are subjects, not titles.
 */
// 2026-10-13 rebalance (per Keenan: "let's also get back to not just posting
// legendary creatures ... all of our original posts had the best prompts by
// far"): 10-02..10-12 added "colossal" beast categories until beasts were 12
// of 20 and the bandit locked onto dragons. Keenan's list is back in
// (armor, who guards your back, which creature is you, which mage, war
// mount, which queen), and the extra colossal-beast / hatchling categories
// are out.
export const CHOICE_CATEGORIES = [
  "which war-mount carries you into battle (winged, armored, clawed, serpentine; each with its rider's saddle and battle gear)",
  "which dragon the reader is (each dragon a temperament: storm, ember, frost, shadow, verdant, abyssal, celestial)",
  "who guards your back in battle: a legendary warrior to fight beside you (dragon knight, rune-armored valkyrie, titan-slayer, demon-hunter, storm paladin, each in sick mythic armor with a legendary weapon)",
  "which mythical creature is you (a mythical creature that matches your personality)",
  "which mage you are (a battle mage, a storm sorcerer, a rune-scribe, a frost witch, a druid of the old wood, a shadow warlock; each in striking robes or armor with a staff, tome or blade; magic shown as glowing runes, a softly glowing staff or tome and drifting embers, never blasts or auras)",
  "which queen you'd choose to follow (a warrior queen in battle plate, a dragon queen, an ice queen of the north, a sea queen, an elven queen of the wood; regal, crowned, in an epic throne room or on a battlefield)",
  "legendary armor to wear into battle",
  "a legendary weapon to wield",
  "a war helm to wear",
  "a guardian creature to protect their home",
  "a companion beast that follows them into the unknown",
  "a beast from world mythology to have on their side (kitsune, qilin, griffin, kraken, fenrir, simurgh, thunderbird and more)",
  "which weapon would you choose (each a legendary weapon with its own power and story)",
  // 2026-10-07, per Keenan (veyra_lore's "ONLY ONE WEAPON WILL OBEY YOU.
  // WHICH ONE WOULD YOU TRUST?"): "you can also do weapons like this where
  // they're standalone instead of with a character".
  "which legendary weapon would you trust, shown STANDALONE with no one holding it (each weapon alone on an altar, pedestal or anvil, driven into stone or suspended in a dark cathedral, forge, crypt or ruin; no person, hand or creature anywhere in its picture)",
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
  - "motion": one sentence for its clip, MEASURED like our best-animated posts of 10-04/10-05 (2026-10-13, per Keenan: "the model needs to have some movement but nothing crazy. similar to best era"): the subject holds its pose and comes alive in one clear, natural movement at real speed (a dragon breathes, turns its head and breathes a long jet of fire or ice; a griffin resettles its wings; a warrior shifts his stance and slowly turns the blade so it catches the light (weapons only ever move slowly, never swung or slammed); a war beast takes a few heavy steps), with small effects on it: glowing runes or eyes, embers or sparks drifting, flames licking along a blade or armor, frost mist curling, faint lightning across horns. The camera may make a slow, gentle push-in; nothing fast, no whip pans, no frantic action. VARIETY: every option does a DIFFERENT movement from the cover and from every other option, and AT MOST TWO of the five breathe. A breathing dragon fires from between its open jaws in the direction they point, never down its own chest.
- The five options must be genuinely different kinds of choice (a loyal one, a wild one, a patient one, a terrifying one, a wise one), so that picking one says something about the person picking. All five should be tempting; none is the obvious joke or throwaway.
- "coverScene": the cover picture, in the COVER STYLE named in the user message (2026-10-13, per Keenan: "our covers are getting way too similar every single time. mix in some of the older style covers"). Whatever the style, the five options are never fully revealed on the cover (the first full reveal is slide 2), and it is never a hidden giant, a lone silhouette in fog, or a single creature filling the frame.
- "coverMotion": one sentence of building ANTICIPATION for the cover's clip: a slow, gentle push-in while only small things move (a cloak stirs, mist rolls, embers drift, glows pulse one after another, a shadow passes). The five stay unrevealed to the last frame.
- "endCard": the closing line, 2-6 words, ALL-CAPS ready, asking for their pick. Vary it every post ("WHICH ONE IS YOURS?", "COMMENT YOUR NUMBER.", "CHOOSE WISELY.", "ONE CHANCE. PICK."); never reuse a recent end card.
- "captionQuestion": one short caption question that gets a pick AND a reason in the comments ("Which one, and what would you name it?").
- Creatures of legend from any culture are welcome, and so are original inventions. Keep them respectful and not gory. No emojis.

PROVEN WINNERS (2026-10-08, per Keenan: "our best posts with animation have been"... "use those as references to build better videos"). Study their SHAPE, then write new words; never reuse these titles:
- "WHICH OF THESE 5 DRAGONS WOULD YOU CHOOSE?"
- "WHICH DRAGON ARE YOU BONDING TO?"
- "PICK ONE DRAGON TO RIDE INTO BATTLE?"
- "WHICH WAR HELM CHOOSES YOU?"
- "YOU GET ONE LEGENDARY ARMOR. WHICH ONE DOES HE TAKE?"
- "WHICH MYTHICAL CREATURE CHOOSES YOU?"
- "ONE EGG. FIVE POSSIBLE DRAGONS. WHICH HATCHES TONIGHT?"
- "IF YOU KNOW HIM, WHICH LEGENDARY WEAPON IS HIS?"
- "PICK YOUR ARMOR TO SURVIVE A DRAGON'S BREATH"
- "WHICH MYTHICAL CREATURE IS YOU?"
- "WHICH WAR-MOUNT CARRIES YOU TO BATTLE?"
- "WHO GUARDS YOUR BACK IN BATTLE?"
- "THE LAST QUEST PAID OUT. YOU RETIRE TODAY. PICK YOUR NEW LIFE."
What they share: a personal one-of-five choice framed as identity or destiny ("chooses you", "is you", "carries you", "guards your back"); five clearly different, gorgeous options, one per slide. The SUBJECT changes post to post (2026-10-13, per Keenan): dragons and beasts, but just as often armor, helms, weapons, mages, queens, war mounts, companions in battle and new lives. Use the subject you're given; don't drift back to dragons.

TITLE STYLE (2026-10-06, per Keenan, after "ONE ARMOR TO SURVIVE A DRAGON'S BREATH. IF YOU KNOW HIM, WHICH?": "this makes no sense and sounds horrible... just ask the reader what they'd pick"):
- The title is a plain, natural question or instruction TO THE READER, the way a person would actually say it out loud. Read it aloud: if it sounds odd, rewrite it.
- Good: "A DRAGON IS BREATHING FIRE AT YOU. WHICH ARMOR DO YOU USE TO DEFEND YOURSELF?", "PICK YOUR ARMOR TO SURVIVE A DRAGON'S FIRE BREATH", "PICK THE ARMOR YOU'RE SURVIVING A DRAGON'S FIRE BREATH IN".
- Never a fragment ("ONE ARMOR TO SURVIVE..."), never two ideas stitched together, never "IF YOU KNOW HIM/HER" or "SEND THIS TO..." unless this post is explicitly an if-you-know post. Ask what THEY would pick.
- Every option answers the title. If the title asks for armor, all five options are armor, and each scene shows that armor as the hero (worn by a warrior or on display); a dragon or other threat may appear only small in the background.

EPIC, NEVER ORDINARY (2026-10-02, per Keenan: "focus more on beasts and weapons and mythical creatures and sick armor... the cooler concept, the better. size also matters"):
- Every creature is a MYTHICAL beast: dragons, wyverns, krakens, griffins, chimeras, hydras, basilisks, titans, phoenixes, and colossal legendary versions of animals. Never a real-world animal (no jaguars, dogs, wolves, lions, horses, tortoises, ordinary birds), even with a fancy name, unless it is unmistakably mythical: huge, armored, elemental or many-headed.
- Creatures are big and imposing in their pictures, but DON'T put "colossal" in the title (2026-10-13: it had crept into nearly every title).
- EVERY DRAGON HAS WINGS (2026-10-04, per Keenan): dragons, wyrms, drakes and wyverns always have big, clearly visible wings, and their scenes say so. No wingless serpent dragons or lizard-like dragons.
- NO HUMAN FACES ON CREATURES (2026-10-04, per Keenan, after "The Bronze Lamassu" with a bearded man's face): no lamassu, sphinxes, manticores, centaurs, harpies, nagas or sirens, and no man-like faces on any beast. A creature's face is fully animal, reptilian or monstrous.
- Every hero is legendary and larger-than-life: warriors in sick mythic armor (dragon knights, titan-slayers, rune-armored valkyries), mages in striking robes with staffs and runes, warrior and dragon queens. Never an ordinary person or job (no fishers, cartographers, archivists, innkeepers), EXCEPT in a retirement / new-life post, where the five options are vivid, legendary fantasy LIVES.
- Weapons and armor are legendary and striking: forged from dragon bone, storm-forged, glowing runes, ornate and intimidating.
- ABILITIES AND EFFECTS (2026-10-13, per Keenan: "glowing/ember effects, dragons can breathe fire, weapons can have effects, so can armor"): dragons breathe full fire or ice to match their type; weapons and armor may glow (runes, molten seams, frost-rimed edges, embers or faint lightning running along a blade); creatures may have glowing eyes, embers in their scales, frost mist or smoke around them; mages' staffs and tomes may glow softly. Effects stay grounded and blend into the scene's light and materials: no cartoon auras, no giant energy blasts or beams, no sparkly fairy dust.
- RELATABLE TO FANTASY FANS (2026-10-07, per Keenan: "most love dragons, cool beasts, etc. anything they can identify with"): lean on what fans already love and picture themselves with: dragons and cool beasts (dire wolves, griffins, phoenixes, krakens), cool weapons (a great sword, a war axe, a dragon-bone bow) and cool characters (a dragon knight, a valkyrie, a ranger, a dark warlord, a battle mage, a warrior queen). Make each option instantly recognizable from its name and picture; a cool twist on a familiar thing beats an obscure invented one. Names stay plain and readable ("The Frost Dragon", "The Knight's Greatsword"), not stacks of made-up words.
- BEASTS NEVER USE WEAPONS (2026-10-05, per Keenan: "it's a god damn beast, it can't use a sword"): a creature never holds, swings or wields a sword, axe, spear or any weapon. Only a humanoid hero or warrior may hold a weapon.
- WEAPONS NEVER CHANGE (2026-10-16, per Keenan: a hero "slammed the axe down and the axe head changed sides"): the video model warps a weapon whenever it moves fast, so a weapon only ever moves slowly. A hero may raise it slowly, turn it so the edge catches the light, rest it on a shoulder or plant it in the ground, or hold it still while runes glow and embers drift along it. NEVER a swing, slam, strike, chop, throw, spin or twirl, and never a weapon passing between hands.
- No places, towns, inns or taverns as options, unless this post's subject is a new life or retirement (then each option is a legendary fantasy life, shown as its gorgeous place).
- STANDALONE WEAPONS: when this post's subject says the weapons are standalone, every option scene shows ONLY the weapon, alone and unheld (on an altar, pedestal or anvil, driven into stone, or hung upright), standing vertical or on a steep diagonal and whole in the frame, lit dramatically in its own setting, with no person, hand, wielder or creature anywhere. The cover may show several weapons waiting on altars in one dark hall, like an armory or cathedral. A title in the spirit of "ONLY ONE WEAPON WILL OBEY YOU. WHICH ONE WOULD YOU TRUST?" fits; write new words.

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
- "motion": one big, dynamic thing the two do together, at real speed (full range of motion since 2026-10-12) (they turn back to back and raise their weapons; the rider leans forward as the dragon glides through cloud).
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
  "the last quest paid out. you retire today: choose your new life (five vivid fantasy lives: a lighthouse keeper on a dragon coast, a mountain hold above the clouds, a tavern at the crossroads of kingdoms, a ranger's lodge in the old forest, a ship captain on the sunlit sea)",
  "the royal tournament begins: which event do you enter",
  "you cleared the dungeon: choose your legendary weapon",
  "you slew the dragon: choose your armor forged from its scales",
  "they attack at dawn: who guards your back",
  "the gods offer you one set of armor: which one",
  "the dragon is dead and the treasury is yours: take one relic",
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
- "motion": one big clash beat at real speed, full range of motion (they lunge and collide as the waves explode around them; the dragon dives and the wolf rears up to meet it). Both keep their shapes.
- "endCard": 2-6 words asking for their winners ("COMMENT YOUR WINNERS. 1 TO 5.", "WHO WINS EACH FIGHT?", "PICK YOUR WINNERS."); vary it.
- "captionQuestion": asks who wins each fight, answered by number.
Everything else in the format above still applies.`;

/**
 * TOP 5 COUNTDOWN (2026-10-06, per Keenan: "do the rotating top 5
 * countdown... new lane", picked from "the 5 deadliest legendary weapons,
 * ranked... go from 5 to 1"). Its own lane (mythic-countdown); the subject
 * rotates every day so it never runs dry.
 */
export const COUNTDOWN_SUBJECTS = [
  "the deadliest legendary weapons (swords, axes, spears, hammers, bows forged from beasts, storms and stars)",
  "the strongest legendary armor (forged from dragon scale, titan bone, storm iron, kraken shell)",
  "the most feared dragons (every one winged, colossal and a different kind)",
  "the hardest mythical beasts to tame",
  "the rarest mythical creatures ever seen",
  "the most powerful sea monsters of the deep",
  "the greatest legendary war-mounts (armored beasts built to carry a warrior into battle)",
  "the most terrifying beasts of the night",
  "the oldest dragons alive",
  "the largest mythical beasts that ever lived",
  "the most legendary shields ever forged",
  "the most feared legendary helms and war-masks",
  "the strongest mythical beasts of the sky",
  "the deadliest monsters of the frozen north",
  "the most powerful guardian beasts (each guarding something: a gate, a treasure, a tomb)",
];

const COUNTDOWN_RULES = `THIS POST IS A "TOP 5" COUNTDOWN: five entries ranked from #5 up to #1, the best saved for last.
- "title": "TOP 5 ..." naming exactly what is ranked, 4-9 words, ALL-CAPS ready, no question mark ("TOP 5 DEADLIEST LEGENDARY WEAPONS", "TOP 5 MOST FEARED DRAGONS"; new words every post, never a recent title).
- "options": exactly five, IN COUNTDOWN ORDER: options[0] is #5, options[4] is #1. Each one beats the one before it, and #1 is the most impressive of all, worth waiting for.
  - "name": 2-4 words in Title Case, legendary-sounding, the thing being ranked ("Fenrir's Fang", "The Abyssal Wyrm"). No numbers; the renderer adds them.
  - "lore": one line, 6-12 words, on why it earns its rank.
  - "scene": the ranked thing as the clear hero of the frame (a weapon or armor worn or wielded by one heroic figure, or shown on display; a beast whole and colossal), each in a completely different setting, palette and silhouette.
- "coverScene": the same one cover style as every Mythicals post (2026-10-11, per Keenan): a lone figure seen from behind facing FIVE options in a row, each glowing a different vivid color (five sealed vault doors, five cages, five banners, five stone gates leaking colored light), dark and misty, none of the five fully revealed.
- "endCard": 2-6 words inviting debate about the ranking ("AGREE WITH #1?", "WHAT'S YOUR #1?", "WRONG ORDER? COMMENT."); vary it.
- "captionQuestion": asks what they'd put at #1, or what's missing from the list.
Everything else in the format above still applies.`;

export type ChoiceTopicOpts = {
  /** Staged pipeline (2026-10-14): the cover already picked by Jev. */
  fixedCover?: { title: string; coverScene: string; coverMotion: string };
  /** Exact option names to use, in order (hand-requested remakes). */
  forcedOptions?: string[];
  /** Candidate drafting (2026-10-13): writer model + weekly brief block. */
  model?: string;
  brief?: string;
  /** "duo" = who-are-you-and-your-bro; "place" = where you two are going;
   *  "know" = if you know him/her; "scenario" = story setup + choice. */
  mode?: "choice" | "duo" | "place" | "know" | "scenario" | "size" | "versus" | "countdown";
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
  /**
   * Options on the post (default 5). 2026-10-07, per Keenan: "a new 'which
   * mythical weapon chooses you?' post with 3 weapons". Requested by hand only.
   */
  optionCount?: number;
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
  // Candidate pipeline (2026-10-13, per Keenan): Opus drafts several posts,
  // the rules + Opus sense editor cut, Jev ranks. Hand-titled posts and the
  // fixed-shape series (size, countdown) keep the single-draft path.
  if (usesStagedPipeline(opts)) {
    const cover = await pickChoiceCover(opts);
    return repairChoiceTopic(await writeChoiceScripts(opts, cover), opts);
  }
  // Hand-requested exact options (2026-10-14 remake): one draft, names kept.
  const topic = opts.forcedOptions?.length ? await generateChoiceTopicOnce(opts) : await generateChoiceTopicChecked(opts);
  if (opts.fixedTitle) {
    let title = opts.fixedTitle.trim().toUpperCase();
    // Only questions get a "?" (2026-10-06: "PICK YOUR ARMOR TO SURVIVE A
    // DRAGON'S FIRE BREATH" is an instruction and got one tacked on).
    const isQuestion = /^(WHICH|WHAT|WHO|WHERE|WHEN|WHY|HOW|WOULD|DO|DOES|ARE|IS|CAN|WILL|SHOULD|COULD)\b/.test(title) || /\b(WHICH|WHAT|WHO)\b[^.]*$/.test(title);
    if (!/[?.!]$/.test(title) && isQuestion) title += "?";
    const prefix = topic.slug.match(/^mythic(-duo|-place|-know|-scenario|-size|-versus|-countdown)?/)?.[0] ?? "mythic";
    const slug = `${prefix}-${title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)}`;
    return { ...topic, title, slug };
  }
  // The size series and countdowns keep their fixed-shape titles (no best-of-5 cover).
  return opts.mode === "size" || opts.mode === "countdown" ? topic : withBestTitle(topic, opts.mode ?? "choice");
}

/**
 * STAGED PIPELINE (2026-10-14, per Keenan: "5 separate covers are written,
 * jev picks what's best, then 3 scripts are written which jev picks from to
 * post ... there should never be an elimination based on a monster").
 * Replaces the 10-13 whole-post drafts, where five independent drafts landed
 * on three near-identical titles and three were thrown out over one obscure
 * creature, leaving "WHICH BEAST FOLLOWS YOU OFF THE MAP?" as the only one.
 *   1. pickChoiceCover: one Opus call writes FIVE different covers; the
 *      cover-only sense editor cuts unclear ones; Jev picks the best.
 *   2. writeChoiceScripts: three Opus scripts (options, end card, caption)
 *      for that cover; Jev picks. Nothing is eliminated.
 *   3. repairChoiceTopic: the winner's hard problems (human faces, pictures
 *      that don't show the asked-for thing, ordinary options, garbled lines)
 *      are FIXED in place by Opus. A creature is never a reason to drop a post.
 * Each stage runs in its own Inngest step (carousel-daily), so it fits the
 * 300s limit. Hand-titled posts and fixed-shape series keep the old path.
 */
/** The per-mode rules block appended to SYSTEM (same as the writer uses). */
function modeRules(mode: ChoiceTopicOpts["mode"]): string {
  return mode === "duo"
    ? `\n\n${DUO_RULES}`
    : mode === "place"
      ? `\n\n${PLACE_RULES}`
      : mode === "know"
        ? `\n\n${KNOW_RULES}`
        : mode === "scenario"
          ? `\n\n${SCENARIO_RULES}`
          : mode === "size"
            ? `\n\n${SIZE_RULES}`
            : mode === "versus"
              ? `\n\n${VERSUS_RULES}`
              : mode === "countdown"
                ? `\n\n${COUNTDOWN_RULES}`
                : "";
}

export function usesStagedPipeline(opts: ChoiceTopicOpts): boolean {
  return !opts.fixedTitle && !opts.forcedOptions?.length && opts.mode !== "size" && opts.mode !== "countdown";
}

type ChoiceCover = { title: string; coverScene: string; coverMotion: string; jev?: Record<string, number> | null };

export async function pickChoiceCover(opts: ChoiceTopicOpts): Promise<ChoiceCover> {
  const { CANDIDATE_WRITER_MODEL, rankCandidates } = await import("./candidate-pipeline");
  const { readBriefBlock } = await import("./weekly-brief");
  const { isRecentHeadline, nearDuplicateOf } = await import("./headline-history");
  const brief = await readBriefBlock("mythicals");
  const styles = [...MYTHIC_COVER_STYLES, ...MYTHIC_COVER_STYLES].sort(() => Math.random() - 0.5).slice(0, 5);
  const write = async (extra: string): Promise<ChoiceCover[]> => {
    const res = await contentAnthropic.messages.create({
      model: CANDIDATE_WRITER_MODEL,
      max_tokens: 2500,
      system: `${SYSTEM}${modeRules(opts.mode)}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: [
            `This post's subject: ${opts.category}.`,
            opts.theme ? `Lane notes: ${opts.theme}` : "",
            opts.recentTitles.length ? `Recent titles (don't repeat or lightly reword these):\n${opts.recentTitles.map((t) => `- ${t}`).join("\n")}` : "",
            brief,
            opts.feedback ?? "",
            `TASK: write FIVE different COVERS for this post (no options yet). Each is a plain, natural question or instruction a fan instantly understands as "pick one of these five" (no stitched-on teaser sentences like "THE MAP ENDS HERE.", no verb that could read two ways). The five take genuinely different angles and wordings; never the same title twice.`,
            `Cover ${"1-5"} styles, in order: ${styles.map((st, i) => `(${i + 1}) ${st}`).join(" ")}`,
            extra,
            `Return only JSON: {"covers": [{"title": "...", "coverScene": "...", "coverMotion": "..."}]} with exactly five covers.`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });
    const j = JSON.parse(lastJsonText(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""))) as { covers?: Partial<ChoiceCover>[] };
    return (j.covers ?? [])
      .filter((c) => typeof c.title === "string" && c.title.trim() && typeof c.coverScene === "string")
      .map((c) => ({ title: c.title!.trim().toUpperCase(), coverScene: c.coverScene!.trim(), coverMotion: (c.coverMotion ?? "").trim() }));
  };
  const rank = (covers: ChoiceCover[]) =>
    rankCandidates({
      brand: "mythicals",
      label: `mythic-cover-${opts.mode ?? "choice"}`,
      candidates: covers,
      render: (c) => `COVER: ${c.title}\n(picture: ${c.coverScene.slice(0, 200)})`,
      reject: async (c) => {
        if (await isRecentHeadline(c.title)) return "repeats a recent title";
        const near = await nearDuplicateOf(c.title);
        return near ? `too close to recent title "${near}"` : null;
      },
      senseCheck: (c) => coverSenseProblem(c.title),
    });
  let covers = await write("");
  let ranked = covers.length ? await rank(covers) : null;
  if (!ranked) {
    const why = covers.map((c) => c.title).join(" | ");
    covers = await write(`REJECTED (none read clearly to a fan in one glance): ${why}. Write five NEW covers that do.`);
    ranked = covers.length ? await rank(covers) : null;
  }
  if (!ranked) throw new Error(`[choice-lane] no cover passed the sense check (${opts.category})`);
  console.log(`[choice-lane] cover picked: "${ranked.winner.title}" (${ranked.rankedBy}, ${ranked.survivors}/${covers.length})\n${ranked.table}`);
  return { ...ranked.winner, jev: ranked.jev };
}

export async function writeChoiceScripts(opts: ChoiceTopicOpts, cover: ChoiceCover): Promise<ChoiceTopic> {
  const { CANDIDATE_WRITER_MODEL, rankCandidates } = await import("./candidate-pipeline");
  const { readBriefBlock } = await import("./weekly-brief");
  const brief = await readBriefBlock("mythicals");
  const fixedCover = { title: cover.title, coverScene: cover.coverScene, coverMotion: cover.coverMotion };
  const within = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`script timed out after ${ms}ms`)), ms))]);
  const settled = await Promise.allSettled(
    Array.from({ length: 3 }, () =>
      within(generateChoiceTopicOnce({ ...opts, fixedCover, model: CANDIDATE_WRITER_MODEL, brief }), 200_000)
    )
  );
  const scripts = settled.filter((r): r is PromiseFulfilledResult<ChoiceTopic> => r.status === "fulfilled").map((r) => r.value);
  if (scripts.length === 0) {
    const why = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(`[choice-lane] every script failed: ${why?.reason instanceof Error ? why.reason.message : why?.reason}`);
  }
  const ranked = await rankCandidates({
    brand: "mythicals",
    label: `mythic-script-${opts.mode ?? "choice"}`,
    candidates: scripts,
    render: (t) => `COVER: ${t.title}\n${t.options.map((o, i) => `${i + 1}. ${o.name}: ${o.lore}`).join("\n")}`,
    // Never eliminate a script over a creature (Keenan, 2026-10-14).
    senseCheck: async () => null,
  });
  const winner = ranked?.winner ?? scripts[0];
  console.log(`[choice-lane] script picked for "${cover.title}": ${winner.options.map((o) => o.name).join(" / ")} (${ranked?.rankedBy ?? "first"})${ranked ? `\n${ranked.table}` : ""}`);
  return { ...winner, ...(ranked?.jev ? { jev: ranked.jev } : {}) };
}

/** Problems worth FIXING in place (never a reason to drop the post). */
const REPAIR_PROBLEM = /human faces|pictures don't show|realistic or ordinary|copy check flagged/;

export async function repairChoiceTopic(topic: ChoiceTopic, opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  try {
    const { CANDIDATE_WRITER_MODEL: VISION_MODEL_FOR_REPAIR } = await import("./candidate-pipeline");
    const problems = (await choiceTopicProblems(topic).catch(() => [] as string[])).filter((p) => REPAIR_PROBLEM.test(p));
    const sense = await mythicSenseProblem(topic);
    const all = [...problems, ...(sense && !/sense check unavailable/.test(sense) ? [sense] : [])];
    if (!all.length) return topic;
    console.warn(`[choice-lane] repairing "${topic.title}": ${all.join("; ")}`);
    const res = await contentAnthropic.messages.create({
      model: VISION_MODEL_FOR_REPAIR,
      max_tokens: 3000,
      system: `${SYSTEM}${modeRules(opts.mode)}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content: `This post is finished except for these problems:\n- ${all.join("\n- ")}\n\nFix ONLY what these problems name: rewrite (or, if it must, replace) just the affected option's name, lore, scene and motion, or the garbled line. Keep the title, cover, every other option, the end card and the caption exactly as they are. Return the full post as JSON in the same shape.\n\n${JSON.stringify({ title: topic.title, coverScene: topic.coverScene, coverMotion: topic.coverMotion, options: topic.options, endCard: topic.endCard, captionQuestion: topic.captionQuestion })}`,
        },
      ],
    });
    const j = JSON.parse(lastJsonText(res.content.map((b) => (b.type === "text" ? b.text : "")).join(""))) as Partial<ChoiceTopic>;
    const fixed = (j.options ?? []).filter((o) => o?.name && o?.lore && o?.scene);
    if (fixed.length !== topic.options.length) return topic;
    return {
      ...topic,
      options: fixed.map((o) => ({ name: o.name!.trim(), lore: o.lore!.trim(), scene: o.scene!.trim(), motion: (o.motion ?? "").trim() })),
      endCard: (j.endCard ?? topic.endCard).trim() || topic.endCard,
      captionQuestion: (j.captionQuestion ?? topic.captionQuestion).trim() || topic.captionQuestion,
    };
  } catch (err) {
    console.warn("[choice-lane] repair failed — shipping the picked script:", err instanceof Error ? err.message : err);
    return topic;
  }
}

/** Opus check on a cover question alone (fails closed). */
async function coverSenseProblem(title: string): Promise<string | null> {
  const { VISION_MODEL, messageText } = await import("./claude-client");
  try {
    const res = await Promise.race([
      contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 300,
        effort: "medium",
        system: `You are a blunt editor for a fantasy account. A fan scrolling fast sees only this cover question. FAIL it if they wouldn't instantly understand they're being asked to PICK one of several options, if it has a stitched-on teaser sentence, if a word could be read two ways (e.g. "follows you" as hunts you), or if it isn't how a person would naturally say it out loud. Return only JSON: {"ok": true} or {"ok": false, "problem": "one sentence"}`,
        messages: [{ role: "user", content: `COVER: ${title}` }],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("cover check timed out after 45s")), 45_000)),
    ]);
    const parsed = JSON.parse(lastJsonText(messageText(res))) as { ok?: boolean; problem?: string };
    console.log(`[cover-sense] "${title}": ${parsed.ok ? "ok" : `FAIL ${parsed.problem}`}`);
    return parsed.ok === false ? (parsed.problem ?? "unclear cover") : null;
  } catch (err) {
    return `cover check unavailable (${(err instanceof Error ? err.message : String(err)).slice(0, 60)})`;
  }
}

/**
 * Opus plain-sense editor for Mythicals (2026-10-13): reads the cover and
 * the options the way a fan scrolling would. Fails closed like Ripple's.
 */
async function mythicSenseProblem(t: ChoiceTopic): Promise<string | null> {
  const { VISION_MODEL, lastJsonText, messageText } = await import("./claude-client");
  try {
    const res = await Promise.race([
      contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 400,
        effort: "medium",
        system: `You are a blunt, strict editor for a fantasy Instagram/YouTube account. The reader is a fantasy fan scrolling fast. Decide whether this "which would you choose" post makes plain sense on ONE read. When in doubt, fail it.

FAIL if ANY of these is true:
- The cover question isn't a plain, natural question or instruction a fan instantly understands (fragments, stitched-on phrases, riddles fail).
- An option's name doesn't instantly tell a fan what it is, or it isn't the kind of thing the question asks for.
- The options don't belong together as answers to that one question.
- Any line is garbled or reads like a robot.

Return only JSON: {"ok": true} or {"ok": false, "problem": "which line fails and why, one sentence"}`,
        messages: [{ role: "user", content: `COVER: ${t.title}\nOPTIONS:\n${t.options.map((o, i) => `${i + 1}. ${o.name}: ${o.lore}`).join("\n")}` }],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sense check timed out after 60s")), 60_000)),
    ]);
    const parsed = JSON.parse(lastJsonText(messageText(res))) as { ok?: boolean; problem?: string };
    console.log(`[mythic-sense] "${t.title}": ${parsed.ok ? "ok" : `FAIL ${parsed.problem}`}`);
    return parsed.ok === false ? (parsed.problem ?? "a line doesn't make plain sense") : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[mythic-sense] check errored — cutting this candidate: ${msg}`);
    return `sense check unavailable (${msg.slice(0, 80)})`;
  }
}

/**
 * Cover looks, rotated per draft (2026-10-13, per Keenan: covers "way too
 * similar every single time. mix in some of the older style covers from
 * those prior original posts"). LINEUP is the 10-11 single style; MOMENT and
 * HALL are the original 9-29..10-05 covers (a figure at the armory gate, on
 * a cliff above the army, at a crossroads with treasure; an empty throne
 * room, a dragon-skull helm hall).
 */
export const MYTHIC_COVER_STYLES = [
  "THE LINEUP: a lone hooded or armored figure seen from BEHIND, small to mid-size in the lower foreground, facing FIVE options lined up in a row, each glowing a different vivid color (five weapons upright, five armor stands, five sealed gates leaking colored light, five pillars of light) in a dark, misty, epic setting. Two figures side by side when the question is about a pair.",
  "THE MOMENT: a cinematic scene of the exact moment the question puts the reader in, with a lone figure (two for a pair) seen from behind, small to mid-size in the frame, standing in a place that IS the question: at the open gate of an armory with war-mounts and an army beyond, on a cliff edge above a burning valley and an army camp, walking down a torch-lit hall lined with armor, at a misty crossroads beside an open treasure chest, entering a vast throne room. The five options themselves are not shown. Golden-hour, storm or torch light, epic scale.",
  "THE HALL: the place where the choice waits, with NO person in it: a grand vaulted armory, a throne room with empty thrones in shadow, a dragon-skull war helm on a pedestal at the end of a hall of statues, a dark stable of shadowed war-mounts, a candlelit library of sealed tomes, a tournament arena at dawn with banners. Cinematic light, deep perspective, epic scale, the choice implied but not revealed.",
] as const;

function pickCoverStyle(): string {
  return MYTHIC_COVER_STYLES[Math.floor(Math.random() * MYTHIC_COVER_STYLES.length)];
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
    const prefix = topic.slug.match(/^mythic(-duo|-place|-know|-scenario|-size|-versus|-countdown)?/)?.[0] ?? "mythic";
    const slug = `${prefix}-${h.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 50)}`;
    console.log(`[choice-lane] best-of-5 cover "${topic.title}" -> "${h}"`);
    return { ...topic, title: h, slug };
  } catch (err) {
    console.warn("[choice-lane] best-of-5 cover failed — keeping the writer's title:", err instanceof Error ? err.message : err);
    return topic;
  }
}

/**
 * Problems that make a post wrong rather than weak (2026-10-08, per Keenan:
 * "it talks about 'five powers' and then lists off characters. this post
 * shouldn't have gotten through jev's filter"). These never ship: up to three
 * rewrites, then the run fails (no post that hour) instead of publishing a
 * mismatch. Twins and throwaways stay soft (best draft ships).
 */
const HARD_PROBLEM_ALL = /don't say they are what the title promises|pictures don't show|human faces|title doesn't read naturally|realistic or ordinary|copy check flagged/;
/**
 * "HOW BIG WOULD THEY REALLY BE? PART N" (size mode) has a fixed series title
 * and real-world scale shots, and asks no "pick a kind" question, so the
 * title, picture-hero, name and "ordinary" checks don't fit it: after the
 * hard gate landed (f623ffa3) every size run failed all four drafts and the
 * day lost its posts (2026-10-09: only 3 Mythicals posts; runs 08/09 UTC
 * died). Size posts only hard-fail on human faces or a flagged line.
 */
const SIZE_HARD_PROBLEM = /human faces|copy check flagged/;

async function generateChoiceTopicChecked(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  const HARD_PROBLEM = opts.mode === "size" ? SIZE_HARD_PROBLEM : HARD_PROBLEM_ALL;
  let best: { topic: ChoiceTopic; problems: string[] } | null = null;
  let feedback = opts.feedback ?? "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const topic = await generateChoiceTopicOnce({ ...opts, feedback: feedback || null });
    const problems = await choiceTopicProblems(topic);
    const hard = problems.filter((p) => HARD_PROBLEM.test(p));
    if (!best || hard.length < best.problems.filter((p) => HARD_PROBLEM.test(p)).length || (hard.length === 0 && problems.length < best.problems.length)) best = { topic, problems };
    if (problems.length === 0) return topic;
    if (hard.length === 0 && attempt >= 1) {
      console.warn(`[choice-lane] "${topic.title}" ships with soft issues only: ${problems.join("; ")}`);
      return best.topic;
    }
    console.warn(`[choice-lane] "${topic.title}" rejected (attempt ${attempt + 1}): ${problems.join("; ")} — rewriting`);
    feedback = `${opts.feedback ?? ""}\n\nREJECTED DRAFT "${topic.title}" (${topic.options
      .map((o) => o.name)
      .join(", ")}): ${problems.join("; ")}. Write a new post that fixes this: ${optionCount(opts)} options that are each tempting, clearly different from each other, and exactly the kind of thing the title promises.`;
  }
  const hardLeft = best!.problems.filter((p) => HARD_PROBLEM.test(p));
  if (hardLeft.length) throw new Error(`choice topic failed the Jev gate after 4 drafts: ${hardLeft.join("; ")}`);
  return best!.topic;
}

const TWIN_THRESHOLD = 0.8;
const THROWAWAY_THRESHOLD = 0.25;
/** Below this "epic and mythical" probability an option earns a rewrite (2026-10-02). */
const EPIC_MIN = 0.5;

/**
 * Engagement + relatability (2026-10-07, per Keenan: "we want Jev to also
 * grade for engagement and relatability... fantasy lovers... most love
 * dragons, cool beasts, etc. anything they can identify with").
 */
const RELATE_MIN = 0.35;
const ENGAGE_MIN = 0.4;

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
      // Widened 2026-10-13 (per Keenan: back to the original variety): mages,
      // queens and, in retirement posts, legendary fantasy lives count.
      instructions: `Is \`options[${i}]\` an epic, mythical concept: a mythical beast, a legendary weapon, legendary armor, a larger-than-life legendary hero (warrior, mage or queen), or, when \`question\` is about retiring or a new life, a vivid legendary fantasy life?`,
      criteria: {
        true: "Yes: mythical and epic, the kind of thing a fantasy fan finds sick",
        false: "No: a real-world animal, an ordinary person or job, or plain everyday life",
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
    questions[`relate_${i}`] = {
      type: "score",
      instructions: `How instantly would a typical fantasy fan recognize \`options[${i}]\` and connect with it, without needing any lore explained? Fans love dragons and cool beasts (dire wolves, griffins, phoenixes, krakens), cool weapons (a great sword, a war axe, a dragon-bone bow) and cool characters (a dragon knight, a valkyrie, a ranger, a dark warlord, a battle mage, a warrior queen): things they already know and picture themselves with.`,
      criteria: [
        "Not at all: an obscure or invented thing they'd need explained",
        "A little: recognizable, but nothing they feel drawn to",
        "Clearly: a fan instantly gets it and likes it",
        "Hugely: a fan favorite they'd picture themselves with right away",
      ],
    };
  });
  questions.engage = {
    type: "score",
    instructions:
      "Scrolling past this post, how likely is a fantasy fan to stop, read every option and comment their pick? Judge the question and the five options together: is it a choice fans genuinely care about and would argue over?",
    criteria: [
      "Unlikely: they'd scroll on",
      "Some: a few would comment",
      "Likely: plenty of fans would comment a pick",
      "Very likely: the comments turn into a debate",
    ],
  };
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
  const obscure: string[] = [];
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
    const rel = scoreOf(r, `relate_${i}`);
    if (rel !== null && rel < RELATE_MIN) obscure.push(o.name);
  });
  const engage = scoreOf(r, "engage");
  console.log(
    `[choice-lane] Jev check "${topic.title}": ` +
      topic.options
        .map((o, i) => `${o.name} kind=${noulOf(r, `kind_${i}`)?.toFixed(2)} twin=${noulOf(r, `twin_${i}`)?.toFixed(2)} tempt=${scoreOf(r, `tempt_${i}`)?.toFixed(2)} epic=${noulOf(r, `epic_${i}`)?.toFixed(2)} relate=${scoreOf(r, `relate_${i}`)?.toFixed(2)}`)
        .join(" | ") + ` | engage=${engage?.toFixed(2)}`
  );
  // One twin flag alone can be the model noticing its partner; two or more is a real pair.
  if (twins.length >= 2) problems.push(`these options are too alike: ${twins.join(", ")}`);
  if (weak.length) problems.push(`these options are throwaways nobody would pick: ${weak.join(", ")}`);
  if (obscure.length)
    problems.push(
      `fantasy fans wouldn't instantly recognize or connect with these: ${obscure.join(", ")}. Swap them for things fans already love and picture themselves with (a dragon, a dire wolf, a griffin, a great sword, a dragon knight), named plainly`
    );
  if (engage !== null && engage < ENGAGE_MIN)
    problems.push(
      "as a whole this post wouldn't get fantasy fans to comment a pick. Make the choice one they genuinely care about and would argue over, with options they love"
    );
  if (humanFaced.length)
    problems.push(
      `these creatures have human faces, which Keenan never wants: ${humanFaced.join(", ")}. Replace them with creatures whose faces are fully animal, reptilian or monstrous`
    );
  if (offScene.length)
    problems.push(
      `these options' pictures don't show what the title asks the reader to pick as the hero: ${offScene.join(", ")}. Rewrite their scenes so that thing fills the frame (worn, wielded or on display); any creature or threat stays small in the background`
    );
  const clear = noulOf(r, "title_clear");
  if (clear !== null && clear < TITLE_CLEAR_MIN && !/^(IF YOU KNOW|TOP \d|HOW BIG)/i.test(topic.title))
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

function optionCount(opts: ChoiceTopicOpts): number {
  return opts.optionCount && opts.optionCount >= 2 && opts.optionCount <= 5 ? Math.round(opts.optionCount) : 5;
}

async function generateChoiceTopicOnce(opts: ChoiceTopicOpts): Promise<ChoiceTopic> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const coverStyle =
    opts.fixedCover || opts.mode === "size" || opts.mode === "countdown" ? "" : `COVER STYLE FOR THIS POST: ${pickCoverStyle()}`;
  const user = [
    `This post's subject: ${opts.category}.`,
    coverStyle,
    opts.fixedCover
      ? `THE COVER IS ALREADY CHOSEN. Put these in your JSON exactly as given and write the options, endCard and captionQuestion for it:\n- title: ${opts.fixedCover.title}\n- coverScene: ${opts.fixedCover.coverScene}\n- coverMotion: ${opts.fixedCover.coverMotion}`
      : "",
    opts.forcedOptions?.length
      ? `USE EXACTLY THESE OPTIONS, in this order, with these exact names (write their lore, scene and motion): ${opts.forcedOptions.map((n, i) => `${i + 1}. ${n}`).join("; ")}`
      : "",
    opts.mode === "size" ? `Series title for this post (use it exactly): "${sizeSeriesTitle(opts.part ?? 1)}".` : "",
    opts.theme ? `Lane notes: ${opts.theme}` : "",
    opts.recentTitles.length
      ? `Recent titles (don't repeat or lightly reword these):\n${opts.recentTitles.map((t) => `- ${t}`).join("\n")}`
      : "",
    opts.recentNames.length
      ? `Options used recently (pick different creatures and fighters):\n${opts.recentNames.slice(0, 60).join(", ")}`
      : "",
    opts.brief ?? "",
    opts.feedback ?? "",
    optionCount(opts) !== 5
      ? `OPTION COUNT FOR THIS POST: exactly ${optionCount(opts)} options, not five. Everywhere the rules say five, use ${optionCount(opts)}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await contentAnthropic.messages.create({
    ...(opts.model ? { model: opts.model } : {}),
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
                  : opts.mode === "countdown"
                    ? `\n\n${COUNTDOWN_RULES}`
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
    .slice(0, optionCount(opts));
  // Locked parts (2026-10-14): the Jev-picked cover and any forced names.
  if (opts.forcedOptions?.length) opts.forcedOptions.forEach((n, i) => { if (options[i]) options[i].name = n; });
  if (opts.fixedCover) {
    parsed.title = opts.fixedCover.title;
    parsed.coverScene = opts.fixedCover.coverScene;
    parsed.coverMotion = opts.fixedCover.coverMotion;
  }
  const title = (parsed.title ?? "").trim();
  if (!title || options.length < optionCount(opts) || !parsed.coverScene) {
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
    if (!opts.fixedCover && typeof gated.title === "string" && gated.title.trim()) gatedTitle = gated.title.trim();
    if (Array.isArray(gated.options) && gated.options.length === options.length) {
      gatedOptions = options.map((o, i) => ({
        ...o,
        name: !opts.forcedOptions?.length && typeof gated.options[i]?.name === "string" && gated.options[i].name.trim() ? gated.options[i].name.trim() : o.name,
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
export const NO_HUMAN_FACE_LINE =
  "No creature has a human face or human head: its face is fully animal, reptilian or monstrous (never a lamassu, sphinx, manticore or bearded man-like face on a beast). Every dragon, wyrm, drake or wyvern has large, clearly visible wings (2026-10-04, per Keenan).";

/**
 * The quality bar (2026-10-05, per Keenan, sending a reference frame: "we
 * should be aiming for this level of detail and quality in all of our
 * posts"): a colossal obsidian dragon's head filling the frame, glowing
 * magma in every crack, orange eyes, smoke and embers, a tiny cloaked
 * figure from behind for scale.
 */
export const QUALITY_BAR_LINE =
  "QUALITY BAR: extreme, tactile detail on the subject. Every scale, plate, horn and rune is sharply defined, with cracks, chips and wear; glowing seams, embers or frost add light from within. A restrained palette: deep near-black and charcoal tones with ONE vivid accent color that glows (molten orange, icy blue, emerald or violet). Dramatic low-key lighting with volumetric smoke or fog, rim light on the edges, drifting embers or particles, and glowing eyes that hold the viewer. Bold, simple composition: the subject is big, close and frontal, staring into the lens.";
// Cover styles rotate (2026-10-13, MYTHIC_COVER_STYLES); the image prompt
// follows the scene as written instead of forcing the 10-11 lineup.
const COVER_SCALE_LINE =
  "COVER: follow the cover scene exactly as written (it may be a lineup of glowing choices, a cinematic moment with a figure seen from behind, or an empty grand hall). The five options are never fully revealed on the cover. Maximum curiosity about which one is theirs.";

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
    // 2026-10-07 (Keenan, "YOU CAN TAKE ONE POWER FROM THE OLD GODS": "The
    // Stormcaller's Horn" and "The Shadowwalker's Cloak" came back as
    // dragons): draw the scene's own subject, never a creature in its place.
    "DRAW EXACTLY THE SUBJECT THE SCENE NAMES FIRST. If it is a warrior, hero, weapon, armor or item, that warrior and item fill the frame and no dragon or creature replaces them or stands in front of them; a creature appears only if the scene names one, and only where the scene puts it (often small in the background).",
    "Epic and mythical: when the subject is a creature it is COLOSSAL and imposing, its huge scale clear against the landscape around it; a hero is a larger-than-life warrior in ornate, intimidating legendary armor with a legendary weapon.",
    NO_HUMAN_FACE_LINE,
    QUALITY_BAR_LINE,
    kind === "cover"
      ? COVER_SCALE_LINE
      : "Show ONLY what the scene describes: never add a warrior, knight, rider or any person unless the scene names one (2026-10-05: a frost dragon option came back with an armored knight in front).",
    kind === "option"
      ? "The creature, fighter or item is the unmistakable hero of the frame, shown whole and centered in the MIDDLE of the image, with open sky or atmosphere in the top fifth of the frame (its name is added there later). A weapon or armor shown on its own stays on its own: no one holds or wears it. The WHOLE subject fits inside the frame with clear space on every side, nothing cut off at an edge; a long weapon (spear, staff, lance, bow, polearm) stands upright or on a steep diagonal so it fits the tall vertical frame, never lying horizontally across it (2026-10-07: a spear hung sideways on chains lost its head off the edge of the frame)."
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
  const m = safeWeaponMotion(motion);
  return m ? `${imagePrompt}\nMOTION: ${m}` : imagePrompt;
}

/**
 * Last line of defense (2026-10-16, per Keenan: an axe head "changed sides"
 * when the hero slammed it down): a motion line that moves a weapon fast
 * becomes a slow, steady one, because fast weapon motion is where Kling
 * warps the weapon itself.
 */
export function safeWeaponMotion(motion: string): string {
  const m = motion.trim();
  const weapon = /\b(axe|blade|sword|spear|hammer|mace|glaive|halberd|scythe|dagger|bow|trident|lance|staff|weapon|flail|maul|greatsword|cleaver)s?\b/i;
  const fast = /\b(swing|swings|swung|slam|slams|slammed|strike|strikes|struck|chop|chops|smash|smashes|throw|throws|threw|hurl|hurls|spin|spins|spun|twirl|twirls|whirl|whirls|cleave|cleaves|slash|slashes|thrust|thrusts|brandish|brandishes|flip|flips|toss|tosses|crash|crashes)\b/i;
  if (weapon.test(m) && fast.test(m)) {
    return "the hero holds the weapon steady and slowly turns it so its edge catches the light, as the runes along it glow brighter and embers drift past";
  }
  return m;
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
