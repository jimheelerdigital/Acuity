/**
 * Feature #3 Phase A — the "emerging patterns" early peek.
 *
 * A deliberately WEAK, hedged pattern surface that lives in the gap
 * before the full Theme Map unlocks, so Ripple starts noticing things
 * around entry 2-3 rather than going silent until entry 10.
 *
 * ── What this is not ─────────────────────────────────────────────────
 * It does NOT move the unlock ladder. `UNLOCK_THRESHOLD = 10` in
 * theme-map-client.tsx, `MIN_MENTIONS_FOR_PLANET`, and
 * `unlocked.themeMap` (entriesCount >= 10 && themesDetected >= 3) are all
 * untouched. This card renders only BEFORE that unlock and disappears the
 * moment the real map is available — the two never show at once.
 *
 * ── Why the framing is hedged ────────────────────────────────────────
 * A "pattern" drawn from two entries is barely evidence. Presenting it
 * with confidence would be the product asserting something it does not
 * know, which is the failure mode DESIGN_SYSTEM.md §7.1 ("observational,
 * not prescriptive") and §7.5 (falsifiable) exist to prevent. So the copy
 * concedes its own weakness — §7.1's "honest about what it isn't" — and
 * quotes no counts. A number ("seen 3 times") reads as precision the data
 * has not earned.
 *
 * ── Voice ────────────────────────────────────────────────────────────
 * Third person ("Ripple noticed"), matching every other product surface.
 * There is no first-person Ripple voice anywhere in the app today.
 */

/** One theme that has appeared in more than one entry. */
export interface EmergingTheme {
  /** Display label, as stored on Theme.name. */
  label: string;
  /** Distinct entries this theme appeared in. Never rendered — see below. */
  entryCount: number;
}

export interface EmergingPatternsInput {
  /** Total entries the user has recorded. */
  entriesCount: number;
  /** `progression.unlocked.themeMap` — the real ladder, read not written. */
  themeMapUnlocked: boolean;
  /**
   * Candidate themes with the number of DISTINCT entries each appeared
   * in. `ThemeMention` is `@@unique([themeId, entryId])`, so a group-by
   * count over it is already an entry count, not a mention count.
   */
  themes: EmergingTheme[];
}

/** Below this, one entry mentioning something twice would look like a pattern. */
export const MIN_ENTRIES_FOR_PEEK = 2;

/** A theme must appear in at least this many distinct entries to show. */
export const MIN_ENTRIES_PER_THEME = 2;

/** Never more than this — the peek is a hint, not a list. */
export const MAX_EMERGING_THEMES = 2;

/**
 * Decide what (if anything) the early peek should show.
 *
 * Returns `[]` for every "don't render" case, so the caller has a single
 * condition to check and there is no empty state to design. That is
 * deliberate: an empty "no patterns yet" card on a 2-entry account is a
 * nag wearing a data visualisation.
 */
export function selectEmergingThemes(
  input: EmergingPatternsInput
): EmergingTheme[] {
  const { entriesCount, themeMapUnlocked, themes } = input;

  // The real Theme Map is available — it replaces this entirely. Showing
  // both would present the same data twice at two confidence levels.
  if (themeMapUnlocked) return [];

  if (entriesCount < MIN_ENTRIES_FOR_PEEK) return [];

  return themes
    .filter((t) => t.entryCount >= MIN_ENTRIES_PER_THEME)
    .filter((t) => t.label.trim().length > 0)
    .sort((a, b) => b.entryCount - a.entryCount || a.label.localeCompare(b.label))
    .slice(0, MAX_EMERGING_THEMES);
}

/**
 * The hedged sentence shown under the themes.
 *
 * Deliberately quotes NO counts. "Seen 3 times" is a number-flex that
 * claims more certainty than two entries support, and it invites the user
 * to track the number rather than notice the thing.
 *
 * Returns null when there is nothing to say, mirroring `selectEmergingThemes`
 * returning `[]` — callers never render a fallback.
 */
/** Uppercase the first character only, leaving the rest untouched. */
function sentenceCase(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function emergingPatternsCopy(themes: EmergingTheme[]): string | null {
  const labels = themes.map((t) => t.label.trim()).filter(Boolean);

  if (labels.length === 0) return null;

  // Theme names are stored lowercase by `normalizeThemeName`, so a label
  // opening the sentence has to be sentence-cased or the copy reads like
  // a rendering bug. Only the FIRST character changes — "9-to-5" and
  // "self-care" must survive intact, and a mid-sentence label stays as
  // stored (theme labels are not proper nouns).
  const opener = sentenceCase(labels[0]);

  if (labels.length === 1) {
    return `${opener} has come up in more than one of your debriefs. It's early, so this might be nothing — but Ripple noticed.`;
  }

  return `${opener} and ${labels[1]} have each come up in more than one of your debriefs. It's early to call either one a pattern, but Ripple noticed both.`;
}
