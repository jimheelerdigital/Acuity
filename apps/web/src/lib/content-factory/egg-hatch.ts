/**
 * Legendary Mythicals — DRAGON EGG HATCHING (2026-10-06, per Keenan: "add
 * the dragon egg hatching series... first slide is 'what dragon hatches
 * from this egg?'... shows the egg cracking, and then fades to a slide 2 of
 * the dragon. the dragon should roar or do something cool in the 2nd part
 * with audio"). Approved from the v2 example: "use that and add that as one
 * of the posts. just one of the 6".
 *
 * One post a day inside the mythic picks lane (the 4th run of the day, like
 * How Big takes the 3rd), so Mythicals stays at 6 posts a day.
 *
 * Two slides, one video:
 *   1. The egg, title "WHAT DRAGON HATCHES FROM THIS EGG?" at the top.
 *      Kling 3.0 Turbo, 5s: the glowing cracks spread, nothing emerges.
 *   2. The dragon that hatched, its name ONLY, at the BOTTOM (so the whole
 *      dragon shows; Keenan: "no description... move the text to the
 *      bottom"). Kling 3.0 Standard with sound, 10s: it breathes and stares,
 *      then roars and breathes fire or ice into the sky.
 * The egg fades slowly to black, a beat of black, then the dragon fades in
 * slowly ("to build better anticipation"). The roar plays under the music.
 *
 * carousel-daily makes the images and saves the post with an
 * "mythic-egg-" slug; carousel-post-video sees the slug and builds the
 * video here instead of the slideshow.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";
import { NO_HUMAN_FACE_LINE, QUALITY_BAR_LINE } from "./choice-lane";

export const EGG_SLUG_PREFIX = "mythic-egg-";
export const EGG_TITLE = "WHAT DRAGON HATCHES FROM THIS EGG?";
export const EGG_CLIP_SEC = 5;
export const DRAGON_CLIP_SEC = 10;

/** Egg crack: Turbo (no sound needed). */
export const EGG_MODELS = ["kling-video/v3.0-turbo/image-to-video", "kling-video/v2.5-turbo/standard/image-to-video"];
/** Dragon reveal: Kling 3.0 with sound; pro if standard fails. */
export const DRAGON_MODELS = ["kling-video/v3.0/std/image-to-video", "kling-video/v3.0/pro/image-to-video"];

export interface EggConcept {
  /** Dragon name shown on slide 2, e.g. "THE EMBER WYRM". */
  name: string;
  /** "fire" | "ice" | "storm" ... — drives the egg's look and the breath. */
  element: string;
  /** Egg look: shell, color, nest. */
  egg: string;
  /** The dragon fresh out of that egg. */
  dragon: string;
  /** "fire" or "ice": the only breath allowed. */
  breath: "fire" | "ice";
  captionQuestion: string;
}

export function eggSlug(name: string): string {
  return `${EGG_SLUG_PREFIX}${name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)}`;
}

export function isEggSlug(slug: string | null | undefined): boolean {
  return !!slug?.startsWith(EGG_SLUG_PREFIX);
}

const WRITER_SYSTEM = `You write one post a day for Legendary Mythicals: "WHAT DRAGON HATCHES FROM THIS EGG?". Slide 1 is a colossal, ornate dragon egg cracking; slide 2 reveals the dragon that hatched from it.

Rules:
- The egg and the dragon must clearly belong together: same element, same palette, the dragon's scales echo the shell.
- Epic, dark and premium: obsidian, frost, storm, crystal, shadow, gold, emerald, bone, magma, moonlight... Vary the element, palette and nest every day.
- The dragon is young but already magnificent and powerful, not cute. It has large, clearly visible wings. Its face is fully reptilian (never human).
- The dragon never holds or uses a weapon.
- Its only ability is breath: "fire" or "ice", matching its element (2026-10-06, per Keenan: dragons get full fire/ice bursts; no other magic effects).
- name: 2-4 words, ALL CAPS, starting with "THE" (e.g. "THE EMBER WYRM", "THE GLACIER DRAKE"). Never reuse a recent name or element.
- egg: one paragraph describing the egg and its nest for an image model (shell texture, glowing cracks, nest, light, accent color).
- dragon: one paragraph describing the hatched dragon for an image model, perched on the shattered shell of that same egg, wings half-spread, head raised, glowing eyes on the lens, mouth closed.
- captionQuestion: one short line asking the reader something about the dragon (e.g. "Would you raise it, or run?"). Never mention quizzes or links.

Return JSON only: {"name": "...", "element": "...", "egg": "...", "dragon": "...", "breath": "fire" | "ice", "captionQuestion": "..."}`;

export async function writeEggConcept(opts: { recent: string[]; feedback?: string | null }): Promise<EggConcept> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const user = [
    "Write today's egg and dragon.",
    opts.recent.length ? `Recent dragons (never repeat their name, element or palette):\n${opts.recent.map((r) => `- ${r}`).join("\n")}` : "",
    opts.feedback ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const response = await contentAnthropic.messages.create({
    max_tokens: 2000,
    system: WRITER_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  await prisma.claudeCallLog
    .create({
      data: {
        purpose: "egg-concept",
        model: CONTENT_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil((tokensIn * CONTENT_INPUT_COST_PER_TOKEN + tokensOut * CONTENT_OUTPUT_COST_PER_TOKEN) * 100),
        durationMs: Date.now() - start,
        success: true,
      },
    })
    .catch(() => {});
  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const p = JSON.parse(lastJsonText(text)) as Partial<EggConcept>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  let name = str(p.name).toUpperCase();
  if (name && !name.startsWith("THE ")) name = `THE ${name}`;
  const concept: EggConcept = {
    name,
    element: str(p.element) || "fire",
    egg: str(p.egg),
    dragon: str(p.dragon),
    breath: p.breath === "ice" ? "ice" : "fire",
    captionQuestion: str(p.captionQuestion) || "Would you raise it, or run?",
  };
  if (!concept.name || concept.egg.length < 40 || concept.dragon.length < 40) {
    throw new Error(`egg concept unusable: ${text.slice(0, 300)}`);
  }
  return concept;
}

const STYLE = `${QUALITY_BAR_LINE} Vertical 2:3, photoreal cinematic, no text, no letters, no watermark.`;

export function buildEggImagePrompt(c: EggConcept): string {
  return `A single colossal dragon egg. ${c.egg} The egg is big, centered and frontal, filling most of the frame, with thin glowing cracks as if something is about to break out. Open dark atmosphere in the top fifth of the frame (a title is added there later). No creature visible. ${STYLE}`;
}

export function buildDragonImagePrompt(c: EggConcept): string {
  return `A magnificent young dragon that has just hatched: ${c.dragon} It is perched on the shattered shell fragments of its egg, wings half-spread, head raised, glowing eyes staring into the lens, mouth closed. The whole dragon is visible, big, close and frontal, with dark ground in the bottom fifth of the frame (a name is added there later). ${NO_HUMAN_FACE_LINE} It holds no weapon. ${STYLE}`;
}

export function eggMotionPrompt(): string {
  return "The dragon egg begins to hatch. The glowing cracks spread and widen across the shell, pulsing brighter, small shell fragments chip and fall away, light and smoke pour out of the cracks, embers or frost particles swirl upward. The egg trembles slightly. Static camera with a slow push-in. No creature emerges yet.";
}

export function dragonMotionPrompt(c: EggConcept): string {
  // 2026-10-06 (Keenan: "dragons can be normal full fire/ice bursts depending on the dragon type").
  // 2026-10-08 (Keenan: "dragon breath looks terrible and weak"): full power.
  const breath = c.breath === "ice" ? "a long, straight, powerful jet of ice shards and freezing mist, head turned to the side, shooting horizontally out of the side of the frame and lighting the scene cold blue" : "a long, straight, powerful jet of fire, head turned to the side, shooting horizontally out of the side of the frame and lighting the scene bright orange";
  const sound = c.breath === "ice" ? "a crackling, rushing blast of freezing wind and ice" : "roaring fire";
  return `The newly hatched dragon sits still at first, breathing slowly, dust drifting, its eyes locked on the camera. Then it slowly raises its head, opens its jaws, lets out a deep roar and breathes ${breath}. Its wings flare open with one strong wingbeat, then it settles and stares back at the camera. Slow push-in camera. Sound: low breathing and crackling shell, then a deep, thunderous dragon roar and ${sound}. No music, no speech.`;
}

/** Stored on slide 0's imagePrompt so the video builder can rebuild without the concept. */
export function encodeEggPrompt(c: EggConcept, eggPrompt: string): string {
  return [`NAME: ${c.name}`, `ELEMENT: ${c.element}`, `BREATH: ${c.breath}`, `EGG: ${eggPrompt}`, `DRAGON: ${c.dragon}`].join("\n");
}

export function decodeEggPrompt(stored: string): { name: string | null; element: string | null; breath: "fire" | "ice" } {
  const line = (k: string) => stored.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1]?.trim() ?? null;
  return { name: line("NAME"), element: line("ELEMENT"), breath: line("BREATH") === "ice" ? "ice" : "fire" };
}

/** Submit one clip on the Higgsfield developer API. */
export async function submitEggClip(opts: {
  model: string;
  imageUrl: string;
  prompt: string;
  seconds: number;
  sound: boolean;
}): Promise<{ requestId: string; estimate: { credits?: string; usd?: string } | null }> {
  const { estimateCinematicCost } = await import("./cinematic-shot");
  const kling3 = opts.model.startsWith("kling-video/v3.0/");
  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    image_url: opts.imageUrl,
    // Kling 2.5 Turbo only takes 5 or 10.
    duration: opts.model.includes("v2.5") ? (opts.seconds <= 5 ? 5 : 10) : opts.seconds,
    ...(kling3 && opts.sound ? { sound: "on" } : {}),
  };
  const estimate = await estimateCinematicCost(opts.model, body);
  const res = await fetch(`https://api.higgsfield.ai/${opts.model}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}:${process.env.HIGGSFIELD_API_SECRET}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Higgsfield submit failed (${res.status}) for model "${opts.model}": ${text.slice(0, 500)}`);
  let json: { request_id?: string; id?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Higgsfield submit returned non-JSON for ${opts.model}: ${text.slice(0, 200)}`);
  }
  const requestId = json.request_id ?? json.id;
  if (!requestId) throw new Error(`Higgsfield submit returned no request id: ${text.slice(0, 300)}`);
  return { requestId, estimate };
}
