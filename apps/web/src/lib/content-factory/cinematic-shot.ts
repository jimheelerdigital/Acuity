/**
 * Legendary Mythicals — COLOSSAL ENCOUNTERS lane (2026-10-04, per Keenan:
 * "get rid of 'how big would they really be' entirely. replace it with the
 * lane we discussed earlier when i sent you the picture of the big dragon
 * head looking at the small person... a lane dedicated to that with a
 * cinematic opening and close fade in and fade out").
 *
 * Lane `mythic-colossus` (ContentLane template "cinematic"), one post a
 * day. One post = ONE 15-second Kling 3.0 shot with its own sound: a
 * colossal mythical creature's HEAD rising out of fog, sea, cloud or
 * ruins, face to face with ONE tiny human who stands their ground, the
 * creature's huge eye locking onto them. No text on screen; fades up from
 * black and down to black. 4K, pro as the fallback.
 *
 * Reference (Keenan's screenshot, @mfahadnaim, 11.5K likes / 1,487 sends):
 * a slate-blue dragon head emerging from blue-grey fog, filling the frame,
 * calm pale eyes, a tiny figure on a black volcanic cliff edge with
 * glowing lava cracks. Our first render of it: the dragon exhales a wave
 * of vapor over the man, who doesn't move; it ends on the eye.
 *
 * Flow: the writer drafts four concepts, each on a different framing not
 * used recently; Jev picks one (fails open to the first); carousel-daily
 * makes the start frame and saves a one-slide post; the post-video builder
 * (carousel-post-video) sees the "mythic-cinematic-" slug and runs the
 * cinematic path instead of the slideshow.
 */

import {
  contentAnthropic,
  CONTENT_MODEL,
  CONTENT_INPUT_COST_PER_TOKEN,
  CONTENT_OUTPUT_COST_PER_TOKEN,
  lastJsonText,
} from "./claude-client";

export const CINEMATIC_LANE_KEY = "mythic-colossus";
export const CINEMATIC_SLUG_PREFIX = "mythic-cinematic-";
export const CINEMATIC_SECONDS = 15;

/**
 * Kling 3.0 on the dev API (docs.higgsfield.ai/docs/models/kling-3): 4K is
 * 2164x3828, pro 1080p. 4K leads (Keenan's pick); pro is the fallback when
 * a 4K job fails or doesn't finish in time. CINEMATIC_QUALITY=pro switches
 * the lead to pro without code changes.
 */
export const CINEMATIC_MODEL_4K = "kling-video/v3.0/4k/image-to-video";
export const CINEMATIC_MODEL_PRO = "kling-video/v3.0/pro/image-to-video";
export function cinematicModels(): string[] {
  return process.env.CINEMATIC_QUALITY?.trim() === "pro"
    ? [CINEMATIC_MODEL_PRO]
    : [CINEMATIC_MODEL_4K, CINEMATIC_MODEL_PRO];
}

/**
 * Framings of the encounter, rotated so no two days feel the same. Every
 * one keeps the creature's head and the tiny human in the same frame.
 */
export const CINEMATIC_PERSPECTIVES = [
  "from low behind the tiny human, looking past them up at the colossal head filling the frame",
  "wide side profile: the human on one side, the colossal head on the other, face to face",
  "from just over the human's shoulder, the creature's eye filling most of the frame",
  "from water level beside a small boat as the head rises out of the sea next to it",
  "high wide shot from above and behind, the human a speck before the head",
  "from the ground looking up as the head lowers down out of the clouds or mist toward the human",
  "across a chasm, lake or canyon, the human on the near edge and the head rising on the far side",
  "through ruins, a stone archway or a forest clearing, the head peering in at the human",
];

export interface CinematicConcept {
  /** Short name for the shot, ALL-CAPS ready ("THE WATCHER IN THE FOG"). Not shown on screen. */
  title: string;
  creature: string;
  /** e.g. "head the size of a cathedral" — keeps the scale specific. */
  size: string;
  location: string;
  perspective: string;
  /** Start-frame image prompt. */
  still: string;
  /** 15-second video prompt: three beats + a "Sound:" line. */
  motion: string;
  captionQuestion: string;
}

/** Stored on the cover slide's imagePrompt; parsed back by the video builder. */
export function encodeCinematicPrompt(c: CinematicConcept, stillPrompt: string): string {
  return [
    `CREATURE: ${c.creature} (${c.size})`,
    `LOCATION: ${c.location}`,
    `PERSPECTIVE: ${c.perspective}`,
    `STILL: ${stillPrompt}`,
    `MOTION: ${c.motion}`,
  ].join("\n");
}

export function decodeCinematicPrompt(stored: string): {
  creature: string | null;
  perspective: string | null;
  motion: string | null;
} {
  const line = (k: string) => stored.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1]?.trim() ?? null;
  // MOTION is last and may run over several lines.
  const motion = stored.match(/^MOTION: ([\s\S]*)$/m)?.[1]?.trim() ?? null;
  return { creature: line("CREATURE"), perspective: line("PERSPECTIVE"), motion };
}

/**
 * Start-frame prompt: a photoreal film still, the creature's head huge
 * against one tiny human.
 */
export function buildCinematicStillPrompt(c: CinematicConcept): string {
  return [
    c.still,
    "Vertical 9:16 epic cinematic film still. The creature's head is enormous and fills most of the frame; the human is tiny, clearly visible and facing it. Photorealistic, physically accurate light, atmosphere and scale, prestige-film production design, film grain, fine detail, tack-sharp on the eyes; never a fantasy painting or CGI render.",
    "No creature has a human face or human head: its face is fully animal, reptilian or monstrous. Every dragon, wyrm, drake or wyvern has large, clearly visible wings.",
    "No text, no letters, no watermark, no logo.",
  ].join(" ");
}

const WRITER_SYSTEM = `You write the daily 15-second cinematic shot for Legendary Mythicals, an epic mythical-creature page (mostly men 18-34). Every shot is the same kind of moment: a COLOSSAL mythical creature's HEAD, face to face with ONE tiny human.

The shot that sets the bar: a colossal ancient dragon head rises out of thick blue-grey fog, filling most of the frame, almost straight on: weathered slate-blue scales like cracked stone, jagged horn-spikes along the brow and jaw, two enormous pale ice-blue eyes, half-lidded and calm. At the bottom of the frame, on a jagged black volcanic cliff edge with thin glowing lava cracks, one tiny human in a long coat stands facing it. In the video the camera pushes slowly toward the head, the eyes open and lock onto the man, the dragon lowers its head and lets out one long exhale that rolls over the cliff and whips his coat while he stands his ground, and it ends on the eye. Sound: a deep rumbling growl you feel in your chest, the huge breath, cold wind, crackling lava, a dark orchestral swell.

Every concept needs:
- ONE colossal mythical creature, and the subject is its HEAD and FACE: close, huge, filling most of the frame, rising out of something (fog, the sea, clouds, a canyon, ruins, snow, a storm). Its body can be implied. Real, specific scale (state it, e.g. "head the size of a cathedral").
- ONE tiny human (or at most two), small in the frame, standing their ground, facing the creature: on a cliff edge, a rock in the sea, a bridge, a boat, a ruined stair. Calm awe, never panic. Nobody is hurt.
- The moment: the creature notices the human. Its eye opens, focuses, its pupil narrows; it leans in, breathes out, rumbles, tilts its head with curiosity. Slow, heavy, majestic, at natural speed. No fighting, no attacking, no gore.
- A setting with real weather and light, and a muted cinematic palette with one warm or glowing accent (lava, sunset, embers, bioluminescence, lightning, torches). Vary it every day: volcanic cliffs, a glacier, a stormy sea, a desert canyon at dusk, a frozen lake, a misty jungle ruin, a fjord, cloud tops at sunrise, a cave mouth, a burning forest edge.
- One continuous 15-second shot, no cuts, in the assigned framing, in three beats: (1) stillness and scale, fog or water moving, the camera easing in; (2) the creature reacts to the human: eyes open and lock on, it lowers or leans in; (3) a close, memorable beat: a breath that blows past the human, a deep rumble, the eye in extreme close detail.
- Mythical only: dragons (always with big, visible wings, at least partly in frame or implied behind the head), leviathans and sea serpents, krakens, titans of stone or ice, colossal wolves of legend, phoenixes, ancient world-turtles, colossal elemental beasts. Never a plain real-world animal. No human or man-like faces on any creature (no sphinx, manticore, lamassu, naga, siren, centaur, harpy).
- It must look like a frame from a prestige film: photoreal, never a painting or CGI render.
- Variety: never repeat a creature, setting or idea from the recent list.

For each concept write:
- "title": 2-5 words, ALL-CAPS ready, a film-like name for the shot ("THE WATCHER IN THE FOG"). Not shown on screen.
- "creature": what it is, 2-6 words.
- "size": its scale, a few words.
- "location": the setting, a few words.
- "perspective": the framing you were assigned, in your own few words.
- "still": the START FRAME as a film still, 80-140 words: the creature's head (shape, scales or hide, horns, eyes, expression), where it rises from, the tiny human and where they stand, the framing, light, weather, palette, the one warm accent, and the camera (e.g. "ARRI Alexa 65, anamorphic lens, film grain"). The eyes can start half-lidded or closed so they can open in the video.
- "motion": the 15-second video, 90-170 words: the camera move and the three beats in order, then a final sentence starting "Sound:" with the sound design (the creature's growl or breath, wind, water, fire, the human's breathing, a dark orchestral or choir swell). End with "No dialogue, no text." Only what can follow from the start frame; the creature keeps its exact design and stays in frame.
- "captionQuestion": one short question that gets comments ("Would you stand your ground?", "What would you say to it?").

OUTPUT (JSON only): { "concepts": [ { "title": "...", "creature": "...", "size": "...", "location": "...", "perspective": "...", "still": "...", "motion": "...", "captionQuestion": "..." }, ... ] }`;

/** Perspectives for today's concepts: the ones least recently used, shuffled. */
export function pickPerspectives(recent: string[], n: number, rng: () => number = Math.random): string[] {
  const usedRecently = (p: string) =>
    recent.slice(0, 6).some((r) => r && p.toLowerCase().startsWith(r.toLowerCase().slice(0, 18)));
  const fresh = CINEMATIC_PERSPECTIVES.filter((p) => !usedRecently(p));
  const pool = (fresh.length >= n ? fresh : CINEMATIC_PERSPECTIVES).slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Four concepts, one per perspective. Throws when the writer returns nothing usable. */
export async function writeCinematicConcepts(opts: {
  perspectives: string[];
  recent: string[];
  feedback?: string | null;
}): Promise<CinematicConcept[]> {
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  const user = [
    `Write ${opts.perspectives.length} different concepts. Assigned perspectives, one per concept, in this order:`,
    ...opts.perspectives.map((p, i) => `${i + 1}. ${p}`),
    "Every concept uses a different creature AND a different kind of place.",
    opts.recent.length ? `Recent shots (never repeat their creature, place or idea):\n${opts.recent.map((r) => `- ${r}`).join("\n")}` : "",
    opts.feedback ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const response = await contentAnthropic.messages.create({
    max_tokens: 6000,
    system: WRITER_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;
  await prisma.claudeCallLog
    .create({
      data: {
        purpose: "cinematic-concepts",
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
  const parsed = JSON.parse(lastJsonText(text)) as { concepts?: Partial<CinematicConcept>[] };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const concepts = (parsed.concepts ?? [])
    .map((c) => ({
      title: str(c.title).toUpperCase(),
      creature: str(c.creature),
      size: str(c.size),
      location: str(c.location),
      perspective: str(c.perspective),
      still: str(c.still),
      // Kling truncates prompts past 2,500 characters.
      motion: str(c.motion).slice(0, 2400),
      captionQuestion: str(c.captionQuestion) || "Would you stay and watch, or run?",
    }))
    .filter((c) => c.title && c.creature && c.still.length > 40 && c.motion.length > 40);
  if (concepts.length === 0) throw new Error("cinematic concepts unusable: writer returned none");
  return concepts;
}

/**
 * Jev picks the concept most likely to stop the scroll and be watched to
 * the end. Fails open to the first concept.
 */
export async function pickCinematicConcept(
  concepts: CinematicConcept[]
): Promise<{ concept: CinematicConcept; reason: string; jev?: { choice: string; p: number } }> {
  if (concepts.length === 1) return { concept: concepts[0], reason: "only concept" };
  const { askJev, choiceOf } = await import("./jev");
  const criteria: Record<string, string | null> = {};
  concepts.forEach((c, i) => {
    criteria[`c${i}`] = `${c.title}: ${c.creature} (${c.size}) in ${c.location}, ${c.perspective}`;
  });
  const r = await askJev(
    "cinematic-concept",
    {
      page: "Legendary Mythicals, an epic mythical-creature page (mostly men 18-34)",
      format: "one 15-second vertical cinematic video: a colossal mythical creature's head face to face with one tiny human, no text",
      concepts: concepts.map((c) => ({ title: c.title, creature: c.creature, size: c.size, location: c.location, perspective: c.perspective, video: c.motion })),
    },
    {
      best: {
        type: "choice",
        instructions:
          "Which concept will make the most people stop scrolling, watch all 15 seconds and send it to a friend? Favor an instantly obvious scale between the head and the human, a striking creature design, a photoreal film look, and a memorable close moment (the eye, the breath).",
        criteria,
      },
    }
  );
  const pick = choiceOf(r, "best");
  const idx = pick ? Number(pick.choice.replace(/^c/, "")) : NaN;
  if (pick && Number.isInteger(idx) && concepts[idx]) {
    return { concept: concepts[idx], reason: `jev ${(pick.p * 100).toFixed(0)}%`, jev: { choice: pick.choice, p: pick.p } };
  }
  return { concept: concepts[0], reason: "jev unavailable — first concept" };
}

export function cinematicSlug(title: string): string {
  return `${CINEMATIC_SLUG_PREFIX}${title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50)}`;
}

export function isCinematicSlug(slug: string | null | undefined): boolean {
  return !!slug?.startsWith(CINEMATIC_SLUG_PREFIX);
}

/**
 * Cost of one render before submitting (docs: POST /estimate/<model>).
 * Informational only; returns null on any failure.
 */
export async function estimateCinematicCost(
  model: string,
  body: Record<string, unknown>
): Promise<{ credits?: string; usd?: string } | null> {
  try {
    const res = await fetch(`https://api.higgsfield.ai/estimate/${model}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${process.env.HIGGSFIELD_API_KEY}:${process.env.HIGGSFIELD_API_SECRET}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as { credits?: string; usd?: string };
  } catch {
    return null;
  }
}

/** Submit one Kling 3.0 render with sound. Returns the request id. */
export async function submitCinematicVideo(opts: {
  model: string;
  imageUrl: string;
  prompt: string;
}): Promise<{ requestId: string; estimate: { credits?: string; usd?: string } | null }> {
  const body = {
    prompt: opts.prompt,
    image_url: opts.imageUrl,
    duration: CINEMATIC_SECONDS,
    sound: "on",
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
