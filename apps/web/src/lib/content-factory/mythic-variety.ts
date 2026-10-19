/**
 * Mythicals 30-day variety rule (2026-10-19, per Keenan: "the poster keeps
 * using the same exact dragon types.... the same beasts/dragons/weapons
 * should never be used in the same month").
 *
 * Before this, the writer only saw the newest 60 option names as a hint and
 * nothing checked the result, so the same lineup kept coming back: over 30
 * days "Frost Dragon" appeared 10 times, "Ember" 9, "Storm" 7, plus
 * near-twin names ("Vorrath" / "Vorath", both Ember Dragons).
 *
 * An option's TYPE is its element/material word + the thing it is
 * ("Isvald the Frost Dragon" → "frost dragon"). Close synonyms share a key
 * (ice/glacier/rime → frost; wyrm/drake/wyvern → dragon), so a rename can't
 * sneak a repeat through. Words outside the families key on themselves, so
 * the writer always has room: a clockwork dragon or a lantern wyrm is new.
 * Invented names (Isvald, Ignarok) must also be new for the month, with
 * one-letter spellings counted as the same name.
 */

const DESC_FAMILIES: Record<string, string[]> = {
  fire: ["ember", "embers", "fire", "flame", "flames", "inferno", "blaze", "magma", "lava", "molten", "pyre", "cinder", "cinders", "ash", "ashen", "burning", "scorch", "dragonfire", "hellfire"],
  frost: ["frost", "ice", "icy", "glacier", "glacial", "snow", "winter", "rime", "hoarfrost", "frozen", "blizzard", "frostbite"],
  storm: ["storm", "thunder", "lightning", "tempest", "volt", "thunderbound", "skysplitter", "stormborn"],
  shadow: ["shadow", "night", "nightfang", "dark", "darkness", "void", "abyss", "abyssal", "umbral", "shade", "dusk", "midnight", "eclipse"],
  celestial: ["celestial", "star", "stars", "astral", "cosmic", "sun", "solar", "sunforged", "sunscale", "moon", "lunar", "dawn", "radiant", "starfall", "starborn"],
  nature: ["verdant", "forest", "thorn", "moss", "grove", "vine", "oak", "bramble", "jade", "eldermoss"],
  sea: ["sea", "tide", "tidal", "ocean", "deep", "deepsea", "wave", "coral", "tidefang"],
  death: ["bone", "grave", "gravewarden", "death", "plague", "rot", "skull", "crypt", "doom", "necrotic"],
  earth: ["stone", "earth", "mountain", "granite", "rock", "quake", "ironhide"],
  blood: ["blood", "crimson", "scarlet"],
};

const NOUN_FAMILIES: Record<string, string[]> = {
  dragon: ["dragon", "dragons", "wyrm", "wyrms", "drake", "drakes", "wyvern", "wyverns"],
  serpent: ["serpent", "serpents", "naga", "basilisk"],
  phoenix: ["phoenix", "firebird"],
  griffin: ["griffin", "gryphon"],
  wolf: ["wolf", "wolves", "warg", "hound", "direwolf"],
  kraken: ["kraken"],
  hydra: ["hydra"],
  leviathan: ["leviathan"],
  titan: ["titan", "giant", "colossus"],
  golem: ["golem"],
  beast: ["behemoth", "chimera", "manticore", "minotaur"],
  steed: ["steed", "stallion", "horse", "pegasus", "unicorn", "mount"],
  bird: ["eagle", "raven", "owl", "hawk", "roc"],
  cat: ["lion", "tiger", "panther", "sabretooth"],
  bear: ["bear"],
  sword: ["sword", "blade", "greatsword", "longsword", "sabre", "saber", "katana", "claymore", "falchion"],
  axe: ["axe", "battleaxe", "waraxe"],
  hammer: ["hammer", "warhammer", "maul"],
  mace: ["mace", "morningstar", "flail"],
  spear: ["spear", "lance", "pike", "javelin"],
  trident: ["trident"],
  glaive: ["glaive", "halberd", "poleaxe"],
  scythe: ["scythe", "sickle"],
  bow: ["bow", "longbow", "crossbow"],
  staff: ["staff", "stave", "wand", "scepter", "sceptre", "rod"],
  dagger: ["dagger", "dirk", "knife"],
  shield: ["shield", "aegis"],
  helm: ["helm", "helmet"],
  armor: ["armor", "armour", "plate", "cuirass", "mail"],
  gauntlet: ["gauntlet", "gauntlets"],
  crown: ["crown"],
  mage: ["mage", "wizard", "sorcerer", "sorceress", "witch", "warlock", "druid"],
};

// Filler and size-label words ("60m wingspan", "three", "twin") never form a type.
const STOP = new Set([
  "the", "of", "and", "a", "an", "your", "his", "her", "who", "that", "pick", "no", "lying",
  "one", "two", "three", "four", "five", "twin", "pair", "duo",
  "wingspan", "long", "tall", "high", "wide", "feet", "foot", "ft", "meters", "metres", "m", "km", "tons", "tonnes",
]);

const descIndex = new Map<string, string>();
for (const [fam, words] of Object.entries(DESC_FAMILIES)) for (const w of words) descIndex.set(w, fam);
const nounIndex = new Map<string, string>();
for (const [fam, words] of Object.entries(NOUN_FAMILIES)) for (const w of words) nounIndex.set(w, fam);

/** "3. Isvald the Frost Dragon" → "Isvald the Frost Dragon". */
function cleanName(raw: string): string {
  return raw.split("\n")[0].replace(/^\s*#?\d+[.)]\s*/, "").trim();
}

function words(name: string): string[] {
  return name.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z]+/).filter(Boolean);
}

/** A word's descriptor family: listed word, a "dragon"-prefixed compound
 *  (dragonbone → bone), or a compound that starts with a listed word of 4+
 *  letters (stormcaller → storm). Unlisted words key on themselves. */
function descKey(w: string): string | null {
  if (STOP.has(w) || nounIndex.has(w)) return null;
  if (descIndex.has(w)) return descIndex.get(w)!;
  const stripped = w.startsWith("dragon") && w.length > 6 ? w.slice(6) : w;
  if (descIndex.has(stripped)) return descIndex.get(stripped)!;
  for (const [d, fam] of descIndex) if (d.length >= 4 && stripped.startsWith(d)) return fam;
  return null;
}

export interface OptionKeys {
  /** "frost dragon", "fire sword", "lantern dragon" … */
  types: string[];
  /** Invented proper names, lowercased ("isvald"). */
  names: string[];
}

/** Type and name keys for one option name. */
export function optionKeys(raw: string): OptionKeys {
  const name = cleanName(raw);
  const ws = words(name);
  const nouns = [...new Set(ws.map((w) => nounIndex.get(w)).filter((n): n is string => !!n))];
  const types = new Set<string>();
  if (nouns.length) {
    // Descriptor = any non-noun word in the "the X Y" part after the name,
    // or the whole name when there is no "the" ("Twin Frost Wyverns").
    const theIdx = ws.indexOf("the");
    const descWords = (theIdx >= 0 ? ws.slice(theIdx + 1) : ws).filter((w) => !nounIndex.has(w) && !STOP.has(w));
    for (const w of descWords) {
      const fam = descKey(w) ?? (w.length >= 4 ? w : null);
      if (!fam) continue;
      for (const n of nouns) types.add(`${fam} ${n}`);
    }
  }
  // Proper names: capitalized words before "the" (or the first word when the
  // option is just "Vorrath & Kael") that aren't descriptors or nouns.
  const raws = name.split(/[\s,&]+/).filter(Boolean);
  const cut = raws.findIndex((w) => w.toLowerCase() === "the");
  const head = cut >= 0 ? raws.slice(0, cut) : raws.slice(0, 1);
  const names = head
    .map((w) => w.replace(/[^A-Za-z'-]/g, ""))
    .filter((w) => /^[A-Z]/.test(w) && w.length >= 4)
    .map((w) => w.toLowerCase())
    .filter((w) => !STOP.has(w) && !nounIndex.has(w) && !descIndex.has(w));
  return { types: [...types], names: [...new Set(names)] };
}

function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 5) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export interface MonthHistory {
  /** type key → times used in the window */
  types: Map<string, number>;
  names: Set<string>;
}

export function buildHistory(recentOptionNames: string[]): MonthHistory {
  const types = new Map<string, number>();
  const names = new Set<string>();
  for (const raw of recentOptionNames) {
    const k = optionKeys(raw);
    for (const t of k.types) types.set(t, (types.get(t) ?? 0) + 1);
    for (const n of k.names) names.add(n);
  }
  return { types, names };
}

/** Human-readable repeats in a draft's options; [] = all new this month. */
export function monthRepeats(optionNames: string[], history: MonthHistory): string[] {
  const out: string[] = [];
  for (const raw of optionNames) {
    const k = optionKeys(raw);
    const typeHit = k.types.find((t) => history.types.has(t));
    const nameHit = k.names.find((n) => [...history.names].some((h) => oneEditApart(n, h)));
    if (typeHit) out.push(`"${cleanName(raw)}" repeats a ${typeHit} already used this month`);
    else if (nameHit) out.push(`"${cleanName(raw)}" reuses the name ${nameHit[0].toUpperCase()}${nameHit.slice(1)} from this month`);
  }
  return out;
}

/** Prompt block: every type and name used in the last 30 days, banned. */
export function monthBanBlock(history: MonthHistory): string {
  if (history.types.size === 0 && history.names.size === 0) return "";
  const types = [...history.types.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (n > 1 ? `${t} (${n}x)` : t));
  const names = [...history.names].sort().map((n) => n[0].toUpperCase() + n.slice(1));
  return `BANNED FOR THIS MONTH (Keenan's rule: the same beast, dragon or weapon is never used twice in a month). This beats every example anywhere else, including the weekly brief.
Types already used in the last 30 days (an element or material + the creature, weapon or armor). Synonyms count as the same type: ice, glacier and rime are frost; ember, magma and inferno are fire; wyrm, drake and wyvern are dragons; blade and greatsword are swords.
${types.join(", ")}
Names already used (don't reuse them or a one-letter variant):
${names.join(", ")}
So: when the subject is dragons, weapons or armor, go past the usual elements. Build each option on a concept nobody has seen on this account this month (for example a clockwork dragon, a lantern wyrm, a salt-glass trident, a hive-queen helm). Never fall back on fire, frost, storm, shadow and celestial as a lineup.`;
}
