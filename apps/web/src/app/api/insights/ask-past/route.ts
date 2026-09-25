/**
 * POST /api/insights/ask-past
 *
 * Body: { question: string }
 *
 * Pipeline:
 *   1. Embed the question (OpenAI text-embedding-3-small)
 *   2. Load the user's embedded entries (summary+transcript)
 *   3. Cosine similarity → top K relevant entries
 *   4. Claude Opus 4.7 answers the question using those entries as
 *      citations. System prompt forbids making things up beyond the
 *      entries + forbids diagnostic/therapeutic language.
 *   5. Return { answer, citedEntries: [{id, createdAt, excerpt}] }
 *
 * Rate limit: 10 questions per user per day. Surfaced via the
 * response body's `remaining` field so the UI can show
 * "X questions left today".
 *
 * Caching: by (userId, lower-case question trim hash) for 1 hour,
 * in-memory. A Vercel serverless deploy won't share the cache across
 * functions; that's a feature, not a bug — the ttl is just a polite
 * debounce for rapid repeat clicks.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { CLAUDE_FLAGSHIP_MODEL, CLAUDE_FLAGSHIP_MAX_TOKENS } from "@acuity/shared";

import {
  retrieveRelevantEntries,
  buildContextBlock,
  toCitations,
  type RankedEntry,
} from "@/lib/journal-query";
import { gateFeatureFlag } from "@/lib/feature-flags";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { requireEntitlement } from "@/lib/paywall";
import { rateLimitedResponse, checkRateLimit, limiters } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Embedding + Claude Opus round-trip can hit 20-30s on a cold path.
// Give the handler headroom so we don't 504 mid-answer.
export const maxDuration = 60;

const TOP_K = 10;
const DAILY_LIMIT = 10;

const BodySchema = z.object({
  question: z.string().min(5).max(500),
});

// In-memory cache — expires after 1h. Vercel serverless may cold-
// boot, which is fine; the cache is a polite debounce on rapid
// repeat clicks, not a correctness layer.
type CacheEntry = { at: number; body: unknown };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000;

// Daily counter (resets at midnight UTC) — tracked in a separate
// Upstash key via the existing rate-limit infra. We define the
// limiter here because it's ask-specific and I don't want to clutter
// the shared limiters export with a feature-specific budget.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Ripple's introspection assistant. A user has asked a question about their own journal history. You will receive up to 10 of their past entries (summaries + dates). Your job is to answer the question using ONLY what's in those entries.

Rules:
- Second person (you / your). Warm, non-judgmental.
- Never diagnose, prescribe, or give therapeutic advice. You're helping them notice what they've said, not treating them.
- If the entries don't support a clear answer, say so plainly: "The entries I can see don't give a clear answer to that."
- Quote or paraphrase specific entries to ground your answer. Reference dates when useful ("back on March 15, you wrote...").
- Keep the answer short — 2-4 short paragraphs unless the question genuinely needs more.
- Do NOT speculate beyond the text. If the user asks about feelings they didn't describe, say that.
- Return plain text. No markdown headers, no bullet lists unless the user explicitly asked for a list.`;

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gated = await gateFeatureFlag(userId, "ask_your_past_self");
  if (gated) return gated;

  // AI = Pro. Ask draws on the Claude pipeline, so gate it on the same
  // entitlement as extraction/MCP (PRO + active TRIAL; not FREE/post-trial).
  // Returns 402 SUBSCRIPTION_REQUIRED on reject; the mobile screen maps that
  // to an upgrade nudge.
  const proGate = await requireEntitlement("canExtractEntries", userId);
  if (!proGate.ok) return proGate.response;

  // Daily cap — 10 questions per user per day via the askPast
  // limiter. Fail-open when Upstash isn't configured (local dev
  // without Redis still works — limiter evaluates to null).
  const askLimiter = limiters.askPast;
  if (askLimiter) {
    const check = await checkRateLimit(askLimiter, `user:${userId}`);
    if (!check.success) return rateLimitedResponse(check);
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const question = parsed.data.question.trim();
  const cacheKey = `${userId}:${createHash("sha256").update(question.toLowerCase()).digest("hex").slice(0, 16)}`;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json(hit.body);
  }

  // Retrieval via the shared journal query core (per-user scoped). Same
  // behavior as before — top-K semantic rank over the user's 500 most recent
  // COMPLETE, embedded entries — now reused by MCP + native Ask Yourself.
  let ranked: RankedEntry[] = [];
  let totalEmbedded = 0;
  try {
    const res = await retrieveRelevantEntries(userId, question, {
      topK: TOP_K,
      candidateLimit: 500,
    });
    ranked = res.ranked;
    totalEmbedded = res.totalEmbedded;
  } catch (err) {
    console.error("[ask-past] retrieval failed:", err);
    return NextResponse.json({ error: "EmbeddingFailed" }, { status: 503 });
  }

  if (totalEmbedded === 0) {
    return NextResponse.json(
      {
        answer:
          "Your journal history hasn't been indexed yet. Ask again after a few more entries (or tomorrow — we run the index nightly).",
        citedEntries: [],
      },
      { status: 200 }
    );
  }

  const contextBlock = buildContextBlock(ranked);

  let answer: string;
  try {
    const msg = await anthropic.messages.create({
      model: CLAUDE_FLAGSHIP_MODEL,
      max_tokens: CLAUDE_FLAGSHIP_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here are the most relevant entries from your journal:\n\n${contextBlock}\n\nQuestion: ${question}`,
        },
      ],
    });
    answer =
      msg.content[0]?.type === "text"
        ? msg.content[0].text.trim()
        : "";
    if (!answer) throw new Error("empty Claude response");
  } catch (err) {
    console.error("[ask-past] Claude failed:", err);
    return NextResponse.json({ error: "AnswerFailed" }, { status: 503 });
  }

  const result = {
    answer,
    citedEntries: toCitations(ranked),
    meta: {
      totalEmbeddedEntries: totalEmbedded,
    },
  };

  cache.set(cacheKey, { at: Date.now(), body: result });

  return NextResponse.json(result);
}
