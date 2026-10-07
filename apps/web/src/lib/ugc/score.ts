/**
 * Scoring for UGC outreach. Two passes:
 *   1. Rough filter — Haiku 4.5 (cheapest configured model) on cheap-stage
 *      data only, 20 profiles per call. Keeps the top FINAL_SCORE_LIMIT.
 *   2. Final score — Opus 5.5 on the fully enriched profile, with cover
 *      frames of their recent videos. (Jev is a yes/no judge and can't
 *      score a rubric; it does the claims check on drafts instead.)
 *
 * The model assigns persona + creator type and scores fit / camera / proof;
 * "active" and the total are computed in code. Follower count is never
 * scored. Under MIN_SCORE is dropped.
 */
import type Anthropic from "@anthropic-ai/sdk";

import { callUgcModel, imageBlock, parseJsonReply } from "@/lib/ugc/ai";
import {
  CREATOR_TYPES,
  FINAL_MODEL,
  FINAL_SCORE_LIMIT,
  MIN_SCORE,
  PERSONAS,
  ROUGH_MODEL,
  personaSlots,
  type CreatorType,
  type Persona,
} from "@/lib/ugc/config";
import { candidateKey, type Candidate } from "@/lib/ugc/sources/types";

export const RUBRIC = { fit: 35, camera: 30, proof: 20, active: 15 } as const;
const ACTIVE_DAYS = 30;
const DAY = 86_400_000;

export function activePoints(lastPostAt: string | null | undefined, now = Date.now()): number {
  if (!lastPostAt) return 0;
  const t = Date.parse(lastPostAt);
  return Number.isFinite(t) && now - t <= ACTIVE_DAYS * DAY ? RUBRIC.active : 0;
}

const clamp = (n: unknown, max: number) =>
  Math.max(0, Math.min(max, Math.round(typeof n === "number" ? n : Number(n) || 0)));

function normPersona(p: unknown): Persona | undefined {
  return p === "midlife" || p === "ambitious" ? p : undefined;
}
function normType(t: unknown): CreatorType | undefined {
  return t === "credentialed" || t === "lookalike" || t === "productivity" ? t : undefined;
}

/** Productivity creators are ambitious-persona only. */
export function reconcileTypePersona(persona: Persona | undefined, type: CreatorType | undefined) {
  if (type && persona && !CREATOR_TYPES[type].personas.includes(persona)) {
    return { persona: CREATOR_TYPES[type].personas[0], creatorType: type };
  }
  return { persona, creatorType: type };
}

function personaBlock(): string {
  return [
    "PERSONAS (who the creator must look and sound like, or be trusted by):",
    ...Object.entries(PERSONAS).map(([k, v]) => `- ${k}: ${v.description}`),
    "CREATOR TYPES:",
    ...Object.entries(CREATOR_TYPES).map(
      ([k, v]) => `- ${k}: ${v.description} Personas: ${v.personas.join(", ")}.`
    ),
  ].join("\n");
}

const CONTEXT = `We are Ripple (an AI habit tracker, voice journal and insight tool). We BUY short videos from UGC creators and run them as ads from Ripple's own ad accounts. We are not paying anyone to post to their audience, so follower count does not matter at all. What matters: do they look and sound like our customer (or hold a credential that customer trusts), are they good on camera, and do they already do paid UGC work.`;

// ─── Pass 1: rough (Haiku) ─────────────────────────────────────────────────

function cheapSummary(c: Candidate): Record<string, unknown> {
  return {
    key: candidateKey(c),
    name: c.displayName ?? null,
    bio: (c.bio ?? "").slice(0, 300),
    captions: (c.sampleCaptions ?? []).slice(0, 3).map((s) => s.slice(0, 200)),
    foundVia: c.seenIn ?? [],
    hasEmail: !!c.email,
    hasPortfolio: !!c.portfolioUrl,
    saysUgc: !!c.mentionsUgc,
    listsRates: !!c.listsRates,
    credentials: c.credentials ?? null,
    notes: c.notes ?? null,
  };
}

export async function roughScoreBatch(batch: Candidate[]): Promise<{ costUsd: number }> {
  if (batch.length === 0) return { costUsd: 0 };
  const system = `${CONTEXT}\n\n${personaBlock()}\n\nFor each profile, guess the persona and creator type and give a rough 0-100 score for how promising they are as a paid UGC ad creator for Ripple (persona fit first, then signs of on-camera/UGC work). Profiles that are brands, shops, meme pages or clearly not a person on camera get under 20. Answer ONLY JSON: [{"key": "...", "persona": "midlife|ambitious", "creatorType": "credentialed|lookalike|productivity", "rough": 0-100}]`;
  const { text, costUsd } = await callUgcModel({
    purpose: "rough-score",
    model: ROUGH_MODEL,
    system,
    user: JSON.stringify(batch.map(cheapSummary)),
    maxTokens: 120 * batch.length + 200,
  });
  const rows = parseJsonReply<{ key: string; persona?: string; creatorType?: string; rough?: number }[]>(text);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const c of batch) {
    const r = byKey.get(candidateKey(c));
    if (!r) {
      c.roughScore = 0;
      continue;
    }
    const fixed = reconcileTypePersona(normPersona(r.persona), normType(r.creatorType));
    c.persona = fixed.persona;
    c.creatorType = fixed.creatorType;
    c.roughScore = clamp(r.rough, 100);
  }
  return { costUsd };
}

/** Top FINAL_SCORE_LIMIT by rough score; manual adds always go through. */
export function selectForFinal(cands: Candidate[], limit = FINAL_SCORE_LIMIT): Candidate[] {
  const manual = cands.filter((c) => c.source === "manual");
  const rest = cands
    .filter((c) => c.source !== "manual" && !c.dropped)
    .sort((a, b) => (b.roughScore ?? 0) - (a.roughScore ?? 0));
  return [...manual, ...rest.slice(0, Math.max(0, limit - manual.length))];
}

// ─── Pass 2: final (Opus 5.5) ──────────────────────────────────────────────

function fullSummary(c: Candidate): Record<string, unknown> {
  return {
    handle: `@${c.handle} (${c.platform})`,
    name: c.displayName ?? null,
    bio: c.bio ?? "",
    linkInBio: c.linkInBio ?? null,
    portfolio: c.portfolioUrl ?? null,
    saysUgc: !!c.mentionsUgc,
    listsRates: !!c.listsRates,
    credentials: c.credentials ?? null,
    avgViewsLast10: c.avgViews ?? null,
    keenansNotes: c.notes ?? null,
    recentVideos: (c.recentVideos ?? []).map((v) => ({
      caption: v.caption,
      transcript: v.transcript,
      postedAt: v.postedAt,
    })),
    otherCaptions: c.recentVideos?.length ? [] : (c.sampleCaptions ?? []),
  };
}

export async function finalScore(c: Candidate, now = Date.now()): Promise<{ costUsd: number }> {
  const frames = (
    await Promise.all((c.recentVideos ?? []).slice(0, 3).map((v) => imageBlock(v.thumbnailUrl)))
  ).filter((b): b is Anthropic.ImageBlockParam => !!b);

  const system = `${CONTEXT}

${personaBlock()}

Score this creator. First assign ONE persona and ONE creator type. Then score:
- fit (0-${RUBRIC.fit}): do they look and sound like the target customer for that persona, or hold a credential that customer trusts?
- camera (0-${RUBRIC.camera}): from the transcripts, captions and cover frames: a clear hook in the first 2 seconds, likely good audio, natural delivery talking to camera. No talking-head video evidence = low.
- proof (0-${RUBRIC.proof}): proof they do UGC work: portfolio, past brand videos, app demos, rates, "UGC" in bio.
Do NOT consider follower count or views as quality. Activity is scored separately; ignore it.
"reason": exactly two plain sentences a busy founder can skim: who they are and why they would or wouldn't make good Ripple ads. Mention one specific real detail from their content.
"detail": one short, specific, real detail from their content that a personal email could open with (a video topic, a line they said). Never invent one; null if nothing specific.
Answer ONLY JSON: {"persona": "...", "creatorType": "...", "fit": n, "camera": n, "proof": n, "reason": "...", "detail": "..."|null}`;

  const content: Exclude<Anthropic.MessageParam["content"], string> = [
    ...frames,
    { type: "text", text: JSON.stringify(fullSummary(c)) },
  ];
  const { text, costUsd } = await callUgcModel({
    purpose: "final-score",
    model: FINAL_MODEL,
    system,
    user: content,
    maxTokens: 700,
    effort: "low",
  });
  const r = parseJsonReply<{
    persona?: string;
    creatorType?: string;
    fit?: number;
    camera?: number;
    proof?: number;
    reason?: string;
    detail?: string | null;
  }>(text);
  const fixed = reconcileTypePersona(normPersona(r.persona) ?? c.persona, normType(r.creatorType) ?? c.creatorType);
  c.persona = fixed.persona ?? "midlife";
  c.creatorType = fixed.creatorType ?? "lookalike";
  const fit = clamp(r.fit, RUBRIC.fit);
  const camera = clamp(r.camera, RUBRIC.camera);
  const proof = clamp(r.proof, RUBRIC.proof);
  const active = activePoints(c.lastPostAt, now);
  c.score = fit + camera + proof + active;
  c.scoreReason = (r.reason ?? "").trim().slice(0, 500);
  c.scoreDetail = { fit, camera, proof, active, detail: r.detail ?? null, frames: frames.length };
  if (c.score < MIN_SCORE && c.source !== "manual") c.dropped = `score ${c.score} < ${MIN_SCORE}`;
  return { costUsd };
}

/**
 * This week's review queue: score ≥ MIN_SCORE, best first, filling each
 * persona's slots (PERSONA_SPLIT). A persona that comes up short leaves its
 * slots empty rather than letting the other persona take them, so the
 * split never drifts. Manual adds are queued outside the cap.
 */
export function pickQueue(cands: Candidate[], alreadyQueued: Record<Persona, number>, cap?: number): Candidate[] {
  const slots = personaSlots(cap);
  const manual = cands.filter((c) => c.source === "manual" && c.score != null && !c.dropped);
  const pool = cands
    .filter((c) => c.source !== "manual" && !c.dropped && (c.score ?? 0) >= MIN_SCORE)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const picked: Candidate[] = [];
  for (const persona of Object.keys(slots) as Persona[]) {
    const free = Math.max(0, slots[persona] - (alreadyQueued[persona] ?? 0));
    picked.push(...pool.filter((c) => c.persona === persona).slice(0, free));
  }
  return [...manual, ...picked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))];
}
