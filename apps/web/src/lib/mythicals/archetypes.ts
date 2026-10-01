/**
 * Legendary Mythicals quiz (2026-10-01, per Keenan): "Which Legendary
 * Creature Are You?" — 8 questions, 4 answers each, scored in code onto 12
 * archetypes. Every answer awards a point to three archetypes; the counts
 * are balanced so each archetype is reachable (8 points max each).
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
  | "sphinx";

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
};

export const ARCHETYPE_LIST: Archetype[] = Object.values(ARCHETYPES);

export interface QuizQuestion {
  q: string;
  answers: { text: string; points: [ArchetypeSlug, ArchetypeSlug, ArchetypeSlug] }[];
}

export const QUIZ: QuizQuestion[] = [
  {
    q: "The night before a battle, you are…",
    answers: [
      { text: "Sharpening steel alone, saying nothing", points: ["shadow-fenrir", "basilisk", "sphinx"] },
      { text: "Rallying everyone around the fire", points: ["storm-dragon", "griffin", "phoenix"] },
      { text: "Studying the map until dawn", points: ["sphinx", "qilin", "leviathan"] },
      { text: "Already gone, scouting the enemy camp", points: ["thunder-roc", "manticore", "kraken"] },
    ],
  },
  {
    q: "Your ideal home is…",
    answers: [
      { text: "A fortress on a storm-lashed cliff", points: ["storm-dragon", "thunder-roc", "griffin"] },
      { text: "A hidden temple deep in a misty forest", points: ["qilin", "frost-kirin", "phoenix"] },
      { text: "Somewhere no map has ever reached", points: ["kraken", "leviathan", "thunder-roc"] },
      { text: "A city you quietly run from the shadows", points: ["basilisk", "manticore", "shadow-fenrir"] },
    ],
  },
  {
    q: "When someone betrays you, you…",
    answers: [
      { text: "Forgive them, once", points: ["qilin", "frost-kirin", "phoenix"] },
      { text: "Never forget it", points: ["basilisk", "leviathan", "shadow-fenrir"] },
      { text: "Hit back, immediately", points: ["manticore", "storm-dragon", "thunder-roc"] },
      { text: "Simply outlast them", points: ["kraken", "sphinx", "frost-kirin"] },
    ],
  },
  {
    q: "Pick an element.",
    answers: [
      { text: "Fire", points: ["phoenix", "storm-dragon", "manticore"] },
      { text: "Ice", points: ["frost-kirin", "shadow-fenrir", "qilin"] },
      { text: "The deep sea", points: ["kraken", "leviathan", "basilisk"] },
      { text: "Wind and sky", points: ["thunder-roc", "griffin", "sphinx"] },
    ],
  },
  {
    q: "What do people get wrong about you?",
    answers: [
      { text: "They think I'm cold. I'm just careful.", points: ["frost-kirin", "sphinx", "basilisk"] },
      { text: "They think I'm reckless. I've done the math.", points: ["manticore", "thunder-roc", "kraken"] },
      { text: "They underestimate how far I'd go for my people.", points: ["griffin", "shadow-fenrir", "phoenix"] },
      { text: "They think I'm calm. They've never seen me angry.", points: ["leviathan", "storm-dragon", "qilin"] },
    ],
  },
  {
    q: "Choose your reward.",
    answers: [
      { text: "A crown", points: ["storm-dragon", "sphinx", "basilisk"] },
      { text: "A legendary weapon", points: ["manticore", "griffin", "thunder-roc"] },
      { text: "A second chance at something you lost", points: ["phoenix", "qilin", "frost-kirin"] },
      { text: "Total freedom", points: ["kraken", "leviathan", "shadow-fenrir"] },
    ],
  },
  {
    q: "Your fighting style is…",
    answers: [
      { text: "Overwhelming force", points: ["storm-dragon", "kraken", "leviathan"] },
      { text: "Speed nobody can follow", points: ["thunder-roc", "griffin", "manticore"] },
      { text: "Patience, then one perfect strike", points: ["basilisk", "sphinx", "shadow-fenrir"] },
      { text: "Winning without a fight", points: ["qilin", "frost-kirin", "phoenix"] },
    ],
  },
  {
    q: "How do you want to be remembered?",
    answers: [
      { text: "As the one who never fell", points: ["griffin", "leviathan", "frost-kirin"] },
      { text: "As a mystery nobody solved", points: ["sphinx", "shadow-fenrir", "basilisk"] },
      { text: "As the one who rose again", points: ["phoenix", "qilin", "griffin"] },
      { text: "As a force of nature", points: ["kraken", "manticore", "storm-dragon"] },
    ],
  },
];

/**
 * Score answers (one answer index per question) → archetype slug. Ties go
 * to the archetype that scored first among the tied, then by a stable hash
 * of the answers so the same answers always give the same creature.
 */
export function scoreQuiz(answers: number[]): ArchetypeSlug {
  const totals = new Map<ArchetypeSlug, number>();
  const firstHit = new Map<ArchetypeSlug, number>();
  answers.forEach((a, qi) => {
    const pts = QUIZ[qi]?.answers[a]?.points ?? [];
    pts.forEach((slug) => {
      totals.set(slug, (totals.get(slug) ?? 0) + 1);
      if (!firstHit.has(slug)) firstHit.set(slug, qi);
    });
  });
  const max = Math.max(0, ...totals.values());
  const tied = [...totals.entries()].filter(([, v]) => v === max).map(([k]) => k);
  if (tied.length === 0) return "storm-dragon";
  if (tied.length === 1) return tied[0];
  const hash = answers.reduce((h, a, i) => (h * 31 + a * 7 + i) % 9973, 7);
  tied.sort((x, y) => (firstHit.get(x)! - firstHit.get(y)!) || x.localeCompare(y));
  return tied[hash % tied.length];
}

export function isArchetypeSlug(s: string): s is ArchetypeSlug {
  return Object.prototype.hasOwnProperty.call(ARCHETYPES, s);
}

/** Public URL for an archetype hero image in the content-factory bucket. */
export function archetypeImageUrl(slug: ArchetypeSlug): string {
  return `https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site/archetypes/${slug}.jpg`;
}

/** 1200x630 share image for a result page. */
export function archetypeOgUrl(slug: ArchetypeSlug): string {
  return `https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site/og/${slug}.jpg`;
}
