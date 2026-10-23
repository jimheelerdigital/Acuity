import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One model for every piece of content-factory copy (2026-09-26, per
 * Keenan: "start writing in claude opus 5.5 ... then rewrite that makes
 * the copy sound human, and turn the research into topics. use opus 5.5
 * for everything script oriented"). Slide copy, the humanizer rewrite,
 * captions, research distillation, scripts, lane reports and the image
 * checks all go through contentAnthropic below, so the model is set in
 * exactly one place. CONTENT_CLAUDE_MODEL overrides it without a deploy.
 * Since 2026-09-28 the writing model is Sonnet 5.5 and the image checks
 * pass model: VISION_MODEL (Opus 5.5).
 *
 * Opus 5.5 / Sonnet 5.5 differ from the Sonnet 4.6 / Opus 4.6 calls this replaced:
 * - thinking is always on and its tokens count toward max_tokens, so the
 *   wrapper adds headroom on top of each caller's answer budget;
 * - effort (low / medium / high) is the only depth control;
 * - responses can open with thinking blocks — read text blocks by type
 *   (messageText), never content[0];
 * - temperature / top_p / top_k are rejected, so they're stripped.
 */
// 2026-09-28 (per Keenan: "change script writing to sonnet 5.5 across all
// script writing"): Sonnet 5.5, released that day — $2/$10 per MTok, half
// of Opus 5.5 and faster. Same request surface as Opus 5.5 for these calls
// (adaptive thinking on by default, no sampling params, effort explicit).
export const CONTENT_MODEL = (process.env.CONTENT_CLAUDE_MODEL || "claude-sonnet-5-5").trim();
/**
 * The image checks (checkMoodyImageQuality, verifyBakedQuote) stay on Opus
 * 5.5 — judging an image isn't script writing, and Opus is the stronger
 * judge of CGI looks and garbled detail.
 */
export const VISION_MODEL = (process.env.CONTENT_VISION_MODEL || "claude-opus-5-5").trim();

/** Previous generation of the same tier, if a model is unavailable or declines. */
function fallbackFor(model: string): string | null {
  if (model.startsWith("claude-sonnet-5-5")) return "claude-sonnet-5";
  if (model.startsWith("claude-opus-5-5")) return "claude-opus-5";
  return null;
}

// Sonnet 5.5 pricing: $2/M input, $10/M output.
export const CONTENT_INPUT_COST_PER_TOKEN = 2 / 1_000_000;
export const CONTENT_OUTPUT_COST_PER_TOKEN = 10 / 1_000_000;

export type ContentEffort = "low" | "medium" | "high";

/** Thinking budget added on top of the caller's max_tokens (answer size). */
const THINKING_HEADROOM: Record<ContentEffort, number> = {
  low: 4_000,
  medium: 10_000,
  high: 20_000,
};

type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model"> & {
  model?: string;
  /**
   * Default "high" — Anthropic's starting point for Sonnet 5.5 on
   * non-latency-sensitive work like copywriting (2026-09-28). Checks and
   * the humanizer rewrite pass "low".
   */
  effort?: ContentEffort;
};

const base = new Anthropic();

/**
 * Prompt caching on the system prompt (2026-10-14, per Keenan: "do the
 * caching one now for anything mythical and social media related"). The
 * Console showed a 27% cache hit rate and "up to $107 a month" saved.
 * Every content caller keeps its rules in `system` and the per-post
 * material in `messages`, and a run sends the same system prompt many
 * times (best-of-5 drafts, fix passes, per-slide checks), so a breakpoint
 * on the last system block lets those repeats read it at ~10% of the price.
 * Prompts under the model's minimum cacheable length simply don't cache.
 * A block that already carries cache_control is left as the caller set it.
 */
function withCachedSystem(system: CreateParams["system"]): CreateParams["system"] {
  if (!system) return system;
  const blocks = typeof system === "string" ? [{ type: "text" as const, text: system }] : [...system];
  if (blocks.length === 0) return system;
  const last = blocks[blocks.length - 1] as (typeof blocks)[number] & { cache_control?: unknown };
  if (last.cache_control) return system;
  blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } } as (typeof blocks)[number];
  return blocks;
}

function modelUnavailable(err: unknown): boolean {
  if (err instanceof Anthropic.NotFoundError) return true;
  return err instanceof Anthropic.BadRequestError && /model/i.test(err.message);
}

/**
 * Writer swap test (2026-10-22, per Keenan: "have chatgpt 6.1 sol write the
 * image and video scripts ... do this for the next few days until Monday").
 * Inside the window, every WRITING call (all brands, the whole post: titles,
 * options, scenes, motion, captions) goes to OpenAI WRITER_OVERRIDE.model.
 * Checks stay on Claude: "low"-effort calls and anything with an image or
 * tools. Jev scoring is a separate service and is untouched.
 * After the window this is a no-op; delete it once the test is judged.
 */
export const WRITER_OVERRIDE = {
  model: "gpt-6.1-sol",
  from: Date.parse("2026-10-23T00:00:00Z"),
  until: Date.parse("2026-10-26T00:00:00Z"),
};

/** FeatureFlag "writer_override_now": forces the swap outside the window
 *  (sample runs, 2026-10-22). Read with a 30s memo; off on any DB error. */
const WRITER_FLAG = "writer_override_now";
let flagMemo: { at: number; on: boolean } | null = null;
async function writerFlagOn(): Promise<boolean> {
  if (flagMemo && Date.now() - flagMemo.at < 30_000) return flagMemo.on;
  let on = false;
  try {
    const { prisma } = await import("@/lib/prisma");
    on = !!(await prisma.featureFlag.findUnique({ where: { key: WRITER_FLAG }, select: { enabled: true } }))?.enabled;
  } catch {
    on = false;
  }
  flagMemo = { at: Date.now(), on };
  return on;
}

/**
 * Claude control post (2026-10-22, per Keenan: "make just two of the three
 * posts chatgpt only ... then 1 is our normal post"). The 08 UTC Mythicals
 * run (the 5pm CT post) stays fully on Claude: writing, caption and clip
 * prompts. writerScope marks a run as forced-Claude for everything it calls.
 * 2026-10-23, per Keenan: "go back to claude only for our mythicals
 * posting/script writing please. no more chatgpt" — every Mythicals run
 * (any mythic-* lane, any hour) is now Claude. Ripple stays in the test.
 */
export const writerScope = new AsyncLocalStorage<{ forceClaude: boolean }>();
export function isClaudeControlRun(lane: string | null | undefined, _hourUtc: number): boolean {
  return !!lane && lane.startsWith("mythic");
}

/** True while ChatGPT is the writer (dated window or the manual flag). */
export async function writerOverrideOn(): Promise<boolean> {
  if (writerScope.getStore()?.forceClaude) return false;
  const now = Date.now();
  if (!openAiKey()) return false;
  return (now >= WRITER_OVERRIDE.from && now < WRITER_OVERRIDE.until) || (await writerFlagOn());
}

/**
 * ChatGPT writes a slide's image-to-video prompt while LOOKING at the
 * finished picture (2026-10-22, per Keenan: "the prompts for animation need
 * work ... animations looked poor, make sure that happens on chatgpt").
 * `rules` is our standard motion brief for the lane (livingMotionPrompt),
 * which the new prompt must stay inside. Returns null on any failure so the
 * caller keeps the standard prompt.
 */
export async function gptMotionPrompt(opts: { imageUrl: string; rules: string; seconds: number }): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey()}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: WRITER_OVERRIDE.model,
        reasoning_effort: "medium",
        max_completion_tokens: 6000,
        messages: [
          {
            role: "system",
            content:
              "You are a film director writing the prompt for an image-to-video model (Kling). The image is the exact first frame. Write ONE plain paragraph, 90-150 words, no lists, no JSON, no headings. Describe only what moves, in concrete physical verbs, at real-world speed, across the whole clip: (1) one clear, cinematic main action by the subject that fits what is actually in the picture (a dragon raises its head and unfurls its wings, exhales a long jet of fire into the sky; a hero walks forward three heavy steps, cloak swinging); (2) two or three things in the environment that move with it (embers, mist, banners, water, light from glowing runes); (3) the camera: steady or a slow push-in. Name the subject by what you see (colors, material) so the model animates the right thing. Keep everything in the frame recognizable: no morphing, no new creatures or people, no text, no scene cuts. Follow the house rules you are given exactly; where they forbid something, never ask for it. The brief's own 'Action:' line is only a starting point: if it is small, static or mostly 'holds its pose' (a tail curl, a blink, standing still), REPLACE it with a bolder, more cinematic main action the subject can clearly perform in this picture: the head rises and turns toward the camera, the wings unfurl and beat once, kicking up dust, fire or frost streams from the jaws into the sky, the hero strides forward, the beast rears and settles. It stays measured and believable, one main action, never frantic.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Clip length: ${opts.seconds} seconds.\n\nHouse rules and the original brief for this slide:\n${opts.rules}\n\nReturn only the prompt paragraph.` },
              { type: "image_url", image_url: { url: opts.imageUrl } },
            ],
          },
        ],
      }),
    });
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!res.ok || !text || text.length < 60) return null;
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.claudeCallLog.create({
        data: { purpose: "openai-motion", model: WRITER_OVERRIDE.model, tokensIn: j.usage?.prompt_tokens ?? 0, tokensOut: j.usage?.completion_tokens ?? 0, costCents: 0, durationMs: 0, success: true },
      });
    } catch {
      // logging only
    }
    return text;
  } catch {
    return null;
  }
}

async function overrideActive(params: CreateParams, model: string): Promise<boolean> {
  if (writerScope.getStore()?.forceClaude) return false;
  const now = Date.now();
  const inWindow = now >= WRITER_OVERRIDE.from && now < WRITER_OVERRIDE.until;
  if (!inWindow && !(await writerFlagOn())) return false;
  if (!openAiKey()) return false;
  // Writers and the image checks share Opus 5.5, so checks are told apart by
  // effort ("low") and by carrying an image, never by model name.
  void model;
  if ((params.effort ?? "high") === "low") return false;
  if ((params as { tools?: unknown[] }).tools?.length) return false;
  const hasImage = params.messages.some(
    (m) => Array.isArray(m.content) && m.content.some((b) => (b as { type?: string }).type !== "text")
  );
  return !hasImage;
}

function openAiKey(): string | undefined {
  return process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
}

function blockText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((b) => ((b as { type?: string }).type === "text" ? (b as { text: string }).text : "")).join("");
  return "";
}

async function openAiWrite(params: CreateParams): Promise<Anthropic.Message> {
  const effort = params.effort ?? "high";
  const messages = [
    ...(params.system ? [{ role: "system", content: blockText(params.system) }] : []),
    ...params.messages.map((m) => ({ role: m.role, content: blockText(m.content) })),
  ];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: WRITER_OVERRIDE.model,
      messages,
      max_completion_tokens: params.max_tokens + THINKING_HEADROOM[effort],
      reasoning_effort: effort,
    }),
  });
  const j = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = j.choices?.[0]?.message?.content;
  if (!res.ok || typeof text !== "string" || !text.trim()) {
    throw new Error(`[content-writer] ${WRITER_OVERRIDE.model} failed: ${j.error?.message ?? res.status}`);
  }
  // One log row per ChatGPT-written call, so the test is countable per day
  // (callers' own rows record the model they asked for, not who answered).
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.claudeCallLog.create({
      data: {
        purpose: "openai-writer",
        model: WRITER_OVERRIDE.model,
        tokensIn: j.usage?.prompt_tokens ?? 0,
        tokensOut: j.usage?.completion_tokens ?? 0,
        costCents: 0,
        durationMs: 0,
        success: true,
      },
    });
  } catch {
    // logging only
  }
  return {
    id: `openai-${Date.now()}`,
    type: "message",
    role: "assistant",
    model: WRITER_OVERRIDE.model,
    content: [{ type: "text", text, citations: null }],
    stop_reason: j.choices?.[0]?.finish_reason === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: j.usage?.prompt_tokens ?? 0, output_tokens: j.usage?.completion_tokens ?? 0 },
  } as unknown as Anthropic.Message;
}

async function create(params: CreateParams): Promise<Anthropic.Message> {
  if (await overrideActive(params, params.model ?? CONTENT_MODEL)) {
    try {
      return await openAiWrite(params);
    } catch (err) {
      // Never lose a post to the test: fall back to the normal Claude writer.
      console.warn(`${err instanceof Error ? err.message : err} — falling back to Claude`);
    }
  }
  const {
    effort = "high",
    max_tokens,
    model: requested,
    temperature: _temperature,
    top_p: _topP,
    top_k: _topK,
    system,
    ...rest
  } = params;
  const cachedSystem = withCachedSystem(system);
  const body = (model: string) =>
    ({
      ...rest,
      ...(cachedSystem ? { system: cachedSystem } : {}),
      model,
      max_tokens: max_tokens + THINKING_HEADROOM[effort],
      // output_config is newer than this SDK version's types; the API accepts it.
      output_config: { effort },
    }) as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const model = requested ?? CONTENT_MODEL;
  const fallback = fallbackFor(model);
  let res: Anthropic.Message;
  try {
    res = await base.messages.create(body(model));
  } catch (err) {
    if (!fallback || !modelUnavailable(err)) throw err;
    console.warn(
      `[content-claude] ${model} unavailable (${err instanceof Error ? err.message : err}) — using ${fallback}`
    );
    return base.messages.create(body(fallback));
  }
  if ((res as { stop_reason?: string }).stop_reason === "refusal" && fallback) {
    console.warn(`[content-claude] ${model} declined — retrying on ${fallback}`);
    res = await base.messages.create(body(fallback));
  }
  return res;
}

/** Drop-in for `new Anthropic()` in content-factory code: same messages.create shape. */
export const contentAnthropic = { messages: { create } };

/** All text blocks joined — thinking blocks are skipped. */
export function messageText(res: Anthropic.Message): string {
  return res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}

interface CallClaudeParams {
  purpose: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  effort?: ContentEffort;
}

/**
 * Blog / SEO / AdLab callers (auto-blog, blog triage, fix-years, AdLab
 * routes) stay on Opus 4.6 — they write long articles inside 300s steps,
 * and the 2026-09-26 switch covered the social pipeline only. Social
 * callers use callContentClaude (Opus 5.5).
 */
const LEGACY_MODEL = "claude-opus-4-6";
// Opus 4.6 pricing: $5/M input, $25/M output (was logged at the old $15/$75).
const LEGACY_INPUT_COST_PER_TOKEN = 5 / 1_000_000;
const LEGACY_OUTPUT_COST_PER_TOKEN = 25 / 1_000_000;

export function callClaude(params: CallClaudeParams): Promise<string> {
  return loggedCall(params, false);
}

/** callClaude on the content model (Opus 5.5) — every social-pipeline caller. */
export function callContentClaude(params: CallClaudeParams): Promise<string> {
  return loggedCall(params, true);
}

async function loggedCall(params: CallClaudeParams, content: boolean): Promise<string> {
  const { purpose, systemPrompt, userPrompt, maxTokens = 4000, effort } = params;
  const model = content ? CONTENT_MODEL : LEGACY_MODEL;
  const { prisma } = await import("@/lib/prisma");

  const start = Date.now();
  try {
    const request = {
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userPrompt }],
    };
    const response = content
      ? await contentAnthropic.messages.create({ ...request, effort })
      : await base.messages.create({ ...request, model: LEGACY_MODEL });

    const durationMs = Date.now() - start;
    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    const costCents = Math.ceil(
      (content
        ? tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN
        : tokensIn * LEGACY_INPUT_COST_PER_TOKEN + tokensOut * LEGACY_OUTPUT_COST_PER_TOKEN) * 100
    );

    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model,
        tokensIn,
        tokensOut,
        costCents,
        durationMs,
        success: true,
      },
    });

    return messageText(response);
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    await prisma.claudeCallLog.create({
      data: {
        purpose,
        model,
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs,
        success: false,
        errorMessage,
      },
    });

    throw err;
  }
}

/**
 * The JSON answer inside a model reply (2026-09-28, Sonnet 5.5 prompting
 * guide): asked for JSON in the prompt, Sonnet 5.5 / Opus 5.5 sometimes
 * work the problem out in text first and write the JSON LAST, or draft a
 * value before the final one. Parsing the whole reply (or first "{" to
 * last "}") then fails or grabs the draft. This returns the source text of
 * the LAST complete top-level JSON value; the input unchanged if none
 * parses, so the caller's JSON.parse still throws its usual error.
 */
export function lastJsonText(reply: string): string {
  const text = reply.replace(/```(?:json)?/g, "");
  let last: string | null = null;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "{" && ch !== "[") {
      i++;
      continue;
    }
    const end = matchingBracket(text, i);
    if (end > i) {
      const candidate = text.slice(i, end + 1);
      try {
        JSON.parse(candidate);
        last = candidate;
        i = end + 1; // values nested inside this one don't count on their own
        continue;
      } catch {
        // not valid JSON from here — keep scanning
      }
    }
    i++;
  }
  return last ?? reply.trim();
}

/** Index of the bracket closing the one at `start`, string-aware; -1 if unbalanced. */
function matchingBracket(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}
