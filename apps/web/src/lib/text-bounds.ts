import "server-only";

/**
 * Length caps for user-supplied text fields. Enforced at the API
 * layer to prevent DB-bloat / OOM-on-list-render attacks where an
 * attacker POSTs a 50MB string into Goal.description, Task.title, etc.
 *
 * The DB schema does not yet carry @db.VarChar caps — that's a
 * coordinated `prisma db push` change that needs to come from the
 * home-network shell. These limits make the route handlers
 * authoritative until then; once VarChar lands, these are still
 * useful as a friendlier 400 (vs. a Postgres-level rejection that
 * surfaces as a 500).
 *
 * Limits chosen to comfortably fit any real human-authored content:
 *   - title:        500  chars (~7-8 lines wrapped)
 *   - description: 2000  chars (~half a screen of prose)
 *   - notes:       5000  chars (longer reflection)
 *   - body/transcript: 50000 chars (worst-case voice transcript)
 */

export const TITLE_MAX = 500;
export const DESCRIPTION_MAX = 2_000;
export const NOTES_MAX = 5_000;
export const BODY_MAX = 50_000;

export class TextBoundsError extends Error {
  field: string;
  limit: number;
  constructor(field: string, limit: number) {
    super(`${field} exceeds maximum length (${limit})`);
    this.field = field;
    this.limit = limit;
  }
}

/**
 * Trim, then enforce an upper bound. Throws `TextBoundsError` if the
 * input exceeds the cap so callers can map to a specific 400 error
 * code rather than silently slicing (silent slicing = data loss the
 * user can't see, which is worse than a clear rejection).
 */
export function boundedText(
  raw: unknown,
  field: string,
  max: number
): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s.length > max) throw new TextBoundsError(field, max);
  return s;
}

/**
 * Like boundedText but null-passthrough — returns null when input is
 * null/undefined/empty after trim. For optional fields like
 * description/notes where the column is nullable.
 */
export function boundedTextOrNull(
  raw: unknown,
  field: string,
  max: number
): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length === 0) return null;
  if (s.length > max) throw new TextBoundsError(field, max);
  return s;
}
