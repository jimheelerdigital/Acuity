/**
 * Theme identity + persistence utilities for the Theme Evolution Map.
 *
 * Split from the extraction pipeline so both the async Inngest path
 * and the backfill script can share one canonicalization + upsert
 * implementation. Intentionally small: a normalization function, an
 * upsert for Theme, and an upsert for ThemeMention. Business rules
 * (which themes to display in the graph, how to aggregate) live at
 * the API layer.
 */

import type { Prisma, PrismaClient, Theme, ThemeMention } from "@prisma/client";

export type ThemeSentiment = "POSITIVE" | "NEUTRAL" | "NEGATIVE";

// Suffix-rule stemmer. Intentionally tiny — no Porter, no library.
// Rules are (suffix, root) pairs applied in order; first match wins.
// Conservative: we only strip if the remainder is clearly a word. The
// table can grow when the user-facing "duplicate themes" reports show
// specific pairs worth unifying.
// Only the narrow, unambiguous plural patterns — "-es after a hissing
// consonant" and "-ies → -y". The general "-s → (nothing)" rule is
// intentionally NOT here because distinguishing "runs" (plural) from
// "focus" / "bus" / "lens" / "process" (singular) requires either a
// stopword list or a real stemmer, and the wrong calls are user-
// visible theme labels. We trade a small bit of "goals" vs "goal"
// duplication for not hallucinating singulars. If users report duping
// pairs we can add targeted rules later.
const PLURAL_RULES: Array<[RegExp, string]> = [
  // "stresses" → "stress", "businesses" → "business", "boxes" → "box"
  [/(ch|sh|ss|s|x|z)es$/, "$1"],
  // "studies" → "study", "worries" → "worry"
  [/ies$/, "y"],
];

/**
 * Normalize a raw theme label into its canonical identity key.
 *
 *   "  Stress  " → "stress"
 *   "stresses"   → "stress"
 *   "Studies "   → "study"
 *   "'running,"  → "running" (punctuation trim; plural stemmer leaves
 *                   gerunds alone — we only strip trailing -s/-ies)
 *
 * Returns "" for inputs that canonicalize to empty — callers should
 * drop those rather than persisting an empty-name Theme row.
 */
export function normalizeThemeName(raw: string): string {
  if (typeof raw !== "string") return "";

  let s = raw.toLowerCase();

  // Strip leading/trailing punctuation but preserve inner characters
  // (so "self-care" and "9-to-5" keep their structure).
  s = s.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");

  // Collapse any whitespace runs to a single space.
  s = s.replace(/\s+/g, " ").trim();

  if (!s) return "";

  // Apply plural rules to the last word only — a two-word theme like
  // "career goals" stems to "career goal", not "career goa l".
  const parts = s.split(" ");
  const last = parts[parts.length - 1];
  for (const [pattern, replacement] of PLURAL_RULES) {
    if (pattern.test(last)) {
      parts[parts.length - 1] = last.replace(pattern, replacement);
      break;
    }
  }

  return parts.join(" ");
}

/**
 * Coerce any sentiment string into the 3-value enum. Unknown values
 * fall through to NEUTRAL so a malformed Claude response doesn't
 * reject the entire extraction.
 */
export function coerceSentiment(raw: unknown): ThemeSentiment {
  if (typeof raw !== "string") return "NEUTRAL";
  const upper = raw.trim().toUpperCase();
  if (upper === "POSITIVE" || upper === "POS") return "POSITIVE";
  if (upper === "NEGATIVE" || upper === "NEG") return "NEGATIVE";
  return "NEUTRAL";
}

/**
 * Upsert a Theme for this user. Idempotent — the (userId, name)
 * unique constraint guarantees a stable id across re-extractions.
 *
 * Accepts either a Prisma client or a Prisma transaction so callers
 * inside the extraction pipeline can include the upsert in their
 * own transaction without nesting.
 */
export async function upsertTheme(
  tx: PrismaClient | Prisma.TransactionClient,
  userId: string,
  rawName: string
): Promise<Theme | null> {
  const name = normalizeThemeName(rawName);
  if (!name) return null;
  return tx.theme.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name },
    update: {},
  });
}

/**
 * Idempotent mention upsert. Uses the (themeId, entryId) unique key
 * so a re-run of extraction (or the backfill) is a no-op. Sentiment
 * coerces through coerceSentiment; createdAt is denormalized from
 * the caller's Entry so time-window queries don't need a join.
 */
export async function recordMention(
  tx: PrismaClient | Prisma.TransactionClient,
  themeId: string,
  entryId: string,
  sentiment: ThemeSentiment,
  createdAt: Date
): Promise<ThemeMention> {
  return tx.themeMention.upsert({
    where: { themeId_entryId: { themeId, entryId } },
    create: { themeId, entryId, sentiment, createdAt },
    // On re-run, refresh sentiment + createdAt. Refreshing createdAt
    // lets a backfill that runs after a timezone clock drift correct
    // earlier records without a second pass.
    update: { sentiment, createdAt },
  });
}

/**
 * Batch helper used by the extraction pipeline — takes the array of
 * themes parsed from Claude (either the new { label, sentiment } shape
 * or the legacy string[] shape) and records upserts for each. Returns
 * the count of mentions actually written; skipped empties do not count.
 */
export async function recordThemesFromExtraction(
  tx: PrismaClient | Prisma.TransactionClient,
  userId: string,
  entryId: string,
  entryCreatedAt: Date,
  themes: unknown
): Promise<number> {
  if (!Array.isArray(themes)) return 0;
  let written = 0;
  for (const raw of themes) {
    let label: string;
    let sentiment: ThemeSentiment;
    if (typeof raw === "string") {
      label = raw;
      sentiment = "NEUTRAL";
    } else if (raw && typeof raw === "object") {
      const r = raw as { label?: unknown; sentiment?: unknown };
      if (typeof r.label !== "string") continue;
      label = r.label;
      sentiment = coerceSentiment(r.sentiment);
    } else {
      continue;
    }
    const theme = await upsertTheme(tx, userId, label);
    if (!theme) continue;
    await recordMention(tx, theme.id, entryId, sentiment, entryCreatedAt);
    written += 1;
  }
  return written;
}
