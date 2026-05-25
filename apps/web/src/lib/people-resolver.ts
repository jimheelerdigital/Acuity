/**
 * Person resolution + persistence — Slice 3 v1.2 Anchor People.
 *
 * Given a mentionText from the NER pass, decide whether it refers to
 * an existing Person for this user or warrants a new one. Resolution
 * order, cheapest-first:
 *
 *   1. Exact match against canonicalName (case-insensitive).
 *   2. Exact match against any alias (case-insensitive).
 *   3. Levenshtein distance ≤ MAX_EDIT_DISTANCE against canonicalName,
 *      with a minimum length to avoid 1-char "matches" against unrelated
 *      short names. Catches "Eri"→"Erin", "Eirn"→"Erin" typos in the
 *      Whisper transcription. NOT used for very short names.
 *   4. Substring match if the mention is ≥ 4 chars AND uniquely
 *      identifies one existing Person via prefix or contained-in
 *      (e.g. "Erin C." → "erin cunningham"). Ambiguous matches
 *      (more than one candidate) fall through to "new".
 *
 * Persistence:
 *   - On match → increment mentionCount + push the verbatim mentionText
 *     into aliases (deduped) so future mentions of the same variant
 *     short-circuit at step 2.
 *   - On miss → create a new Person with canonicalName = lowercase,
 *     displayName = preserved case, aliases = [mentionText],
 *     mentionCount = 1.
 *
 * Idempotency: this module is meant to run in a fail-soft step inside
 * process-entry. If a Prisma write throws (e.g. unique-constraint
 * violation from concurrent NER on the same user — rare but possible
 * if two entries process in parallel and detect the same new name),
 * the caller catches and logs; the user just loses one mention row.
 */

import type { PrismaClient } from "@prisma/client";

const MAX_EDIT_DISTANCE = 1;
const MIN_LEN_FOR_LEVENSHTEIN = 4;
const MIN_LEN_FOR_SUBSTRING = 4;

interface PersonRow {
  id: string;
  canonicalName: string;
  displayName: string;
  aliases: string[];
  mentionCount: number;
}

/**
 * Standalone Levenshtein. O(m*n) but m,n are small (name lengths,
 * typically < 25 chars) so it's fine to call per-candidate.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Pure resolver — given a mentionText and the user's existing Persons,
 * return the matching person id or null for "new". Exposed for unit
 * testing without a DB.
 */
export function resolvePersonId(
  mentionText: string,
  existing: PersonRow[]
): string | null {
  const norm = normalize(mentionText);
  if (!norm) return null;

  // 1. Exact canonicalName.
  for (const p of existing) {
    if (p.canonicalName === norm) return p.id;
  }
  // 2. Exact alias (case-insensitive against stored aliases).
  for (const p of existing) {
    for (const alias of p.aliases) {
      if (normalize(alias) === norm) return p.id;
    }
  }
  // 3. Levenshtein on canonicalName.
  if (norm.length >= MIN_LEN_FOR_LEVENSHTEIN) {
    let best: { id: string; dist: number } | null = null;
    for (const p of existing) {
      if (p.canonicalName.length < MIN_LEN_FOR_LEVENSHTEIN) continue;
      const d = levenshtein(norm, p.canonicalName);
      if (d <= MAX_EDIT_DISTANCE && (best === null || d < best.dist)) {
        best = { id: p.id, dist: d };
      }
    }
    if (best) return best.id;
  }
  // 4. Substring — only if uniquely identifying. Prefer the candidate
  // whose canonicalName starts with the normalized mention; fall back
  // to any contained-in match.
  if (norm.length >= MIN_LEN_FOR_SUBSTRING) {
    const prefixHits = existing.filter((p) =>
      p.canonicalName.startsWith(norm) || norm.startsWith(p.canonicalName)
    );
    if (prefixHits.length === 1) return prefixHits[0].id;
    const containsHits = existing.filter((p) =>
      p.canonicalName.includes(norm) || norm.includes(p.canonicalName)
    );
    if (containsHits.length === 1) return containsHits[0].id;
  }
  return null;
}

/**
 * Resolve OR create. Returns the Person id and a boolean "wasCreated".
 * Caller is responsible for writing EntityMentions; this function only
 * touches Person rows.
 *
 * mentionCount increments on every call (both match + create paths).
 * Aliases gain the verbatim mentionText (deduped) on the match path so
 * the next "Eirn" lookup short-circuits at step 2.
 */
export async function resolveOrCreatePerson(
  prisma: PrismaClient,
  userId: string,
  mentionText: string,
  existing: PersonRow[]
): Promise<{ personId: string; wasCreated: boolean }> {
  const id = resolvePersonId(mentionText, existing);
  if (id) {
    const target = existing.find((p) => p.id === id);
    const nextAliases =
      target && target.aliases.some((a) => normalize(a) === normalize(mentionText))
        ? target.aliases
        : [...(target?.aliases ?? []), mentionText];
    await prisma.person.update({
      where: { id },
      data: {
        mentionCount: { increment: 1 },
        aliases: nextAliases,
      },
    });
    if (target) {
      target.mentionCount += 1;
      target.aliases = nextAliases;
    }
    return { personId: id, wasCreated: false };
  }

  // New Person. The unique constraint on (userId, canonicalName) makes
  // this safe under concurrent NER racing on the same name — the loser
  // gets a P2002, we catch + retry the resolver path.
  const canonicalName = normalize(mentionText);
  const displayName = mentionText.trim();
  try {
    const created = await prisma.person.create({
      data: {
        userId,
        canonicalName,
        displayName,
        aliases: [mentionText],
        mentionCount: 1,
      },
      select: { id: true, canonicalName: true, displayName: true, aliases: true, mentionCount: true },
    });
    existing.push({
      id: created.id,
      canonicalName: created.canonicalName,
      displayName: created.displayName,
      aliases: created.aliases,
      mentionCount: created.mentionCount,
    });
    return { personId: created.id, wasCreated: true };
  } catch (err) {
    // Concurrent race lost — another inflight NER created the same
    // (userId, canonicalName) between our SELECT and INSERT. Re-fetch
    // and increment on the winning row.
    const existing2 = await prisma.person.findUnique({
      where: { userId_canonicalName: { userId, canonicalName } },
      select: { id: true, aliases: true },
    });
    if (existing2) {
      const nextAliases = existing2.aliases.some(
        (a) => normalize(a) === normalize(mentionText)
      )
        ? existing2.aliases
        : [...existing2.aliases, mentionText];
      await prisma.person.update({
        where: { id: existing2.id },
        data: {
          mentionCount: { increment: 1 },
          aliases: nextAliases,
        },
      });
      return { personId: existing2.id, wasCreated: false };
    }
    // Re-throw if it wasn't actually a unique-constraint race.
    throw err;
  }
}
