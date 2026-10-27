/**
 * Legendary Mythicals beasts (2026-10-01, per Keenan): the results of the
 * "Which Legendary Creature Are You?" quiz. 12 at launch, 20 since
 * 2026-10-27 (more variety). The questions and scoring live in quizzes.ts
 * with the armor and weapon quizzes.
 */

export type ArchetypeSlug =
  | "storm-dragon"
  | "frost-kirin"
  | "shadow-fenrir"
  | "phoenix"
  | "kraken"
  | "griffin"
  | "thunder-roc"
  | "basilisk"
  | "qilin"
  | "manticore"
  | "leviathan"
  | "sphinx"
  | "hydra"
  | "wyvern"
  | "cerberus"
  | "chimera"
  | "kitsune"
  | "behemoth"
  | "obsidian-wyrm"
  | "nightmare";

export interface Archetype {
  slug: ArchetypeSlug;
  name: string;
  /** Short epithet shown under the name. */
  title: string;
  /** Two short sentences: what this creature is, and what that says about you. */
  essence: string;
  strengths: [string, string, string];
  weakness: string;
  /** One dramatic line of lore. */
  lore: string;
  /** Element words used to steer the paid portrait. */
  element: string;
  /** Scene for the archetype's hero image (gpt-image-2). */
  scene: string;
}

export const ARCHETYPES: Record<ArchetypeSlug, Archetype> = {
  "storm-dragon": {
    slug: "storm-dragon",
    name: "Storm Dragon",
    title: "The One Who Leads From the Front",
    essence:
      "You are the storm everyone hears coming. People follow you because you walk into the hard thing first.",
    strengths: ["Fearless in a crisis", "Natural leader", "Unshakable will"],
    weakness: "You forget that not everyone can fly through the storm with you.",
    lore: "When the sky turned black over the old kingdom, the people did not hide. They looked up, because they knew who was coming.",
    element: "storm, lightning and fire",
    scene:
      "a colossal storm dragon with slate-grey and gold scales roaring on a cliff edge as lightning splits a black sky behind it, rain lashing, wings half-raised",
  },
  "frost-kirin": {
    slug: "frost-kirin",
    name: "Frost Kirin",
    title: "The Quiet Guardian",
    essence:
      "Calm on the surface, unbreakable underneath. You protect what matters without needing anyone to notice.",
    strengths: ["Steady under pressure", "Deeply loyal", "Wise beyond your years"],
    weakness: "You carry more than you ever let anyone see.",
    lore: "Wherever the frost kirin walked, the winter softened, and no one ever saw it leave.",
    element: "ice, mist and moonlight",
    scene:
      "a majestic frost kirin with pale silver-blue scales, a flowing white mane like mist and crystalline antlers standing in a snowy pine forest at blue dawn, breath fogging",
  },
  "shadow-fenrir": {
    slug: "shadow-fenrir",
    name: "Shadow Fenrir",
    title: "The Unbound",
    essence:
      "You answer to no one and you never forget a debt. Cross the people you love and you will learn what loyalty costs.",
    strengths: ["Fiercely loyal", "Impossible to intimidate", "Sees through people"],
    weakness: "Trust is hard to earn from you, and harder to win back.",
    lore: "The gods bound the wolf with a chain made of impossible things. It was not enough.",
    element: "shadow and moonlight",
    scene:
      "a giant black wolf with glowing amber eyes standing on a moonlit rocky ridge, mist curling around its paws, a broken chain trailing in the rocks",
  },
  phoenix: {
    slug: "phoenix",
    name: "Phoenix",
    title: "The One Who Rises Again",
    essence:
      "You have been knocked down more than people know, and every time you came back brighter. Endings do not scare you.",
    strengths: ["Resilient beyond reason", "Warm and magnetic", "Turns pain into power"],
    weakness: "You burn yourself down before you ask for help.",
    lore: "It has died a thousand times. It has never once stayed down.",
    element: "flame and gold",
    scene:
      "a radiant phoenix of gold and crimson fire rising with wings spread wide against a dawn sky, embers trailing from its feathers above a mountain valley",
  },
  kraken: {
    slug: "kraken",
    name: "Kraken",
    title: "The Force Beneath",
    essence:
      "You are bigger than anyone realizes until it is too late. When you finally commit, nothing stands in your way.",
    strengths: ["Relentless", "Strategic patience", "Overwhelming when it counts"],
    weakness: "You keep so much below the surface that people misread you.",
    lore: "Sailors did not fear the storm. They feared the calm that came before the ship began to sink.",
    element: "deep ocean and storm",
    scene:
      "a colossal deep-red kraken rising out of a stormy grey ocean, huge tentacles curling above the waves around a tiny old sailing ship, lightning on the horizon",
  },
  griffin: {
    slug: "griffin",
    name: "Griffin",
    title: "The Sworn Protector",
    essence:
      "Half lion, half eagle, all honor. You guard your people and your word like treasure.",
    strengths: ["Honorable to the core", "Brave and protective", "Sharp-eyed"],
    weakness: "You hold yourself to a standard nobody could meet.",
    lore: "Kings slept soundly only when a griffin kept the gate.",
    element: "sky and sunlight",
    scene:
      "a majestic golden griffin with an eagle head and lion body, wings raised, standing guard on a mountain peak at sunrise above a sea of clouds",
  },
  "thunder-roc": {
    slug: "thunder-roc",
    name: "Thunder Roc",
    title: "The Free Spirit",
    essence:
      "You need open sky. Give you a horizon and you will reach it before anyone else has packed.",
    strengths: ["Bold and adventurous", "Fast to act", "Lifts everyone around you"],
    weakness: "Staying still feels like a cage, even when it is rest.",
    lore: "Its shadow crossed three kingdoms in a single afternoon.",
    element: "wind and thunder",
    scene:
      "a colossal eagle-like roc with storm-grey feathers soaring through towering dark clouds crackling with lightning, wings spread across the frame",
  },
  basilisk: {
    slug: "basilisk",
    name: "Basilisk",
    title: "The Patient King",
    essence:
      "You see everything and say very little. By the time anyone realizes what you were planning, you have already won.",
    strengths: ["Strategic mind", "Unreadable", "Deadly focus"],
    weakness: "You can mistake distance for safety.",
    lore: "No one who met its gaze ever told the story twice.",
    element: "jungle, stone and venom",
    scene:
      "a massive emerald-scaled serpent king with a crown of horns coiled among ancient overgrown jungle ruins in green shafts of light",
  },
  qilin: {
    slug: "qilin",
    name: "Qilin",
    title: "The Peacemaker",
    essence:
      "Your presence calms a room. You win without fighting, and people trust you without knowing why.",
    strengths: ["Kind but unshakable", "Brings people together", "Quietly wise"],
    weakness: "You give so much grace that people forget you have limits.",
    lore: "It walked on grass without bending a single blade, and wars ended where it passed.",
    element: "jade, mist and spring light",
    scene:
      "a serene jade-and-gold qilin with a flowing silver mane walking through a misty bamboo forest in soft morning light",
  },
  manticore: {
    slug: "manticore",
    name: "Manticore",
    title: "The Wildcard",
    essence:
      "Dangerous, brilliant and impossible to predict. You break rules other people never thought to question.",
    strengths: ["Fearless risk-taker", "Wickedly clever", "Thrives in chaos"],
    weakness: "Not every fight is worth winning.",
    lore: "Hunters went looking for it. That was always their mistake.",
    element: "desert fire and dusk",
    scene:
      "a powerful lion-bodied manticore with bat wings and a spiked tail standing on red canyon rocks at sunset, dust in the golden light",
  },
  leviathan: {
    slug: "leviathan",
    name: "Leviathan",
    title: "The Unstoppable",
    essence:
      "Calm, vast and impossible to move once your mind is made up. You do not chase. You arrive.",
    strengths: ["Immovable resolve", "Deep calm", "Endless endurance"],
    weakness: "When you finally break, the whole sea feels it.",
    lore: "Old maps marked its waters with a single word: Here.",
    element: "deep sea and dusk",
    scene:
      "an immense blue-grey sea serpent breaching from a glassy ocean at dusk, water cascading off its scales, a lighthouse tiny on a distant cliff",
  },
  sphinx: {
    slug: "sphinx",
    name: "Sphinx",
    title: "The Keeper of Secrets",
    essence:
      "You ask the questions nobody else thinks to ask. People come to you for answers, and leave with better questions.",
    strengths: ["Brilliant mind", "Sees the long game", "Composed and commanding"],
    weakness: "You test people when you could simply trust them.",
    lore: "It guarded the road for a thousand years and asked only one question. Almost no one answered it.",
    element: "desert gold and starlight",
    scene:
      "a giant winged sphinx of stone and gold resting on a desert dune before ancient ruins under a vast starry night sky, moonlight on its face",
  },
  hydra: {
    slug: "hydra",
    name: "Hydra",
    title: "The One Who Cannot Be Cut Down",
    essence:
      "Every setback makes you stronger. People keep trying to stop you, and every time they try there is more of you to deal with.",
    strengths: ["Comes back harder", "Thinks on several fronts at once", "Impossible to wear down"],
    weakness: "You fight on so many fronts that you forget to rest on any of them.",
    lore: "The hero cut off one head and stepped back to rest. That was the last mistake he made.",
    element: "swamp mist and venom",
    scene:
      "a colossal many-headed hydra with dark green scales rising from a misty black swamp at dusk, seven serpent heads raised against a storm sky, venom dripping, dead trees around it",
  },
  wyvern: {
    slug: "wyvern",
    name: "Wyvern",
    title: "The Hunter of the High Peaks",
    essence:
      "Lean, fast and focused. You don't waste energy on show. You see what you want and you take it before anyone else moves.",
    strengths: ["Razor focus", "Strikes at the right moment", "Thrives alone"],
    weakness: "You'd rather go it alone than wait for anyone to catch up.",
    lore: "Shepherds never saw it land. They only counted the flock in the morning.",
    element: "mountain wind and frost",
    scene:
      "a sleek dark-bronze wyvern with huge leathery wings perched on a jagged snowy mountain spire, wings half open, wind tearing snow off the ridge, cold blue light",
  },
  cerberus: {
    slug: "cerberus",
    name: "Cerberus",
    title: "The Guardian at the Gate",
    essence:
      "You protect your people like it's your whole purpose, because to you it is. Nobody gets past you to the people you love.",
    strengths: ["Unbreakable loyalty", "Never off guard", "Terrifying when provoked"],
    weakness: "You guard others so hard that nobody guards you.",
    lore: "The gate to the underworld had no lock. It never needed one.",
    element: "hellfire and obsidian",
    scene:
      "a colossal three-headed black hound with glowing ember eyes standing before a towering obsidian gate, rivers of fire glowing behind it, smoke curling around its paws",
  },
  chimera: {
    slug: "chimera",
    name: "Chimera",
    title: "The One Nobody Can Label",
    essence:
      "You are three things at once and you refuse to pick one. People try to put you in a box, and you break every box they bring.",
    strengths: ["Endlessly adaptable", "Many talents", "Thrives where others get stuck"],
    weakness: "Pulled in so many directions that you rarely finish one.",
    lore: "Every scholar who described it described a different beast. All of them were right.",
    element: "fire, earth and storm",
    scene:
      "a massive chimera with a lion's body and mane, a goat head rising from its back and a serpent tail, standing on volcanic rocks breathing a plume of fire, ash falling in red light",
  },
  kitsune: {
    slug: "kitsune",
    name: "Kitsune",
    title: "The Trickster Spirit",
    essence:
      "Clever, playful and always three moves ahead. People think they've figured you out right up until you show them another tail.",
    strengths: ["Quick wit", "Reads people instantly", "Charming in any room"],
    weakness: "You hide your real self behind the game.",
    lore: "Each tail took a hundred years to grow. It has nine.",
    element: "spirit fire and moonlight",
    scene:
      "a giant white nine-tailed fox spirit with glowing blue foxfire floating around its tails, standing on a moonlit shrine stairway lined with red torii gates, cherry petals in the air",
  },
  behemoth: {
    slug: "behemoth",
    name: "Behemoth",
    title: "The Mountain That Walks",
    essence:
      "Steady, strong and impossible to push around. You carry weight that would crush other people and you barely slow down.",
    strengths: ["Raw strength", "Rock-solid", "Patient as stone"],
    weakness: "You carry everything yourself because you can.",
    lore: "Armies built walls in its path. It walked through them like they were fog.",
    element: "earth and stone",
    scene:
      "an immense horned behemoth with a hide like cracked stone and moss walking through a valley, ancient trees reaching only to its knees, dust rising, low golden sun",
  },
  "obsidian-wyrm": {
    slug: "obsidian-wyrm",
    name: "Obsidian Wyrm",
    title: "The Ancient Fire",
    essence:
      "Old soul, slow burn. You don't start fires often, but when you do, everyone remembers.",
    strengths: ["Unshakable composure", "Ancient patience", "A fury nobody forgets"],
    weakness: "You hold grudges like you hold treasure.",
    lore: "It slept beneath the mountain for a thousand years. The mountain was the only thing keeping it in.",
    element: "lava and black glass",
    scene:
      "a colossal winged dragon with scales of black volcanic glass and glowing lava veins, wings spread wide, rising from a lava lake inside a cavern, molten light on its scales",
  },
  nightmare: {
    slug: "nightmare",
    name: "Nightmare",
    title: "The Rider of the Dark",
    essence:
      "Intense, mysterious and impossible to forget. You don't need to be loud. People feel you before they see you.",
    strengths: ["Magnetic presence", "Fearless in the dark", "Moves fast and leaves no trace"],
    weakness: "You let people believe the dark is all there is to you.",
    lore: "Travellers heard hooves on the road behind them. None of them turned around twice.",
    element: "shadow fire and night",
    scene:
      "a towering black spectral warhorse with a mane and hooves of violet flame galloping across a misty moonlit moor, sparks rising from each hoofbeat",
  },
};

export const ARCHETYPE_LIST: Archetype[] = Object.values(ARCHETYPES);

export function isArchetypeSlug(s: string): s is ArchetypeSlug {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, s);
}

/** Public URL for an archetype hero image in the content-factory bucket. */
export function archetypeImageUrl(slug: ArchetypeSlug): string {
  return `https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site/archetypes/${slug}.jpg`;
}

/**
 * Email hero: a 4:5 crop that keeps the whole creature. `animated` is the
 * looping GIF (Higgsfield Kling 3.0 Turbo clip, 2026-10-01); Outlook desktop
 * shows its first frame, so it degrades to the still.
 */
export function archetypeEmailHeroUrl(slug: ArchetypeSlug, animated = false): string {
  return `https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site/email/${slug}.${animated ? "gif" : "jpg"}`;
}

/** 1200x630 share image for a result page. */
export function archetypeOgUrl(slug: ArchetypeSlug): string {
  return `https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site/og/${slug}.jpg`;
}
