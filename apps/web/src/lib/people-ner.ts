/**
 * Named-person NER for entry transcripts. Slice 2 v1.2 Anchor People.
 *
 * Claude Haiku is cheap enough to run on every PRO/TRIAL entry
 * (~$0.0005 per entry). We ask it for an array of detected names +
 * the verbatim mention text + a short context snippet. We do NOT
 * trust Claude to return correct start/end character positions —
 * Claude's character-counting on long inputs is unreliable. Instead
 * we take the mention text + snippet, scan the transcript with
 * `indexOf`, and compute positions ourselves. The snippet is the
 * disambiguator when the same mentionText appears multiple times
 * ("Erin" in two sentences far apart).
 *
 * Constraints:
 *   - Named people only ("Erin", "Mike Johnson"). Role references
 *     ("my boss", "the kids") are filtered server-side — slice 1
 *     defers role/pronoun resolution to v2.
 *   - MAX_MENTIONS_PER_ENTRY cap on output so a runaway mention-
 *     heavy entry can't blow up the prompt cost or DB row count.
 *   - Empty/short transcripts (< 30 chars) skip Haiku entirely.
 */

import Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_HAIKU_MODEL } from "@acuity/shared";

export const MAX_MENTIONS_PER_ENTRY = 20;
const MIN_TRANSCRIPT_CHARS = 30;
const CONTEXT_WINDOW = 50; // chars before + after for the persisted EntityMention.context

const SYSTEM_PROMPT = `You are an entity extractor for a personal journal app. Identify all NAMED PEOPLE mentioned in the entry — proper names like "Erin", "Mike Johnson", "Dr. Chen". Do NOT include role references like "my boss", "the kids", "my therapist", "Mom" (unless used as the proper name itself — "Mom" alone is ambiguous; we treat it as a role and skip it). Do NOT include pronouns.

Return a JSON object: { "people": [{ "name": "the person's name as-mentioned", "contextSnippet": "the short surrounding phrase" }, ...] }

Rules:
- Each occurrence is a separate entry — if "Erin" is mentioned twice in different sentences, return two objects.
- Preserve the case of the name as it appears in the text. Do not normalize.
- The contextSnippet should be 20-80 characters of the surrounding sentence, enough to disambiguate the position. Do not paraphrase.
- If no named people appear, return { "people": [] }.
- Maximum ${MAX_MENTIONS_PER_ENTRY} entries.

Return ONLY the JSON object — no prose, no markdown fences.`;

export interface NerCandidate {
  name: string;
  contextSnippet: string;
}

export interface ResolvedMention {
  mentionText: string; // verbatim as it appeared
  startIndex: number;
  endIndex: number;
  context: string; // CONTEXT_WINDOW chars before + after, clipped to transcript bounds
}

let cachedAnthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!cachedAnthropic) {
    cachedAnthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30_000,
    });
  }
  return cachedAnthropic;
}

/**
 * Call Haiku, parse the JSON response, return the candidate array.
 * Returns [] on parse failure (logged by caller) — we never throw
 * from this layer because NER is fail-soft in the pipeline.
 */
export async function detectNamedPeople(
  transcript: string
): Promise<NerCandidate[]> {
  if (!transcript || transcript.length < MIN_TRANSCRIPT_CHARS) return [];

  const msg = await anthropic().messages.create({
    model: CLAUDE_HAIKU_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: transcript }],
  });

  const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];

  const out: NerCandidate[] = [];
  for (const p of people) {
    if (typeof p !== "object" || p === null) continue;
    const obj = p as { name?: unknown; contextSnippet?: unknown };
    if (typeof obj.name !== "string" || obj.name.trim().length === 0) continue;
    const snippet =
      typeof obj.contextSnippet === "string" ? obj.contextSnippet : "";
    out.push({ name: obj.name.trim(), contextSnippet: snippet.trim() });
    if (out.length >= MAX_MENTIONS_PER_ENTRY) break;
  }
  return out;
}

/**
 * Locate each NerCandidate inside the transcript by string search,
 * disambiguated via the contextSnippet when the name appears
 * multiple times. Each detected occurrence becomes one
 * ResolvedMention with a properly-sized context window.
 *
 * Why we don't trust Claude positions: Haiku's character counts on
 * inputs of more than a few hundred characters drift by 5-20 chars
 * routinely. indexOf() on the actual string is cheap + correct.
 */
export function locateMentions(
  transcript: string,
  candidates: NerCandidate[]
): ResolvedMention[] {
  const resolved: ResolvedMention[] = [];
  // Group by name so we can walk each name's occurrences in order
  // and pair them with the candidate ordering Claude returned.
  const byName = new Map<string, NerCandidate[]>();
  for (const c of candidates) {
    const list = byName.get(c.name) ?? [];
    list.push(c);
    byName.set(c.name, list);
  }

  for (const [name, group] of byName.entries()) {
    if (!name) continue;
    // Find every occurrence of this name in the transcript.
    const positions: number[] = [];
    let from = 0;
    while (from < transcript.length) {
      const idx = transcript.indexOf(name, from);
      if (idx === -1) break;
      positions.push(idx);
      from = idx + name.length;
    }
    if (positions.length === 0) continue;

    // If Claude returned exactly as many candidates as we found
    // positions, zip them in order. Otherwise, for each candidate
    // pick the position whose context-window best contains the
    // snippet (substring), falling back to the unused position
    // closest to the start if no snippet match.
    const usedPositions = new Set<number>();
    for (const c of group) {
      let best = -1;
      if (c.contextSnippet) {
        for (const pos of positions) {
          if (usedPositions.has(pos)) continue;
          const winStart = Math.max(0, pos - CONTEXT_WINDOW);
          const winEnd = Math.min(transcript.length, pos + name.length + CONTEXT_WINDOW);
          const window = transcript.slice(winStart, winEnd);
          if (window.includes(c.contextSnippet)) {
            best = pos;
            break;
          }
        }
      }
      if (best === -1) {
        for (const pos of positions) {
          if (!usedPositions.has(pos)) {
            best = pos;
            break;
          }
        }
      }
      if (best === -1) continue;
      usedPositions.add(best);
      const ctxStart = Math.max(0, best - CONTEXT_WINDOW);
      const ctxEnd = Math.min(transcript.length, best + name.length + CONTEXT_WINDOW);
      resolved.push({
        mentionText: name,
        startIndex: best,
        endIndex: best + name.length,
        context: transcript.slice(ctxStart, ctxEnd),
      });
    }
  }

  // Stable order by position so EntityMention rows read top-to-bottom
  // of the transcript when shown.
  resolved.sort((a, b) => a.startIndex - b.startIndex);
  return resolved;
}
