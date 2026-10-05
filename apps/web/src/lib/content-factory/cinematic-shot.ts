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
 * THE REVEAL (2026-10-04, per Keenan: "make the face be off screen or
 * hidden and then reveal itself"): two frames. The END frame is the full
 * encounter (head + human). The START frame is the same picture edited
 * so the creature is gone (fog, cloud, dark water, shadow; a faint hint
 * at most). Kling 3.0 gets both (image_url + last_image_url) and animates
 * the creature rising into view.
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
/**
 * Default since 2026-10-05 (per Keenan: "cut colossal encounters down to the
 * NORMAL structure... 15 s clip kling turbo off of a high quality image"; 4K
 * was ~$3.15/clip discounted, ~$6.30 normally). Turbo takes 3-15s, 720p by
 * default, and has no sound or last-frame field, so it animates the single
 * encounter frame (no hidden-to-reveal end frame).
 */
export const CINEMATIC_MODEL_TURBO = "kling-video/v3.0-turbo/image-to-video";
export function cinematicModels(): string[] {
  const q = process.env.CINEMATIC_QUALITY?.trim();
  if (q === "4k") return [CINEMATIC_MODEL_4K, CINEMATIC_MODEL_PRO];
  if (q === "pro") return [CINEMATIC_MODEL_PRO];
  return [CINEMATIC_MODEL_TURBO, CINEMATIC_MODEL_TURBO];
}
/** Turbo can't take an end frame: the lane skips the hidden start frame. */
export function cinematicUsesEndFrame(): boolean {
  return !cinematicModels()[0].includes("v3.0-turbo");
}
/** Single-frame motion for Turbo (2026-10-05 Mythicals motion rules). */
export function turboEncounterPrompt(motion: string): string {
  return [
    "Epic cinematic fantasy film shot, one continuous 15-second shot animating this exact frame.",
    "The colossal creature and the tiny human hold the encounter: the creature breathes slowly, its eyes glow, mist, smoke or embers drift through the air, light shifts across its scales, and the camera pushes in slowly and steadily.",
    "Allowed actions: one slow, powerful wingbeat, or the creature breathing fire or ice up into the sky, never at the human. Nothing else: no attacks, no lunging, no rearing, no charging, no morphing.",
    motion ? `Scene notes: ${motion.slice(0, 600)}` : "",
    "Keep the creature, the human, the colors and the setting exactly as in the image. No text, no new creatures or people, no cuts.",
  ]
    .filter(Boolean)
    .join(" ");
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
  /** The REVEAL (end) frame: the full encounter. */
  still: string;
  /** What fills the creature's place in the START frame (it is hidden there). */
  hidden: string;
  /** 15-second video prompt: three beats + a "Sound:" line. */
  motion: string;
  captionQuestion: string;
}

/** Stored on the cover slide's imagePrompt; parsed back by the video builder. */
export function encodeCinematicPrompt(
  c: CinematicConcept,
  stillPrompt: string,
  frames?: { start: string; end: string }
): string {
  return [
    `CREATURE: ${c.creature} (${c.size})`,
    `LOCATION: ${c.location}`,
    `PERSPECTIVE: ${c.perspective}`,
    `STILL: ${stillPrompt}`,
    ...(frames ? [`START_FRAME: ${frames.start}`, `END_FRAME: ${frames.end}`] : []),
    `MOTION: ${c.motion}`,
  ].join("\n");
}

export function decodeCinematicPrompt(stored: string): {
  creature: string | null;
  perspective: string | null;
  motion: string | null;
  startFrame: string | null;
  endFrame: string | null;
} {
  const line = (k: string) => stored.match(new RegExp(`^${k}: (.*)$`, "m"))?.[1]?.trim() ?? null;
  // MOTION is last and may run over several lines.
  const motion = stored.match(/^MOTION: ([\s\S]*)$/m)?.[1]?.trim() ?? null;
  return {
    creature: line("CREATURE"),
    perspective: line("PERSPECTIVE"),
    motion,
    startFrame: line("START_FRAME"),
    endFrame: line("END_FRAME"),
  };
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

/**
 * Formats the lane rotates through (2026-10-04, per Keenan "ok sounds good"
 * to: rotate "it was never a mountain", the bond, and legendary weapon
 * reveals alongside the encounter, and let the data pick). The performance
 * loop's bandit picks one per day (recipe category = format key).
 * reveal = the video starts on an edited start frame (see
 * buildCinematicHiddenPrompt); false = Kling animates from the final frame.
 */
export const CINEMATIC_FORMATS = {
  encounter: { label: "a colossal creature's head face to face with a tiny human", reveal: true, rules: "" },
  "never-a-mountain": {
    label: "the landscape is the creature: a ridge, island or glacier wakes up",
    reveal: true,
    rules: `TODAY'S FORMAT: "IT WAS NEVER A MOUNTAIN" (this overrides the head-rising-out-of-fog description where they differ). Tiny people are ON or BESIDE what looks like ordinary terrain: a snowy ridge, a rocky island, a glacier, a desert mesa, a forested hill. It is actually a colossal sleeping creature. The FINAL frame shows the truth: a wide shot where the terrain clearly is the creature's head or body, one enormous eye open beside the tiny people, its shape readable (brow, horns, snout or shell edges in the rock). "hidden" describes the same terrain with the creature fully disguised: its eye closed and grown over with rock, snow, moss or ice, no face readable. The motion: stillness, then a tremor, snow or rocks or water sliding, the eyelid splitting open, the creature stirring and the camera easing back so the scale lands. Its power can show as frost, magma glowing in the cracks, lightning in the clouds above.`,
  },
  bond: {
    label: "the bond: a human touches a colossal creature's snout and it closes its eyes",
    reveal: false,
    rules: `TODAY'S FORMAT: "THE BOND" (this overrides the hidden reveal: the creature is already in frame at the start). One human stands right before the colossal creature's lowered head, close to its snout, still tiny beside it. In 15 seconds: the creature breathes, watching; the human slowly raises a hand and lays it on the creature's snout or scales; the creature exhales softly, its eyes slowly close, it leans into the touch; a gentle sign of its power (embers drifting, frost blooming where the hand rests, a soft glow along its scales). Calm, emotional, awe and trust, never threat. "hidden" is unused (write "none").`,
  },
  "legendary-weapon": {
    label: "a legendary weapon or armor rises before a lone warrior, its power blazing",
    reveal: true,
    rules: `TODAY'S FORMAT: "LEGENDARY WEAPON" (this replaces the creature: the subject is a legendary weapon or suit of armor). A colossal or legendary sword, axe, spear, hammer or suit of armor rises out of a frozen lake, a lava pool, a stone altar, the sea or a glacier before ONE lone warrior, small in the frame. "creature" names the weapon or armor and its power ("frost-forged greatsword, ice runes"). The FINAL frame shows it fully risen and blazing with its power (runes alight, fire, frost, lightning), the warrior facing it. "hidden" describes the same place with the weapon not yet risen (unbroken ice, still lava, a bare altar, calm water) with only a faint glow beneath. The motion: stillness and a glow building, the surface cracking, the weapon rising slowly, its power igniting, then settling into the final frame.`,
  },
} as const;
export type CinematicFormat = keyof typeof CINEMATIC_FORMATS;
export const CINEMATIC_FORMAT_KEYS = Object.keys(CINEMATIC_FORMATS) as CinematicFormat[];

/**
 * Edit prompt for the START frame: the same picture with the creature
 * removed, so the video can reveal it.
 */
export function buildCinematicHiddenPrompt(c: CinematicConcept, format: CinematicFormat = "encounter"): string {
  if (format === "never-a-mountain") {
    return [
      `Edit this exact image: disguise the ${c.creature} as ordinary terrain. Its eye is fully closed and grown over with rock, snow, ice or moss; no eye, face, horns or snout are recognizable; it reads as a natural ${c.location}.`,
      `It should look like: ${c.hidden}`,
      "Keep everything else identical: the same framing and camera, the same light, sky and weather, the same tiny people in the same place and pose. Photorealistic, same film look. No text, no watermark.",
    ].join(" ");
  }
  const what = format === "legendary-weapon" ? "every part of it" : "every part of it (head, horns, eyes, neck, wings, body)";
  return [
    `Edit this exact image: remove the ${c.creature} completely, ${what}.`,
    `In its place: ${c.hidden}`,
    "Keep everything else identical: the same framing and camera, the same light, sky and weather, the same tiny human in the same place and pose, the same ground and setting. Photorealistic, same film look. No creature, no face, no eyes visible. No text, no watermark.",
  ].join(" ");
}

const WRITER_SYSTEM = `You write the daily 15-second cinematic shot for Legendary Mythicals, an epic mythical-creature page (mostly men 18-34). Every shot is the same kind of moment: a COLOSSAL mythical creature's HEAD, face to face with ONE tiny human.

The shot that sets the bar: a colossal ancient dragon head rises out of thick blue-grey fog, filling most of the frame, almost straight on: weathered slate-blue scales like cracked stone, jagged horn-spikes along the brow and jaw, two enormous pale ice-blue eyes, half-lidded and calm. At the bottom of the frame, on a jagged black volcanic cliff edge with thin glowing lava cracks, one tiny human in a long coat stands facing it. In the video the camera pushes slowly toward the head, the eyes open and lock onto the man, the dragon lowers its head and lets out one long exhale that rolls over the cliff and whips his coat while he stands his ground, and it ends on the eye. Sound: a deep rumbling growl you feel in your chest, the huge breath, cold wind, crackling lava, a dark orchestral swell.

Every concept needs:
- ONE colossal mythical creature, and the subject is its HEAD and FACE: close, huge, filling most of the frame, rising out of something (fog, the sea, clouds, a canyon, ruins, snow, a storm). Its body can be implied. Real, specific scale (state it, e.g. "head the size of a cathedral").
- ONE tiny human (or at most two), small in the frame, standing their ground, facing the creature: on a cliff edge, a rock in the sea, a bridge, a boat, a ruined stair. Calm awe, never panic. Nobody is hurt.
- The moment: the creature notices the human. Its eye opens, focuses, its pupil narrows; it leans in, breathes out, rumbles, tilts its head with curiosity. Slow, heavy, majestic, at natural speed. No fighting, no attacking, no gore.
- A setting with real weather and light, and a muted cinematic palette with one warm or glowing accent (lava, sunset, embers, bioluminescence, lightning, torches). Vary it every day: volcanic cliffs, a glacier, a stormy sea, a desert canyon at dusk, a frozen lake, a misty jungle ruin, a fjord, cloud tops at sunrise, a cave mouth, a burning forest edge.
- THE REVEAL: the creature is HIDDEN when the video starts and reveals itself. The video starts on the human alone in the setting (the creature's place is filled with fog, cloud, dark water, smoke, shadow or snow) and ENDS on the full encounter frame. One continuous 15-second shot, no cuts, in the assigned framing, in three beats: (1) 0-5s: the human alone, stillness, the environment moving; a hint something is there (a rumble, the fog bulging, a glow, a vast shadow, the water swelling); (2) 5-11s: the colossal head rises, emerges or pushes out of the fog, water or cloud and its face is revealed, enormous; (3) 11-15s: its eyes open and lock onto the tiny human, and it shows its SIGNATURE POWER in one vivid burst (a dragon breathes a roaring column of fire, ice or lightning up into the sky above the human; a leviathan sends a wall of water or a storm surge around the boat; a titan's eyes and cracks flare with magma; a phoenix's feathers erupt into flame), never at the human, then it settles into the final frame (the head and the human facing each other).
- POWERS (2026-10-04, per Keenan: "have them breathe fire and give other abilities... breathing ice fire"): every creature has one signature power (fire, ice, lightning, shadow-flame, storm, magma, bioluminescent pulse) that fits its look. The final frame can show its trace (embers drifting, frost on the rocks, sparks in the air, a glowing throat).
- Mythical only: dragons (always with big, visible wings, at least partly in frame or implied behind the head), leviathans and sea serpents, krakens, titans of stone or ice, colossal wolves of legend, phoenixes, ancient world-turtles, colossal elemental beasts. Never a plain real-world animal. No human or man-like faces on any creature (no sphinx, manticore, lamassu, naga, siren, centaur, harpy).
- It must look like a frame from a prestige film: photoreal, never a painting or CGI render.
- Variety: never repeat a creature, setting or idea from the recent list.

For each concept write:
- "title": 2-5 words, ALL-CAPS ready, a film-like name for the shot ("THE WATCHER IN THE FOG"). Not shown on screen.
- "creature": what it is and its power, 2-8 words ("ancient frost dragon, ice breath").
- "size": its scale, a few words.
- "location": the setting, a few words.
- "perspective": the framing you were assigned, in your own few words.
- "still": the FINAL REVEAL FRAME as a film still, 80-140 words: the creature's head (shape, scales or hide, horns, eyes, expression), where it rises from, the tiny human and where they stand (in the lower third, not at the very edge of the frame), the framing, light, weather, palette, the one warm accent, and the camera (e.g. "ARRI Alexa 65, anamorphic lens, film grain").
- "hidden": one or two sentences: what fills the creature's place in the OPENING frame, when it is still hidden (e.g. "a towering wall of dense fog glowing faintly gold at its edges, a vast dark shadow barely visible deep inside"; "calm black water, a faint swell rising beside the boat"). Never any part of the creature's face.
- "motion": the 15-second video, 90-170 words: the camera move and the three beats of the reveal in order, ending on the final reveal frame, then a final sentence starting "Sound:" with the sound design building with the reveal (silence and wind, a deep rumble, the creature's growl or breath, a dark orchestral or choir swell). End with "No dialogue, no text." The creature keeps one exact design.
- "captionQuestion": one short question that gets comments ("Would you stand your ground?", "What would you say to it?").

OUTPUT (JSON only): { "concepts": [ { "title": "...", "creature": "...", "size": "...", "location": "...", "perspective": "...", "still": "...", "hidden": "...", "motion": "...", "captionQuestion": "..." }, ... ] }`;

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
  format?: CinematicFormat;
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
    system: CINEMATIC_FORMATS[opts.format ?? "encounter"].rules
      ? `${WRITER_SYSTEM}\n\n${CINEMATIC_FORMATS[opts.format ?? "encounter"].rules}`
      : WRITER_SYSTEM,
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
      hidden: str(c.hidden) || "dense, billowing fog filling that part of the frame, a faint vast shadow barely visible deep inside it",
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
  concepts: CinematicConcept[],
  format: CinematicFormat = "encounter"
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
      format: `one 15-second vertical cinematic video, no text: ${CINEMATIC_FORMATS[format].label}`,
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
  /** End frame (the reveal); omitted → Kling ends wherever the prompt takes it. */
  lastImageUrl?: string | null;
  prompt: string;
}): Promise<{ requestId: string; estimate: { credits?: string; usd?: string } | null }> {
  const turbo = opts.model.includes("v3.0-turbo");
  const body = turbo
    ? { prompt: turboEncounterPrompt(opts.prompt), image_url: opts.imageUrl, duration: CINEMATIC_SECONDS }
    : {
        prompt: opts.prompt,
        image_url: opts.imageUrl,
        duration: CINEMATIC_SECONDS,
        sound: "on",
        ...(opts.lastImageUrl ? { last_image_url: opts.lastImageUrl } : {}),
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
