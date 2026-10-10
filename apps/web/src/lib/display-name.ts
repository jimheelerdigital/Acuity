/**
 * Validation for a user-entered display name (the first name the welcome
 * flow asks for when the web funnel never captured one). Pure, for tests.
 *
 * Returns the cleaned name, or null when it is not acceptable. Deliberately
 * permissive about WHAT a name is (any script, apostrophes, hyphens): the
 * only goals are no blank names, no runaway pastes, no control characters.
 */
export const DISPLAY_NAME_MAX = 50;

export function cleanDisplayName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // Strip control characters, collapse internal whitespace, trim.
  const cleaned = raw
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > DISPLAY_NAME_MAX) return null;
  return cleaned;
}
