/**
 * Shared types for the Phase E orbital cosmos Theme Map. Local to the
 * insights/_theme-map private directory; not re-exported.
 */

export interface OrbitalTheme {
  id: string;
  name: string;
  /** Canonical hue (0-359) derived from the theme name. See
   *  `hueForTheme()` below. */
  hue: number;
  mentionCount: number;
  sentimentBand: "positive" | "neutral" | "challenging";
  coOccurrences: Array<{ themeName: string; count: number }>;
  /** Latest entry's excerpt for the callout — null when the API
   *  hasn't returned any recent entries for this theme. */
  excerpt: string | null;
}

/**
 * Canonical hue table — 9 well-known themes the design pre-positioned
 * with specific hue values. When the API returns one of these by name
 * (case-insensitive), we use the matched hue; otherwise we hash the
 * name to a stable hue. Deterministic so a given theme name always
 * renders the same color.
 */
const CANONICAL_HUES: Record<string, number> = {
  career: 295,
  family: 25,
  health: 165,
  avoidance: 60,
  money: 115,
  relationships: 345,
  sleep: 235,
  growth: 195,
  solitude: 275,
};

export function hueForTheme(name: string): number {
  const key = name.toLowerCase().trim();
  if (CANONICAL_HUES[key] !== undefined) return CANONICAL_HUES[key];
  // FNV-1a 32-bit hash → mod 360. Stable + cheap, gives reasonable
  // hue distribution for unknown theme names.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % 360;
}
