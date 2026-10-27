/**
 * Armor and weapon quiz results (2026-10-27, per Keenan: "add three separate
 * quizzes. what armor set is yours? what legendary weapon is yours? ... along
 * with beast"). Same shape as the beasts in archetypes.ts so the result page,
 * emails and images treat all three quizzes alike.
 */

export interface QuizResult {
  slug: string;
  name: string;
  /** Short epithet shown under the name. */
  title: string;
  /** Two short sentences: what this is, and what that says about you. */
  essence: string;
  strengths: [string, string, string];
  weakness: string;
  /** One dramatic line of lore. */
  lore: string;
  /** Scene for the result's hero image (gpt-image-2). */
  scene: string;
}

export const ARMOR_RESULTS: Record<string, QuizResult> = {
  "dragonscale-plate": {
    slug: "dragonscale-plate",
    name: "Dragonscale Plate",
    title: "Armor of the One Who Leads",
    essence: "Forged from the scales of a dragon you brought down yourself. You wear proof that you walk into the fight first.",
    strengths: ["Fearless at the front", "People follow you", "Hard to bring down"],
    weakness: "You'd rather take the hit than ask anyone to share it.",
    lore: "The dragon left one scale on the battlefield for every soldier it killed. The smith used every one.",
    scene:
      "a full suit of dark crimson dragonscale plate armor with a horned helm and a cape, worn by a faceless armored knight standing on a scorched battlefield, a slain dragon's wing behind them, embers in the air",
  },
  "obsidian-warplate": {
    slug: "obsidian-warplate",
    name: "Obsidian Warplate",
    title: "Armor of the Unmovable",
    essence: "Black, heavy and impossible to break. Once you've decided something, nothing on earth moves you.",
    strengths: ["Unbreakable will", "Calm under pressure", "Intimidating without trying"],
    weakness: "You can be as hard to reach as you are to break.",
    lore: "Arrows broke against it. Then swords. Then the enemy's courage.",
    scene:
      "a towering knight in massive black volcanic-glass plate armor with faint orange lava glowing through the seams, full closed helm, standing in a ruined fortress gate at night, smoke and sparks around them",
  },
  "celestial-aegis": {
    slug: "celestial-aegis",
    name: "Celestial Aegis",
    title: "Armor of the Protector",
    essence: "White gold that glows brighter the more people stand behind you. You exist to keep others safe.",
    strengths: ["Deeply protective", "Honorable", "A light in dark times"],
    weakness: "You guard everyone's peace except your own.",
    lore: "Wherever it stood, the darkness stopped at its feet.",
    scene:
      "a knight in radiant white-and-gold celestial plate armor with winged pauldrons and a tall round shield, faceless winged helm, standing on a mountaintop as golden light breaks through storm clouds behind them",
  },
  "frostforged-mail": {
    slug: "frostforged-mail",
    name: "Frostforged Mail",
    title: "Armor of the Steady Hand",
    essence: "Cold, quiet and unshakable. You stay calm while everyone else panics, and that's why they look to you.",
    strengths: ["Ice-cool in a crisis", "Endlessly steady", "Quietly loyal"],
    weakness: "People mistake your calm for not caring.",
    lore: "It was forged in a glacier and never once grew warm.",
    scene:
      "a warrior in pale ice-blue frostforged chainmail and plate with frost crystals growing along the edges, fur cloak and closed helm, standing in a blizzard on a frozen mountain pass, breath fog drifting",
  },
  shadowweave: {
    slug: "shadowweave",
    name: "Shadowweave Leathers",
    title: "Armor of the Unseen",
    essence: "Light, silent and made for moving where nobody's looking. You don't need credit. You need results.",
    strengths: ["Independent", "Always a step ahead", "Moves without a sound"],
    weakness: "You disappear so well that people forget to ask how you are.",
    lore: "Guards swore the castle was empty. The king's crown said otherwise.",
    scene:
      "a hooded figure in dark layered shadowweave leather armor with black metal bracers and a deep hood hiding the face, crouched on a moonlit castle rooftop, wisps of shadow trailing from the cloak",
  },
  "phoenix-mantle": {
    slug: "phoenix-mantle",
    name: "Phoenix Mantle",
    title: "Armor of the One Who Rises",
    essence: "Gold and flame that reforges itself every time it breaks. You've been knocked down, and you came back brighter.",
    strengths: ["Comes back stronger", "Warm and inspiring", "Turns setbacks into fuel"],
    weakness: "You burn hot and forget to rest.",
    lore: "They buried it with its knight. By morning the grave was empty and the sky was on fire.",
    scene:
      "a knight in gleaming gold and crimson armor with flame-shaped pauldrons and a cape of living fire, winged helm, rising from glowing ashes on a dawn battlefield, embers swirling upward",
  },
  "runic-berserker": {
    slug: "runic-berserker",
    name: "Runic Berserker Hide",
    title: "Armor of the Unleashed",
    essence: "Fur, iron and glowing runes. You feel everything at full volume, and in a fight, that's terrifying.",
    strengths: ["All heart", "Unstoppable once started", "Fiercely loyal to your crew"],
    weakness: "Once you're lit, it's hard to bring you back down.",
    lore: "Its runes were carved by a warrior who refused to die. They still glow when it's angry.",
    scene:
      "a massive warrior in dark iron and thick fur berserker armor covered in glowing blue runes, horned wolf-skull helm hiding the face, standing in snow before a burning longship at night",
  },
  tidecarapace: {
    slug: "tidecarapace",
    name: "Tidecarapace",
    title: "Armor of the Deep",
    essence: "Grown from the shell of something ancient at the bottom of the sea. There's a lot more to you than anyone sees.",
    strengths: ["Deep thinker", "Patient", "Calm as deep water"],
    weakness: "You keep so much below the surface that people misread you.",
    lore: "Fishermen pulled it from a trench no net should have reached. It was still warm.",
    scene:
      "a warrior in iridescent deep-teal sea-shell armor with coral-like ridges and a closed helm shaped like a nautilus, standing on black rocks as a huge storm wave rises behind them, bioluminescent glow along the armor",
  },
  thornwarden: {
    slug: "thornwarden",
    name: "Thornwarden Armor",
    title: "Armor of the Old Guardian",
    essence: "Living wood and old magic that grows back stronger when it's cut. You protect what's yours quietly, and forever.",
    strengths: ["Patient protector", "Grows from every hit", "Rooted and loyal"],
    weakness: "You hold onto things long after they've stopped holding onto you.",
    lore: "The forest made it from its oldest tree and asked only one thing: keep us.",
    scene:
      "a guardian in armor made of dark living wood, thorns and moss with faint green glowing veins, antlered faceless helm, standing among giant ancient trees in a misty forest with shafts of light",
  },
  stormherald: {
    slug: "stormherald",
    name: "Stormherald Plate",
    title: "Armor of the Lightning",
    essence: "Silver plate that crackles with lightning. You're fast, bold and already moving while everyone else is still deciding.",
    strengths: ["Fast to act", "Bold", "Energizes everyone around you"],
    weakness: "Waiting feels like losing, even when it's the smart move.",
    lore: "It struck the enemy line before the thunder did.",
    scene:
      "a knight in sleek silver plate armor with lightning crackling across it and a winged helm, cape whipping in the wind, standing on a cliff edge as lightning bolts strike the sea below",
  },
  "bone-king": {
    slug: "bone-king",
    name: "Bone King's Regalia",
    title: "Armor of the Feared",
    essence: "Dark iron and the bones of old rivals. You don't need to raise your voice. People already know what you're capable of.",
    strengths: ["Commands respect", "Strategic", "Impossible to intimidate"],
    weakness: "You'd rather be feared than risk being let down.",
    lore: "Every bone in it once belonged to someone who said it couldn't be done.",
    scene:
      "a dark king in black iron armor decorated with bone and a crown of horns, faceless helm with glowing eyes, seated on a throne of bones in a torch-lit hall, mist on the floor",
  },
  "sunforged-templar": {
    slug: "sunforged-templar",
    name: "Sunforged Templar",
    title: "Armor of the Devoted",
    essence: "Gold and white, forged at dawn. You live by a code and you keep your word even when nobody would know.",
    strengths: ["Disciplined", "Keeps every promise", "Steady as sunrise"],
    weakness: "You hold yourself to a standard nobody could meet.",
    lore: "It was forged at sunrise, and it has never stood down before sunset.",
    scene:
      "a templar knight in polished gold-and-white sunforged plate armor with a sun emblem on the chest and a great helm, holding a tall shield, standing in a desert temple doorway at sunrise, light rays behind them",
  },
};

export const WEAPON_RESULTS: Record<string, QuizResult> = {
  "thunderhead-greataxe": {
    slug: "thunderhead-greataxe",
    name: "Thunderhead Greataxe",
    title: "Weapon of the Storm",
    essence: "A double-bladed axe that calls lightning. You're loud, bold and you hit like the weather.",
    strengths: ["Raw power", "Fearless", "Rallies everyone around you"],
    weakness: "Subtle isn't in your vocabulary.",
    lore: "Every time it struck, the sky answered.",
    scene:
      "a massive double-bladed greataxe of dark steel with lightning crackling along its blades, standing upright embedded in a rock on a mountaintop as a thunderstorm rages, rain and lightning all around",
  },
  "winters-edge": {
    slug: "winters-edge",
    name: "Winter's Edge",
    title: "Weapon of the Calm",
    essence: "A longsword of living ice that never melts. You stay cool, cut clean and never waste a move.",
    strengths: ["Precise", "Calm under pressure", "Patient"],
    weakness: "You can freeze people out without meaning to.",
    lore: "It was found in the hand of a frozen king who had held the pass alone.",
    scene:
      "an elegant longsword with a blade of glowing translucent blue ice and a silver hilt, floating above a frozen altar in an ice cavern, frost mist curling around it, cold blue light",
  },
  "dragonfang-greatsword": {
    slug: "dragonfang-greatsword",
    name: "Dragonfang Greatsword",
    title: "Weapon of the Champion",
    essence: "Carved from the fang of a dragon king. You were made for the big moments, and you never shrink from one.",
    strengths: ["Born leader", "Rises to the moment", "Unshakable courage"],
    weakness: "You'd rather carry the whole fight than share the glory.",
    lore: "The dragon gave up its fang. The knight gave up everything else.",
    scene:
      "a huge greatsword with a curved ivory blade carved from a dragon's fang, glowing ember-red runes and a hilt wrapped in black leather, resting on a pile of gold in a dragon's lair, firelight and smoke",
  },
  "voidreaper-scythe": {
    slug: "voidreaper-scythe",
    name: "Voidreaper Scythe",
    title: "Weapon of the Mystery",
    essence: "A black scythe that hums with something from beyond. You're intense, quiet and impossible to read.",
    strengths: ["Unreadable", "Sees what others miss", "Fearless in the dark"],
    weakness: "You let people believe the dark is all there is to you.",
    lore: "Nobody forged it. It was simply there one morning, leaning against the gate.",
    scene:
      "a tall black scythe with a curved obsidian blade leaking violet void energy, standing in a misty graveyard under a huge pale moon, faint purple sparks drifting from the blade",
  },
  sunspear: {
    slug: "sunspear",
    name: "The Sunspear",
    title: "Weapon of the Honorable",
    essence: "A golden spear that burns with dawn light. You fight for something bigger than yourself, and people feel it.",
    strengths: ["Honorable", "Inspiring", "Never misses the point"],
    weakness: "You struggle to forgive anyone who breaks their word.",
    lore: "It was thrown once at the end of the long night. The sun came up behind it.",
    scene:
      "a long golden spear with a blazing sun-shaped blade glowing with warm light, held upright in a stone hand of an ancient statue in a desert temple at sunrise, light rays streaming through dust",
  },
  "shadowfang-daggers": {
    slug: "shadowfang-daggers",
    name: "Twin Shadowfangs",
    title: "Weapons of the Clever",
    essence: "Two black daggers that strike before anyone sees them move. You win with speed and wit, not size.",
    strengths: ["Quick-witted", "Adaptable", "Always a step ahead"],
    weakness: "You trust your own plan more than anyone else's.",
    lore: "The guards found both daggers on the king's pillow, and the king still alive. That was the message.",
    scene:
      "a pair of curved black daggers with smoky shadow drifting off their blades and green gems in the hilts, crossed on a dark stone table in a candle-lit room, shadows curling around them",
  },
  "worldsplitter-warhammer": {
    slug: "worldsplitter-warhammer",
    name: "Worldsplitter",
    title: "Weapon of the Unstoppable",
    essence: "A warhammer so heavy that only you can lift it. You carry weight that would crush other people.",
    strengths: ["Immense strength", "Reliable", "Unstoppable once moving"],
    weakness: "You carry everything yourself because you can.",
    lore: "It struck the ground once in anger. There's a canyon there now.",
    scene:
      "a colossal stone-and-iron warhammer with glowing orange cracks running through its head, resting upright on a cracked mountain plateau, lava glowing in the cracks of the ground around it, ash in the air",
  },
  "phoenix-longbow": {
    slug: "phoenix-longbow",
    name: "Phoenix Longbow",
    title: "Weapon of the Hopeful",
    essence: "A bow of gold and flame whose arrows burn like dawn. You see far, aim true and never lose hope.",
    strengths: ["Long-range vision", "Hopeful", "Always lands it"],
    weakness: "You stand back so long that people forget you're in the fight.",
    lore: "Its last arrow lit the signal fires of three kingdoms.",
    scene:
      "an elegant longbow of gold and red wood shaped like phoenix wings, a burning arrow nocked, floating above a cliff edge at sunrise with flame feathers trailing off it",
  },
  "tidecaller-trident": {
    slug: "tidecaller-trident",
    name: "Tidecaller Trident",
    title: "Weapon of the Deep",
    essence: "A trident that commands the sea. You're calm on the surface and unstoppable when the tide turns.",
    strengths: ["Deep calm", "Patient power", "Goes with the flow, then becomes it"],
    weakness: "When you finally break, the whole sea feels it.",
    lore: "Kings fought for it for a thousand years. It answered only one, and she never told them why.",
    scene:
      "a massive silver-and-teal trident with glowing blue runes and coral grown around its shaft, rising out of a stormy ocean as a giant wave curls behind it, lightning in the clouds",
  },
  "moonsteel-katana": {
    slug: "moonsteel-katana",
    name: "Moonsteel Katana",
    title: "Weapon of the Disciplined",
    essence: "A blade forged under a full moon and polished for a hundred years. You master things nobody else has patience for.",
    strengths: ["Disciplined", "Precise", "Quietly deadly"],
    weakness: "You're harder on yourself than any enemy could be.",
    lore: "It has been drawn three times in five hundred years. Three wars ended.",
    scene:
      "a katana with a pale silver moonsteel blade glowing faintly blue, resting on a black lacquered stand in a quiet mountain shrine at night, full moon through the open door, cherry petals drifting in",
  },
  "soulfire-staff": {
    slug: "soulfire-staff",
    name: "Soulfire Staff",
    title: "Weapon of the Wise",
    essence: "A staff of ancient wood crowned with blue flame. You win with knowledge, and people come to you when nobody else has the answer.",
    strengths: ["Brilliant mind", "Calm wisdom", "Sees the long game"],
    weakness: "You think so far ahead that you forget to live in the now.",
    lore: "The flame on top has never gone out. Some say it's the soul of the first wizard.",
    scene:
      "a tall gnarled wizard's staff of ancient dark wood crowned with a floating orb of blue soul-fire, standing in a stone circle on a misty hilltop at night, runes glowing on the stones",
  },
  "crimson-glaive": {
    slug: "crimson-glaive",
    name: "Crimson Glaive",
    title: "Weapon of the Wildcard",
    essence: "A blood-red polearm with a blade that sings. You're unpredictable, a little dangerous and impossible to forget.",
    strengths: ["Fearless risk-taker", "Thrives in chaos", "Unforgettable"],
    weakness: "Not every fight is worth winning.",
    lore: "Its wielders never lived long. They were always legends.",
    scene:
      "a long polearm glaive with a curved crimson blade glowing at the edge and a black shaft wrapped in red cloth, planted in the ground on a burning battlefield at dusk, embers and smoke around it",
  },
};
