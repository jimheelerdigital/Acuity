import type { Mood, Priority } from "@acuity/shared";

import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * Semantic tone names used across the per-key tone resolvers.
 * Each tone maps to a palette token (or the canonical amber
 * warning hex). Keeps the key-to-color mapping logic centralized.
 */
export type StatusTone = "muted" | "good" | "warning" | "accent" | "quiet";

/**
 * Resolves a semantic tone to a palette-aware color.
 *
 * Used internally by per-key resolvers (statusToneColor, etc.) but
 * also exposed for ad-hoc surface tinting where a tone is the right
 * abstraction (e.g. a custom card that needs to flip between
 * positive/warning/negative based on app state).
 *
 *   muted   → tokens.textTer (quiet grey)
 *   good    → tokens.good (mint)
 *   warning → "#FBBF24" amber (non-palette warning, see file
 *             header for the exception convention)
 *   accent  → tokens.primary (palette accent)
 *   quiet   → tokens.textQuiet (very subdued grey)
 */
export function toneColor(tone: StatusTone, tokens: AcuityTokens): string {
  switch (tone) {
    case "good":
      return tokens.good;
    case "accent":
      return tokens.primary;
    case "warning":
      return "#FBBF24";
    case "quiet":
      return tokens.textQuiet;
    case "muted":
    default:
      return tokens.textTer;
  }
}

/**
 * Resolves a goal status enum to a palette-aware color.
 *
 * Mapping (status → tone):
 *   NOT_STARTED → muted   (quiet grey)
 *   IN_PROGRESS → good    (mint)
 *   ON_HOLD     → warning (amber)
 *   COMPLETE    → accent  (palette primary)
 *   ARCHIVED    → quiet   (subdued grey)
 *
 * Lifted from apps/mobile/app/(tabs)/goals.tsx (Q11 Phase D.1,
 * 2026-05-21) so the goal detail screen (app/goal/[id].tsx) and
 * any other surface that surfaces goal-status accents can resolve
 * through the same shape. The local STATUS_STYLES constant in
 * goals.tsx still owns the label strings; this helper just gives
 * the color half.
 */
export function statusToneColor(
  status: string | null | undefined,
  tokens: AcuityTokens
): string {
  switch (status) {
    case "IN_PROGRESS":
      return toneColor("good", tokens);
    case "ON_HOLD":
      return toneColor("warning", tokens);
    case "COMPLETE":
      return toneColor("accent", tokens);
    case "ARCHIVED":
      return toneColor("quiet", tokens);
    case "NOT_STARTED":
    default:
      return toneColor("muted", tokens);
  }
}

/**
 * tone-colors — palette-aware resolution of per-key data colors
 * (moods, priorities, etc.) to theme tokens.
 *
 * Each helper takes a key + the current `tokens` object and returns
 * a hex string. The helpers replace hardcoded per-key hex tables
 * (MOOD_COLORS, PRIORITY_COLOR) that previously lived inline in
 * individual screens. Centralizing the mapping here means a single
 * file controls how mood/priority/status semantics translate to
 * palette colors across all four palettes (Coral / Sunset / Citrus
 * / Cobalt) in both light and dark mode.
 *
 * Conventions:
 *   - Semantic positive states (good moods, IN_PROGRESS goals,
 *     completed tasks) → tokens.good (mint).
 *   - Semantic warning states (LOW mood, ON_HOLD goals, HIGH-but-
 *     not-URGENT priority) → "#FBBF24" amber. Palette has no
 *     warning-amber token; this is the canonical exception that
 *     also covers Q8 confetti accents, Q11a-2 auth dev warning,
 *     Q11c-1 ON_HOLD goal status.
 *   - Semantic negative states (ROUGH mood, URGENT priority) →
 *     tokens.bad (red ember).
 *   - Neutral / quiet states → tokens.textTer.
 *
 * Renamed from lib/mood-tones.ts in Q11 Phase C.3 (2026-05-21) when
 * priorityToneColor joined moodToneColor in this file. If a
 * statusToneColor lift-out from goals.tsx happens later, it lands
 * here too.
 */

/**
 * Resolves a Mood enum to a palette-aware color.
 *
 * Mapping (mood → tone):
 *   GREAT   → tokens.good (vibrant mint)
 *   GOOD    → tokens.good (same mint; visual diff carried by label /
 *             icon, not color)
 *   NEUTRAL → tokens.textTer (quiet grey)
 *   LOW     → "#FBBF24" amber (non-palette warning)
 *   ROUGH   → tokens.bad (red ember)
 *
 * The previous hardcoded MOOD_COLORS palette differentiated GREAT
 * (#22C55E) from GOOD (#86EFAC). The two collapse to the same mint
 * here because palette-aware tokens don't ship two shades of green;
 * if differentiated mood tints become a product need, add goodHi /
 * goodLo tokens in tokens.ts rather than re-introducing hardcoded
 * hex.
 */
export function moodToneColor(
  mood: Mood | string | null | undefined,
  tokens: AcuityTokens
): string {
  switch (mood) {
    case "GREAT":
    case "GOOD":
      return tokens.good;
    case "LOW":
      return "#FBBF24";
    case "ROUGH":
      return tokens.bad;
    case "NEUTRAL":
    default:
      return tokens.textTer;
  }
}

/**
 * Resolves a Priority enum to a palette-aware color.
 *
 * Mapping (priority → tone):
 *   LOW     → tokens.textTer (quiet grey — was slate-400)
 *   MEDIUM  → tokens.textSec (informational neutral — was sky-400;
 *             collapses to a secondary text grey since palette has
 *             no "info blue" token. Visual differentiation between
 *             LOW and MEDIUM is now carried by the textTer/textSec
 *             contrast rather than a distinct hue.)
 *   HIGH    → "#FBBF24" amber (warning, same as LOW mood)
 *   URGENT  → tokens.bad (red ember)
 *
 * The previous hardcoded PRIORITY_COLOR table in @acuity/shared
 * (LOW=#94A3B8 slate, MEDIUM=#60A5FA sky, HIGH=#F59E0B amber,
 * URGENT=#EF4444 red) included a sky-blue MEDIUM hue that has no
 * palette equivalent. Collapsing MEDIUM into textSec means MEDIUM
 * tasks no longer have a distinct "informational" tint on mobile;
 * they read as a slightly louder LOW. Acceptable since priority is
 * a secondary signal on the task row (the row is dominated by
 * title + group + done state).
 */
export function priorityToneColor(
  priority: Priority | string | null | undefined,
  tokens: AcuityTokens
): string {
  switch (priority) {
    case "URGENT":
      return tokens.bad;
    case "HIGH":
      return "#FBBF24";
    case "MEDIUM":
      return tokens.textSec;
    case "LOW":
    default:
      return tokens.textTer;
  }
}
