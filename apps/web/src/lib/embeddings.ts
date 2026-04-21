/**
 * OpenAI embeddings helpers for the Ask-Your-Past-Self feature.
 *
 * Model: text-embedding-3-small (1536 dims, cheap, fine for
 * journal-scale semantic retrieval).
 *
 * The similarity path runs pure JS cosine — no pgvector index. At
 * 10k entries × 1536 floats × 4 bytes = ~60MB read, well under
 * serverless memory limits. We promote to pgvector if a user's
 * entry count ever approaches that ceiling.
 */

import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

let cachedClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return cachedClient;
}

/**
 * Build the text we embed. Summary is most semantic-dense; fall
 * back to transcript if summary is missing. Never embed a blank
 * string (OpenAI rejects it) — return null and let the caller skip.
 */
export function buildEmbedText(entry: {
  summary: string | null;
  transcript: string | null;
}): string | null {
  const parts = [entry.summary, entry.transcript]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  if (parts.length === 0) return null;
  // Cap to ~6000 chars so the token budget stays predictable. Journal
  // entries are rarely longer; truncation is a long-tail safety net.
  const joined = parts.join("\n\n");
  return joined.length > 6000 ? joined.slice(0, 6000) : joined;
}

/**
 * Embed a single string. Returns the 1536-dim vector or throws on
 * OpenAI errors. Callers should catch + mark the entry as embed-
 * pending-retry rather than failing the whole pipeline.
 */
export async function embedText(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  const vector = res.data[0]?.embedding;
  if (!vector || vector.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Unexpected embedding shape: ${vector?.length ?? "empty"} dims`
    );
  }
  return vector;
}

/**
 * Cosine similarity for pre-normalized vectors. OpenAI's embeddings
 * are NOT normalized by default; we normalize once at query time
 * (below) so ranking math is dot-product only.
 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }
  const denom = Math.sqrt(aMag) * Math.sqrt(bMag);
  return denom === 0 ? 0 : dot / denom;
}
