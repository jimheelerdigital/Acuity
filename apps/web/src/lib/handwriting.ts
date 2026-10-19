import Anthropic from "@anthropic-ai/sdk";

import { CLAUDE_MODEL } from "@acuity/shared";

/**
 * Handwritten-entry transcription (2026-10-17, Miro "Take picture of a
 * handwritten journal entry").
 *
 * One Claude vision call: the photo in, the words out — verbatim, no
 * summarising, no "fixing". The result is shown to the user in the
 * typed-entry composer for review BEFORE it becomes an Entry, so this is
 * a transcription step, not the extraction step; extraction runs on
 * whatever text they save, through the normal pipeline.
 */

export const HANDWRITING_MAX_IMAGE_BYTES = 4 * 1024 * 1024; // decoded JPEG/PNG
export const HANDWRITING_ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);
const HANDWRITING_MAX_TOKENS = 4096;
const HANDWRITING_TIMEOUT_MS = 60_000;

/** Sentinel the model returns when there is no legible writing. */
export const NO_TEXT_SENTINEL = "[[NO_TEXT]]";

const SYSTEM_PROMPT = `You transcribe handwritten and typed journal pages into plain text.

Rules:
- Output ONLY the transcribed words. No preamble, no commentary, no markdown fences, no headings you invent.
- Transcribe verbatim: keep the writer's wording, spelling, abbreviations, line breaks and list markers. Do not summarise, correct grammar, or complete sentences.
- If a word is genuinely illegible, write [illegible] in its place. Never guess a different word.
- Ignore page furniture: printed dates/headers on notebook paper, page numbers, ruled lines, margins, stickers.
- If the image contains no legible writing at all, output exactly ${NO_TEXT_SENTINEL} and nothing else.`;

export type HandwritingMedia = "image/jpeg" | "image/png" | "image/webp" | "image/heic";

export type HandwritingResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no_text" | "empty_response" };

export async function transcribeHandwriting(
  imageBase64: string,
  mediaType: HandwritingMedia,
  client: Anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: HANDWRITING_TIMEOUT_MS,
    maxRetries: 1,
  })
): Promise<HandwritingResult> {
  // HEIC isn't accepted by the vision API; callers convert on-device
  // (expo-image-picker/manipulator emit JPEG), but guard anyway so a
  // raw HEIC never reaches the model as a mislabeled JPEG.
  const sendType: "image/jpeg" | "image/png" | "image/webp" =
    mediaType === "image/heic" ? "image/jpeg" : mediaType;

  const message = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: HANDWRITING_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: sendType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Transcribe this page.",
          },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) return { ok: false, reason: "empty_response" };
  if (text === NO_TEXT_SENTINEL || text.includes(NO_TEXT_SENTINEL)) {
    return { ok: false, reason: "no_text" };
  }
  return { ok: true, text };
}
