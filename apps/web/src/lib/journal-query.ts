/**
 * Shared journal query/context core (Ripple 1.8).
 *
 * The one place that turns a user + a natural-language query into the most
 * relevant slice of their journal. Extracted from
 * `api/insights/ask-past/route.ts` so every AI surface consumes ONE secured
 * retrieval layer:
 *   - Ask Yourself (web + the new native mobile screen)
 *   - the Ripple MCP server (bring-your-own-AI)
 *   - the first-party synthesis engine (2.0)
 *
 * SECURITY INVARIANT: every query here is scoped to `userId`. Callers own auth,
 * feature-gating, and rate-limiting; this module never trusts a caller to have
 * done the scoping — it always applies `where: { userId }` itself. The MCP
 * server's per-user isolation rests entirely on this.
 *
 * Surface-agnostic: no HTTP, no NextResponse, no auth. Pure retrieval + format.
 */

import { cosine, embedText } from "@/lib/embeddings";

export interface RankedEntry {
  id: string;
  createdAt: Date;
  summary: string | null;
  transcript: string | null;
  /** Cosine similarity to the query (0–1). */
  score: number;
}

export interface RetrieveResult {
  /** Top-scoring entries, most relevant first. */
  ranked: RankedEntry[];
  /** How many COMPLETE, embedded entries the user has (for empty-state + meta). */
  totalEmbedded: number;
}

export interface RetrieveOptions {
  /** How many entries to return. Default 10. */
  topK?: number;
  /** Most-recent N entries considered for ranking (cost cap). Default 500. */
  candidateLimit?: number;
}

/**
 * Retrieve the user's most semantically relevant COMPLETE entries for a query.
 * Always scoped to `userId`. Returns `totalEmbedded: 0` (and empty `ranked`)
 * when the user has no embedded entries yet — the caller decides the copy.
 *
 * Throws if the query embedding call fails (OpenAI). Callers that surface this
 * to a user should map it to a retryable error.
 */
export async function retrieveRelevantEntries(
  userId: string,
  query: string,
  opts: RetrieveOptions = {}
): Promise<RetrieveResult> {
  const topK = opts.topK ?? 10;
  const candidateLimit = opts.candidateLimit ?? 500;

  const { prisma } = await import("@/lib/prisma");

  // Per-user scoped. Only COMPLETE entries; minimal fields for ranking +
  // citation rendering. Newest-first, hard-capped for per-user ranking cost.
  const entries = await prisma.entry.findMany({
    where: { userId, status: "COMPLETE" },
    select: {
      id: true,
      createdAt: true,
      summary: true,
      transcript: true,
      embedding: true,
    },
    orderBy: { createdAt: "desc" },
    take: candidateLimit,
  });

  const embedded = entries.filter(
    (e) => Array.isArray(e.embedding) && e.embedding.length > 0
  );
  if (embedded.length === 0) return { ranked: [], totalEmbedded: 0 };

  const queryVec = await embedText(query);

  const ranked = embedded
    .map((e) => ({
      id: e.id,
      createdAt: e.createdAt,
      summary: e.summary,
      transcript: e.transcript,
      score: cosine(queryVec, e.embedding as number[]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return { ranked, totalEmbedded: embedded.length };
}

/** Preferred entry text for context/citation: summary, else transcript, else "". */
function entryText(e: Pick<RankedEntry, "summary" | "transcript">): string {
  return e.summary ?? e.transcript ?? "";
}

/**
 * Format ranked entries as a dated context block for an LLM prompt.
 * `[YYYY-MM-DD] excerpt` per line, excerpts capped (default 400 chars).
 */
export function buildContextBlock(
  ranked: RankedEntry[],
  opts: { maxCharsPerEntry?: number } = {}
): string {
  const max = opts.maxCharsPerEntry ?? 400;
  return ranked
    .map((r) => {
      const date = r.createdAt.toISOString().slice(0, 10);
      const text = entryText(r);
      const excerpt = text.length > max ? `${text.slice(0, max)}…` : text;
      return `[${date}] ${excerpt}`;
    })
    .join("\n\n");
}

export interface Citation {
  id: string;
  createdAt: string;
  excerpt: string;
  score: number;
}

/**
 * Format ranked entries as user-facing citations (id + ISO date + short
 * excerpt + rounded score). Default excerpt cap 200 chars.
 */
export function toCitations(
  ranked: RankedEntry[],
  opts: { maxChars?: number } = {}
): Citation[] {
  const max = opts.maxChars ?? 200;
  return ranked.map((r) => {
    const raw = entryText(r);
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      excerpt: raw.length > max ? `${raw.slice(0, max)}…` : raw,
      score: Number(r.score.toFixed(3)),
    };
  });
}
