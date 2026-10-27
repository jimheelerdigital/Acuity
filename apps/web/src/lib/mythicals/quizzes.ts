/**
 * Legendary Mythicals quizzes (2026-10-27, per Keenan: "beef up the quiz...
 * add more variety... add three separate quizzes": beast, armor, weapon).
 *
 * Each quiz has a pool of questions and draws `draw` of them at random per
 * attempt, so a retake feels new. Every answer awards a point to three
 * results; pools are balanced so every result is reachable on any draw
 * (quizzes.test.ts checks this).
 *
 * A finished attempt travels to the result page as `?a=` pairs of
 * [pool index base36][answer index], e.g. "3172a0…".
 */

import { ARCHETYPES, archetypeEmailHeroUrl, archetypeImageUrl, archetypeOgUrl } from "./archetypes";
import { ARMOR_RESULTS, WEAPON_RESULTS, type QuizResult } from "./quiz-results";

export type QuizKind = "beast" | "armor" | "weapon";

export interface PoolQuestion {
  q: string;
  answers: { text: string; points: [string, string, string] }[];
}

export interface QuizDef {
  kind: QuizKind;
  /** Picker card label. */
  label: string;
  headline: string;
  eyebrow: string;
  blurb: string;
  /** "creature" / "armor" / "weapon": used in copy ("your creature"). */
  noun: string;
  /** Lead-in above the result name for the person who took it. */
  resultLead: string;
  results: Record<string, QuizResult>;
  pool: PoolQuestion[];
  draw: number;
  /** Result picked for the picker card art. */
  coverSlug: string;
}

const ASSETS = "https://rohjfcenylmfnqoyoirn.supabase.co/storage/v1/object/public/content-factory/mythicals-site";

// ── Beast pool: the 8 launch questions + 10 added 2026-10-27 ────────────
const BEAST_POOL: PoolQuestion[] = [
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
  {
    q: "A stranger challenges you to a duel. You…",
    answers: [
      { text: "Accept before they finish the sentence", points: ["wyvern", "nightmare", "manticore"] },
      { text: "Laugh, then talk them out of it", points: ["kitsune", "chimera", "qilin"] },
      { text: "Let them swing first and wear themselves out", points: ["behemoth", "hydra", "kraken"] },
      { text: "Ask who sent them", points: ["cerberus", "obsidian-wyrm", "sphinx"] },
    ],
  },
  {
    q: "Where do you rest after a long war?",
    answers: [
      { text: "On a pile of treasure under a volcano", points: ["obsidian-wyrm", "behemoth", "storm-dragon"] },
      { text: "A shrine high in the mountains nobody can find", points: ["kitsune", "wyvern", "frost-kirin"] },
      { text: "I don't. I'm still at the gate, on watch.", points: ["cerberus", "griffin", "hydra"] },
      { text: "On the road, riding through the night", points: ["nightmare", "thunder-roc", "chimera"] },
    ],
  },
  {
    q: "Your friends would describe you as…",
    answers: [
      { text: "The one who always comes back", points: ["hydra", "phoenix", "behemoth"] },
      { text: "Impossible to read", points: ["nightmare", "kitsune", "basilisk"] },
      { text: "Loyal to a fault", points: ["cerberus", "shadow-fenrir", "obsidian-wyrm"] },
      { text: "A little bit of everything", points: ["chimera", "wyvern", "leviathan"] },
    ],
  },
  {
    q: "What scares you most?",
    answers: [
      { text: "Being caged", points: ["wyvern", "nightmare", "thunder-roc"] },
      { text: "Losing the people I protect", points: ["cerberus", "griffin", "behemoth"] },
      { text: "Being forgotten", points: ["obsidian-wyrm", "chimera", "phoenix"] },
      { text: "Being figured out", points: ["kitsune", "hydra", "sphinx"] },
    ],
  },
  {
    q: "Choose a sound.",
    answers: [
      { text: "A roar that shakes the mountains", points: ["obsidian-wyrm", "behemoth", "storm-dragon"] },
      { text: "Hooves on a dark road", points: ["nightmare", "cerberus", "shadow-fenrir"] },
      { text: "A whisper right behind you", points: ["kitsune", "hydra", "basilisk"] },
      { text: "Wings overhead you never saw coming", points: ["wyvern", "chimera", "thunder-roc"] },
    ],
  },
  {
    q: "Your greatest weapon is…",
    answers: [
      { text: "My size", points: ["behemoth", "obsidian-wyrm", "leviathan"] },
      { text: "My mind", points: ["kitsune", "chimera", "sphinx"] },
      { text: "My speed", points: ["wyvern", "nightmare", "griffin"] },
      { text: "I simply never stop", points: ["hydra", "cerberus", "kraken"] },
    ],
  },
  {
    q: "A kingdom offers you a job. You take…",
    answers: [
      { text: "Royal guard", points: ["cerberus", "qilin", "frost-kirin"] },
      { text: "Spymaster", points: ["kitsune", "nightmare", "basilisk"] },
      { text: "Their army's secret weapon", points: ["obsidian-wyrm", "hydra", "manticore"] },
      { text: "Nothing. I answer to no one.", points: ["wyvern", "chimera", "behemoth"] },
    ],
  },
  {
    q: "Pick a time.",
    answers: [
      { text: "Midnight", points: ["nightmare", "kitsune", "shadow-fenrir"] },
      { text: "Dawn", points: ["wyvern", "phoenix", "qilin"] },
      { text: "The middle of a storm", points: ["hydra", "chimera", "storm-dragon"] },
      { text: "The hour before an eruption", points: ["obsidian-wyrm", "behemoth", "cerberus"] },
    ],
  },
  {
    q: "How do you handle a bad day?",
    answers: [
      { text: "Go quiet and disappear for a while", points: ["wyvern", "nightmare", "frost-kirin"] },
      { text: "Hit something heavy", points: ["behemoth", "cerberus", "manticore"] },
      { text: "Laugh it off and change the plan", points: ["kitsune", "chimera", "thunder-roc"] },
      { text: "Hold it in until it erupts", points: ["obsidian-wyrm", "hydra", "leviathan"] },
    ],
  },
  {
    q: "What guards your lair?",
    answers: [
      { text: "Nothing. They'd have to get past me.", points: ["cerberus", "behemoth", "griffin"] },
      { text: "Riddles and illusions", points: ["kitsune", "chimera", "sphinx"] },
      { text: "A river of fire", points: ["obsidian-wyrm", "nightmare", "phoenix"] },
      { text: "Endless traps in the dark", points: ["hydra", "wyvern", "basilisk"] },
    ],
  },
];

// ── Armor pool (2026-10-27) ─────────────────────────────────────────────
const ARMOR_POOL: PoolQuestion[] = [
  {
    q: "You walk onto the battlefield. What do people notice first?",
    answers: [
      { text: "The sound of you coming", points: ["obsidian-warplate", "runic-berserker", "stormherald"] },
      { text: "The light coming off you", points: ["celestial-aegis", "sunforged-templar", "phoenix-mantle"] },
      { text: "Nothing. They never saw you.", points: ["shadowweave", "tidecarapace", "thornwarden"] },
      { text: "The fear on everyone else's face", points: ["bone-king", "dragonscale-plate", "frostforged-mail"] },
    ],
  },
  {
    q: "Your armor should be made from…",
    answers: [
      { text: "The scales of a dragon you beat", points: ["dragonscale-plate", "bone-king", "runic-berserker"] },
      { text: "Metal forged in a volcano", points: ["obsidian-warplate", "phoenix-mantle", "sunforged-templar"] },
      { text: "Something the sea gave up", points: ["tidecarapace", "frostforged-mail", "shadowweave"] },
      { text: "Living wood and old magic", points: ["thornwarden", "celestial-aegis", "stormherald"] },
    ],
  },
  {
    q: "In a fight, your job is…",
    answers: [
      { text: "Front line. First in.", points: ["dragonscale-plate", "runic-berserker", "obsidian-warplate"] },
      { text: "Shield wall. Nobody gets past.", points: ["celestial-aegis", "thornwarden", "frostforged-mail"] },
      { text: "Behind enemy lines", points: ["shadowweave", "stormherald", "tidecarapace"] },
      { text: "End it before it starts", points: ["bone-king", "sunforged-templar", "phoenix-mantle"] },
    ],
  },
  {
    q: "Pick a color.",
    answers: [
      { text: "Black", points: ["obsidian-warplate", "shadowweave", "thornwarden"] },
      { text: "Gold", points: ["celestial-aegis", "sunforged-templar", "dragonscale-plate"] },
      { text: "Ice blue", points: ["frostforged-mail", "tidecarapace", "stormherald"] },
      { text: "Blood red", points: ["runic-berserker", "phoenix-mantle", "bone-king"] },
    ],
  },
  {
    q: "What's carved into your breastplate?",
    answers: [
      { text: "Nothing. It speaks for itself.", points: ["obsidian-warplate", "frostforged-mail", "shadowweave"] },
      { text: "The names of everyone you've protected", points: ["celestial-aegis", "thornwarden", "sunforged-templar"] },
      { text: "Runes nobody can read anymore", points: ["runic-berserker", "tidecarapace", "bone-king"] },
      { text: "A flame that never goes out", points: ["phoenix-mantle", "dragonscale-plate", "stormherald"] },
    ],
  },
  {
    q: "How should enemies feel when they see you?",
    answers: [
      { text: "Hopeless", points: ["bone-king", "obsidian-warplate", "dragonscale-plate"] },
      { text: "Confused. Where did you come from?", points: ["shadowweave", "stormherald", "tidecarapace"] },
      { text: "Like they should have stayed home", points: ["runic-berserker", "frostforged-mail", "thornwarden"] },
      { text: "Like they're fighting something holy", points: ["celestial-aegis", "sunforged-templar", "phoenix-mantle"] },
    ],
  },
  {
    q: "Pick your helmet.",
    answers: [
      { text: "Horned, like a beast", points: ["runic-berserker", "dragonscale-plate", "bone-king"] },
      { text: "A hood instead of a helm", points: ["shadowweave", "thornwarden", "tidecarapace"] },
      { text: "Crowned with wings", points: ["celestial-aegis", "stormherald", "phoenix-mantle"] },
      { text: "A full visor. No face, no mercy.", points: ["obsidian-warplate", "frostforged-mail", "sunforged-templar"] },
    ],
  },
  {
    q: "You've been wounded. You…",
    answers: [
      { text: "Keep fighting. You'll feel it tomorrow.", points: ["runic-berserker", "obsidian-warplate", "phoenix-mantle"] },
      { text: "Fall back and come back smarter", points: ["shadowweave", "tidecarapace", "stormherald"] },
      { text: "Stand over your friends until help comes", points: ["celestial-aegis", "thornwarden", "frostforged-mail"] },
      { text: "Make them pay for it", points: ["bone-king", "dragonscale-plate", "sunforged-templar"] },
    ],
  },
  {
    q: "Where was your armor forged?",
    answers: [
      { text: "In the heart of a dying star", points: ["celestial-aegis", "sunforged-templar", "stormherald"] },
      { text: "At the bottom of the ocean", points: ["tidecarapace", "frostforged-mail", "shadowweave"] },
      { text: "From the bones of an old battlefield", points: ["bone-king", "obsidian-warplate", "thornwarden"] },
      { text: "In dragonfire", points: ["dragonscale-plate", "phoenix-mantle", "runic-berserker"] },
    ],
  },
  {
    q: "Your armor's hidden power is…",
    answers: [
      { text: "It gets stronger every time it's hit", points: ["obsidian-warplate", "runic-berserker", "dragonscale-plate"] },
      { text: "It turns invisible in shadow", points: ["shadowweave", "tidecarapace", "bone-king"] },
      { text: "It heals whoever stands beside you", points: ["celestial-aegis", "thornwarden", "phoenix-mantle"] },
      { text: "It calls lightning", points: ["stormherald", "sunforged-templar", "frostforged-mail"] },
    ],
  },
  {
    q: "Choose a battle cry.",
    answers: [
      { text: "No words. Just a roar.", points: ["runic-berserker", "dragonscale-plate", "phoenix-mantle"] },
      { text: "\"For the ones behind me.\"", points: ["celestial-aegis", "thornwarden", "sunforged-templar"] },
      { text: "Silence", points: ["shadowweave", "frostforged-mail", "tidecarapace"] },
      { text: "\"Kneel.\"", points: ["bone-king", "stormherald", "obsidian-warplate"] },
    ],
  },
  {
    q: "The war is over. Your armor…",
    answers: [
      { text: "Hangs in a great hall as a legend", points: ["dragonscale-plate", "celestial-aegis", "sunforged-templar"] },
      { text: "Goes back to where it came from", points: ["tidecarapace", "frostforged-mail", "thornwarden"] },
      { text: "Never comes off. The war is never really over.", points: ["obsidian-warplate", "bone-king", "runic-berserker"] },
      { text: "Disappears with you", points: ["shadowweave", "stormherald", "phoenix-mantle"] },
    ],
  },
  {
    q: "Pick the beast on your crest.",
    answers: [
      { text: "A dragon", points: ["dragonscale-plate", "phoenix-mantle", "runic-berserker"] },
      { text: "A wolf", points: ["shadowweave", "frostforged-mail", "thornwarden"] },
      { text: "A serpent", points: ["tidecarapace", "bone-king", "obsidian-warplate"] },
      { text: "An eagle", points: ["celestial-aegis", "stormherald", "sunforged-templar"] },
    ],
  },
  {
    q: "What's your real strength?",
    answers: [
      { text: "I don't quit", points: ["runic-berserker", "phoenix-mantle", "obsidian-warplate"] },
      { text: "I protect", points: ["celestial-aegis", "thornwarden", "frostforged-mail"] },
      { text: "I outthink", points: ["shadowweave", "tidecarapace", "bone-king"] },
      { text: "I lead", points: ["dragonscale-plate", "sunforged-templar", "stormherald"] },
    ],
  },
];

// ── Weapon pool (2026-10-27) ────────────────────────────────────────────
const WEAPON_POOL: PoolQuestion[] = [
  {
    q: "How do you like to fight?",
    answers: [
      { text: "Up close. Very close.", points: ["shadowfang-daggers", "thunderhead-greataxe", "worldsplitter-warhammer"] },
      { text: "From where they can't reach me", points: ["phoenix-longbow", "soulfire-staff", "tidecaller-trident"] },
      { text: "One clean cut", points: ["moonsteel-katana", "winters-edge", "voidreaper-scythe"] },
      { text: "Wide swings. Clear the room.", points: ["crimson-glaive", "dragonfang-greatsword", "sunspear"] },
    ],
  },
  {
    q: "Pick an element for your weapon.",
    answers: [
      { text: "Lightning", points: ["thunderhead-greataxe", "sunspear", "moonsteel-katana"] },
      { text: "Ice", points: ["winters-edge", "tidecaller-trident", "voidreaper-scythe"] },
      { text: "Fire", points: ["dragonfang-greatsword", "phoenix-longbow", "crimson-glaive"] },
      { text: "Pure magic", points: ["soulfire-staff", "shadowfang-daggers", "worldsplitter-warhammer"] },
    ],
  },
  {
    q: "Your weapon was…",
    answers: [
      { text: "Pulled from a dragon's hoard", points: ["dragonfang-greatsword", "crimson-glaive", "thunderhead-greataxe"] },
      { text: "Handed to you by a dying king", points: ["sunspear", "winters-edge", "worldsplitter-warhammer"] },
      { text: "Forged by you, alone, over years", points: ["moonsteel-katana", "shadowfang-daggers", "phoenix-longbow"] },
      { text: "Found where nothing should exist", points: ["voidreaper-scythe", "soulfire-staff", "tidecaller-trident"] },
    ],
  },
  {
    q: "What does your weapon do when you're not holding it?",
    answers: [
      { text: "Hums with thunder", points: ["thunderhead-greataxe", "worldsplitter-warhammer", "sunspear"] },
      { text: "Frosts everything it touches", points: ["winters-edge", "tidecaller-trident", "moonsteel-katana"] },
      { text: "Whispers", points: ["voidreaper-scythe", "soulfire-staff", "shadowfang-daggers"] },
      { text: "Burns", points: ["dragonfang-greatsword", "phoenix-longbow", "crimson-glaive"] },
    ],
  },
  {
    q: "Pick a fighting partner.",
    answers: [
      { text: "A war beast to ride into battle", points: ["sunspear", "crimson-glaive", "dragonfang-greatsword"] },
      { text: "A shadow nobody else can see", points: ["shadowfang-daggers", "voidreaper-scythe", "moonsteel-katana"] },
      { text: "A whole army behind me", points: ["worldsplitter-warhammer", "thunderhead-greataxe", "phoenix-longbow"] },
      { text: "The sea itself", points: ["tidecaller-trident", "winters-edge", "soulfire-staff"] },
    ],
  },
  {
    q: "What's engraved on your weapon?",
    answers: [
      { text: "A single word: \"Enough.\"", points: ["worldsplitter-warhammer", "winters-edge", "moonsteel-katana"] },
      { text: "The name of the first enemy it beat", points: ["dragonfang-greatsword", "thunderhead-greataxe", "crimson-glaive"] },
      { text: "Nothing. Names are for things you can lose.", points: ["shadowfang-daggers", "voidreaper-scythe", "tidecaller-trident"] },
      { text: "A prayer", points: ["sunspear", "phoenix-longbow", "soulfire-staff"] },
    ],
  },
  {
    q: "Your style is…",
    answers: [
      { text: "Patient, then devastating", points: ["moonsteel-katana", "voidreaper-scythe", "phoenix-longbow"] },
      { text: "Pure power", points: ["worldsplitter-warhammer", "thunderhead-greataxe", "dragonfang-greatsword"] },
      { text: "Fast and unfair", points: ["shadowfang-daggers", "crimson-glaive", "tidecaller-trident"] },
      { text: "Elegant and untouchable", points: ["soulfire-staff", "sunspear", "winters-edge"] },
    ],
  },
  {
    q: "Pick a battlefield.",
    answers: [
      { text: "A frozen pass at night", points: ["winters-edge", "voidreaper-scythe", "moonsteel-katana"] },
      { text: "A burning castle", points: ["dragonfang-greatsword", "crimson-glaive", "phoenix-longbow"] },
      { text: "A ship's deck in a storm", points: ["tidecaller-trident", "thunderhead-greataxe", "shadowfang-daggers"] },
      { text: "A temple at the edge of the world", points: ["soulfire-staff", "sunspear", "worldsplitter-warhammer"] },
    ],
  },
  {
    q: "What do your enemies say about you?",
    answers: [
      { text: "You never see it coming", points: ["shadowfang-daggers", "moonsteel-katana", "voidreaper-scythe"] },
      { text: "No armor can stop it", points: ["worldsplitter-warhammer", "thunderhead-greataxe", "crimson-glaive"] },
      { text: "It never misses", points: ["phoenix-longbow", "sunspear", "tidecaller-trident"] },
      { text: "It shouldn't be possible", points: ["soulfire-staff", "dragonfang-greatsword", "winters-edge"] },
    ],
  },
  {
    q: "How heavy is your weapon?",
    answers: [
      { text: "Nobody else can lift it", points: ["worldsplitter-warhammer", "thunderhead-greataxe", "dragonfang-greatsword"] },
      { text: "So light I forget I'm holding it", points: ["moonsteel-katana", "shadowfang-daggers", "phoenix-longbow"] },
      { text: "It changes depending on who holds it", points: ["soulfire-staff", "voidreaper-scythe", "crimson-glaive"] },
      { text: "Exactly right. It was made for me.", points: ["winters-edge", "sunspear", "tidecaller-trident"] },
    ],
  },
  {
    q: "Your weapon's hidden power is…",
    answers: [
      { text: "It flies back to my hand", points: ["thunderhead-greataxe", "tidecaller-trident", "crimson-glaive"] },
      { text: "It cuts through anything", points: ["moonsteel-katana", "dragonfang-greatsword", "winters-edge"] },
      { text: "It steals the enemy's strength", points: ["voidreaper-scythe", "shadowfang-daggers", "worldsplitter-warhammer"] },
      { text: "It lights the way in the dark", points: ["sunspear", "phoenix-longbow", "soulfire-staff"] },
    ],
  },
  {
    q: "Someone tries to steal it. What happens?",
    answers: [
      { text: "It won't lift for them", points: ["worldsplitter-warhammer", "sunspear", "winters-edge"] },
      { text: "It burns their hands", points: ["dragonfang-greatsword", "phoenix-longbow", "crimson-glaive"] },
      { text: "They're never seen again", points: ["voidreaper-scythe", "shadowfang-daggers", "soulfire-staff"] },
      { text: "It calls me, and I come", points: ["moonsteel-katana", "tidecaller-trident", "thunderhead-greataxe"] },
    ],
  },
  {
    q: "Choose a sound.",
    answers: [
      { text: "Thunder", points: ["thunderhead-greataxe", "worldsplitter-warhammer", "sunspear"] },
      { text: "Steel singing through the air", points: ["moonsteel-katana", "winters-edge", "tidecaller-trident"] },
      { text: "A whisper", points: ["shadowfang-daggers", "voidreaper-scythe", "soulfire-staff"] },
      { text: "A roaring flame", points: ["dragonfang-greatsword", "phoenix-longbow", "crimson-glaive"] },
    ],
  },
  {
    q: "What are you fighting for?",
    answers: [
      { text: "My people", points: ["sunspear", "worldsplitter-warhammer", "phoenix-longbow"] },
      { text: "Glory", points: ["dragonfang-greatsword", "crimson-glaive", "thunderhead-greataxe"] },
      { text: "Revenge", points: ["voidreaper-scythe", "shadowfang-daggers", "winters-edge"] },
      { text: "Honor", points: ["moonsteel-katana", "soulfire-staff", "tidecaller-trident"] },
    ],
  },
];

export const QUIZZES: Record<QuizKind, QuizDef> = {
  beast: {
    kind: "beast",
    label: "Beast",
    headline: "Which Legendary Creature Are You?",
    eyebrow: "Twenty creatures. One is yours.",
    blurb: "How you fight, lead and love decides which legend answers the call.",
    noun: "creature",
    resultLead: "You are the",
    results: ARCHETYPES as unknown as Record<string, QuizResult>,
    pool: BEAST_POOL,
    draw: 10,
    coverSlug: "storm-dragon",
  },
  armor: {
    kind: "armor",
    label: "Armor",
    headline: "Which Armor Set Is Yours?",
    eyebrow: "Twelve legendary sets. One was forged for you.",
    blurb: "How you fight and what you protect decides what you wear into battle.",
    noun: "armor",
    resultLead: "Your armor is",
    results: ARMOR_RESULTS,
    pool: ARMOR_POOL,
    draw: 8,
    coverSlug: "dragonscale-plate",
  },
  weapon: {
    kind: "weapon",
    label: "Weapon",
    headline: "Which Legendary Weapon Is Yours?",
    eyebrow: "Twelve legendary weapons. One answers to you.",
    blurb: "Your style, your temper and what you fight for decide which weapon chooses you.",
    noun: "weapon",
    resultLead: "Your weapon is",
    results: WEAPON_RESULTS,
    pool: WEAPON_POOL,
    draw: 8,
    coverSlug: "dragonfang-greatsword",
  },
};

export const QUIZ_KINDS: QuizKind[] = ["beast", "armor", "weapon"];

export function isQuizKind(s: string): s is QuizKind {
  return (QUIZ_KINDS as string[]).includes(s);
}

export function quizResult(kind: QuizKind, slug: string): QuizResult | null {
  const r = QUIZZES[kind].results;
  return Object.prototype.hasOwnProperty.call(r, slug) ? r[slug] : null;
}

/** Site paths (before the host base path). Beast keeps its launch URLs. */
export function quizPath(kind: QuizKind): string {
  return `/quiz/${kind}`;
}
export function resultPath(kind: QuizKind, slug: string): string {
  return kind === "beast" ? `/result/${slug}` : `/result/${kind}/${slug}`;
}

/** 1024x1792 hero (also the phone wallpaper). */
export function resultImageUrl(kind: QuizKind, slug: string): string {
  return kind === "beast" ? archetypeImageUrl(slug as never) : `${ASSETS}/${kind}/${slug}.jpg`;
}
/** 1200x630 share image. */
export function resultOgUrl(kind: QuizKind, slug: string): string {
  return kind === "beast" ? archetypeOgUrl(slug as never) : `${ASSETS}/og/${kind}-${slug}.jpg`;
}
/**
 * 4:5 email hero. Beasts from launch have an animated GIF; everything added
 * 2026-10-27 uses the still.
 */
export const LAUNCH_BEASTS = [
  "storm-dragon", "frost-kirin", "shadow-fenrir", "phoenix", "kraken", "griffin",
  "thunder-roc", "basilisk", "qilin", "manticore", "leviathan", "sphinx",
];
export function resultEmailHeroUrl(kind: QuizKind, slug: string): string {
  if (kind === "beast") return archetypeEmailHeroUrl(slug as never, LAUNCH_BEASTS.includes(slug));
  return `${ASSETS}/email/${kind}-${slug}.jpg`;
}

// ── Drawing, encoding and scoring ───────────────────────────────────────

/** Pick `draw` distinct pool indexes at random, in random order. */
export function drawQuestions(kind: QuizKind, rand: () => number = Math.random): number[] {
  const { pool, draw } = QUIZZES[kind];
  const idx = pool.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, Math.min(draw, pool.length));
}

export interface Pick {
  q: number;
  a: number;
}

export function encodePicks(picks: Pick[]): string {
  return picks.map((p) => `${p.q.toString(36)}${p.a}`).join("");
}

/** Parses `?a=`; returns null unless it is one full, valid attempt. */
export function decodePicks(kind: QuizKind, raw: string | undefined): Pick[] | null {
  const { pool, draw } = QUIZZES[kind];
  const s = (raw ?? "").slice(0, draw * 2);
  if (s.length !== Math.min(draw, pool.length) * 2) return null;
  const picks: Pick[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < s.length; i += 2) {
    const q = parseInt(s[i], 36);
    const a = Number(s[i + 1]);
    if (!Number.isInteger(q) || !pool[q] || seen.has(q) || !Number.isInteger(a) || !pool[q].answers[a]) return null;
    seen.add(q);
    picks.push({ q, a });
  }
  return picks;
}

/**
 * Score picks → result slug. Ties go to the result that scored first among
 * the tied, then a stable hash of the picks, so the same answers always give
 * the same result.
 */
export function scorePicks(kind: QuizKind, picks: Pick[]): string {
  const { pool, results } = QUIZZES[kind];
  const totals = new Map<string, number>();
  const firstHit = new Map<string, number>();
  picks.forEach((p, order) => {
    for (const slug of pool[p.q]?.answers[p.a]?.points ?? []) {
      totals.set(slug, (totals.get(slug) ?? 0) + 1);
      if (!firstHit.has(slug)) firstHit.set(slug, order);
    }
  });
  const max = Math.max(0, ...totals.values());
  const tied = [...totals.entries()].filter(([, v]) => v === max).map(([k]) => k);
  if (tied.length === 0) return QUIZZES[kind].coverSlug;
  if (tied.length === 1) return tied[0];
  const hash = picks.reduce((h, p, i) => (h * 31 + p.q * 11 + p.a * 7 + i) % 9973, 7);
  tied.sort((x, y) => firstHit.get(x)! - firstHit.get(y)! || x.localeCompare(y));
  const pick = tied[hash % tied.length];
  return Object.prototype.hasOwnProperty.call(results, pick) ? pick : QUIZZES[kind].coverSlug;
}
