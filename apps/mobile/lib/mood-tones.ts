import type { Mood } from "@acuity/shared";

import type { AcuityTokens } from "@/lib/theme/tokens";

/**
 * moodToneColor — resolves a Mood enum to a palette-aware color.
 *
 * Lifted out of apps/mobile/app/(tabs)/insights.tsx (Q11 Phase C.2,
 * 2026-05-21) so other mobile surfaces that surface mood-tinted
 * accents (entries list filter pills, theme-map mood wave, mention
 * cards) can resolve through the same shape. Previously each call
 * site that needed a mood color either inlined a 5-key hex map or
 * imported MOOD_COLORS from insights.tsx.
 *
 * Mapping rationale (mood → tone):
 *   GREAT   → tokens.good (vibrant mint)
 *   GOOD    → tokens.good (same mint; visual diff carried by label /
 *             icon, not color)
 *   NEUTRAL → tokens.textTer (quiet grey)
 *   LOW     → "#FBBF24" amber. Palette has no warning-amber token;
 *             same convention as ON_HOLD goals (Q11c-1), Q11a-2 auth
 *             dev warning, Q8 confetti accents.
 *   ROUGH   → tokens.bad (red ember)
 *
 * The previous hardcoded MOOD_COLORS palette differentiated GREAT
 * (#22C55E) from GOOD (#86EFAC). The two now collapse to the same
 * mint accent because palette-aware tokens don't ship two shades of
 * green; if differentiated mood tints become a product need, add
 * goodHi / goodLo tokens in tokens.ts rather than re-introducing
 * hardcoded hex.
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
