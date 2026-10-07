/**
 * SHOT SHEETS for Legendary Mythicals videos (2026-10-06, per Keenan: "use
 * the following prompt as a guide to write excellent prompts in the exact
 * same format when we create our mythical beasts videos").
 *
 * Instead of a one-paragraph motion prompt, Opus looks at the start frame
 * and writes a structured JSON shot sheet in Keenan's reference format:
 * style, aspect_ratio, duration, environment_continuity, lighting,
 * character_continuity, weapon_continuity, shots[] (shot_number, duration,
 * framing, camera_motion, action, emotion, sound) and visual_constraints[].
 * The JSON itself is the Kling prompt.
 *
 * "single" = one continuous shot (5-10s clips: choice/How Big slides, egg
 * hatch; Keenan: "one frame of movement instead of multiple"). "multi" =
 * 3-4 cut shots (the 15s colossus video).
 *
 * Kling truncates prompts past 2,500 characters, so the sheet is written
 * dense and serialized without whitespace. Any failure returns null and the
 * caller keeps its old prompt.
 */
import { contentAnthropic, VISION_MODEL, lastJsonText } from "./claude-client";

export const SHOT_SHEET_MAX_CHARS = 2450;

/** The Mythicals look (dark epic, colossal, photoreal; the styles agreed 10-02 to 10-06). */
export const MYTHIC_STYLE =
  "Dark epic photoreal fantasy cinema: colossal, physically convincing mythical creatures and legendary armor with real weight, scale and texture; ancient weathered detail; brooding atmosphere, drifting mist and embers; deep shadows, warm rim light and restrained anamorphic highlights. Awe and menace, never cartoonish or bright.";
/** Fallback when the writer leaves style empty (short, so it can't blow the budget). */
const SHORT_STYLE = "Dark epic photoreal fantasy cinema: real weight and texture, mist and embers, deep shadows, warm rim light.";

export interface ShotSheetShot {
  shot_number: number;
  duration: string;
  framing: string;
  camera_motion: string;
  action: string;
  emotion: string;
  sound?: string;
}

export interface ShotSheet {
  style: string;
  aspect_ratio: string;
  duration: string;
  environment_continuity: string;
  lighting: string;
  character_continuity: Record<string, string>;
  weapon_continuity: string;
  shots: ShotSheetShot[];
  visual_constraints: string[];
}

/**
 * Standing rules on every Mythicals sheet, appended by code (compact set from
 * the Fable layout review: the long versions ate 41% of Kling's budget).
 */
const BASE_CONSTRAINTS = [
  "No text, logos or watermarks.",
  "No morphing: every creature, person and object keeps one exact design; no new creatures or people; the whole subject stays in frame.",
  "Real-time speed, no slow motion; the camera moves slowly and steadily.",
  "Effects: only dragon breath (fire or ice by type, snout raised to the sky, the column rising out of the top of the frame) and softly pulsing runes on armor or weapons, each matching the frame's light and materials. No auras, ghostfire, crawling lightning, glows or sparkles.",
];

/**
 * Layout designed by Claude Fable 5.1 (2026-10-06, per Keenan: "use fable to
 * design the script layout and then write it daily with opus"); Opus 5.5
 * writes the daily sheets from it. The JSON framework leads; the brief (the
 * old motion prompt) supplies the intent, never binding wording (Keenan:
 * "the new framework with the old script ideology").
 */
const SYSTEM = `You write SHOT SHEETS for Legendary Mythicals: one JSON object that is sent, unchanged, to an image-to-video model (Kling) together with the attached image. The image is the exact START FRAME. The JSON is the entire prompt, so every string in it is an instruction the video model executes literally. The sheet is the design; the brief is guidance.

WHAT YOU RECEIVE
- "Total duration" and the shot plan: ONE continuous shot with no cuts, or 3-4 cut shots.
- "Style": the house look.
- "What should happen": the BRIEF. It carries the intent: what kind of moment this is, the one clear action that carries it, measured motion at natural speed, a slow steady camera, which way breath goes, what to avoid. Slide briefs also contain a Scene sentence (the image wins over it) and a paragraph of standing rules (already covered by the standing rules; never copy it).
- "Standing rules": the hard rules for this video. Code appends them to visual_constraints after you answer; obey them, never copy them.
- Whether sound is on.

PRECEDENCE
1. The frame: what everything looks like, where it is, how it is lit.
2. The standing rules and the rules below: what may and may not happen.
3. The brief's intent: the moment and its one main action.
4. Your craft: the beats, their timing, the lens, the camera path.
The brief's wording is never binding. Design the shot yourself: restructure, sharpen, re-time and improve its beats so the frame reads as one real, weighty moment. If the brief asks for something the frame cannot do believably (a wingbeat on a wingless beast, a stride from a crouch) or a standing rule forbids, use the nearest permitted motion in that slot.

PROCEDURE (plan silently, in this order, then output only the JSON)
1. Read the frame. Inventory every subject with counts and materials: species or type; number of wings, legs, horns, tails; colors; scales, fur, metal, stone; eyes; marks; armor pieces; weapon and where it rests; pose; where the head and jaws point; what touches the ground. Note the environment, the light source with its direction and color, and what already glows or drifts (lit eyes, lava cracks, embers, mist). Existing glows are continuity: keep them as they are, at most a gentle pulse.
2. Lift the intent from the brief: the moment, the single main action, its direction, the camera character. Drop its wording.
3. Choose the beats: one main action plus small life around it. Every beat is a concrete physical event at real speed. 5s: 3 beats. 10s: 4-5 beats. 15s multi: 2-3 beats per shot. Beat 1 starts from the start pose; the last beat settles back to or near it.
4. Time the beats as ranges that cover the whole duration with no gaps ("0-1.5s:", "1.5-3s:"). Put the main action in the middle, with a preparation beat before it and a settle beat after.
5. Plan the camera: one slow steady move for the whole shot (push-in, drift, crane, tilt) with its direction and end state. Never static, never a whip, never shake.
6. Write continuity from the step-1 inventory: environment, lighting, each character, weapon or effect.
7. Write constraints: at most one shot-specific rule (or none). The standing rules are appended by code.
8. Budget and output: count against the limit, trim the longest fields first, then output.

FIELD SPEC (keys in exactly this order)
- "style": the given style compressed to one sentence of about 100 characters plus this subject's key material. Never empty.
- "aspect_ratio": "9:16".
- "duration": the given total, e.g. "5 seconds".
- "environment_continuity": the place as the frame shows it: terrain, structures, weather, scale cues, where the subject stands and what it touches. What must look identical at the end.
- "lighting": source, direction, color temperature, rim light, haze, exactly as in the frame, and how any new fire, ice or rune glow sits inside that light (a warm bounce on the chest, cold light under the jaw) so the effect belongs to the scene.
- "character_continuity": an object keyed by a snake_case name per subject. Each value lists what the frame shows: anatomy with counts ("exactly two wings, four legs, two horns"), colors, materials, eyes, marks, armor pieces, pose, mouth open or closed; end with "Preserve exactly." Counts and materials are what stop morphing; praise is wasted space.
- "weapon_continuity": the weapon, armor rune or breath and exactly how it behaves, in positive terms. Weapons: where they rest and stay (tip on the stone, hand on the grip); runes pulse softly inside the metal. Breath: its time window, its geometry (see BREATH), its color and how it is lit to match the frame. Nothing present: "No weapon." plus the one effect, or "No weapon, no effects."
- "shots": array of {"shot_number","duration","framing","camera_motion","action","emotion"SOUND_FIELD}. "duration" like "5s". "framing": shot size, angle and lens; shot 1 begins "Start frame:" and matches the image. "camera_motion": the one move with direction, speed and end state. "action": the timed beats, each a physical event. "emotion": 2-4 words for the feeling of the shot.
- "visual_constraints": an array with at most one short shot-specific rule, or empty. The standing rules are appended by code.

ACTION WRITING
- The video model executes every verb it reads. Write only what happens. Never name an unwanted action, even to forbid it: "no fire", "does not lunge", "without swinging" produce fire, a lunge, a swing. Prohibitions live only in visual_constraints.
- Concrete beats, not moods: "chest rises with one slow breath", "wind lifts the mane", "the eyelid lowers and lifts", "snow slides off the shoulder". Never "comes alive", "radiates power".
- Allowed motion: breathing; a blink; a slight head turn or tilt; wind in mane, feathers, cloak or banners; one slow wingbeat at most; dust, embers, mist, snow, water or sparks already in the frame drifting; a weapon resting; runes pulsing in armor or a weapon; dragon breath per BREATH. Nothing else moves. The subject keeps its stance and position.
- Real-time speed. Say "slow" and "steady" where it matters; never "slow motion".

BREATH (dragons only; fire or ice by the dragon's type)
Three separate beats, in this order, each in its own time range:
1. Raise: "head tilts back until the snout points straight up at the top of the frame" (frontal: add "throat and underside of the jaw toward the camera"; profile: "the neck arches up"), then "jaws open". At least 1s.
2. Burst: "a full burst of fire pours from the open jaws upward as a vertical column, rising past the horns and out of the top edge of the frame", lit like the frame's light. Ice: "a blast of glittering ice crystals and freezing mist rising as a vertical column". 1.5s in a 5s clip, 2-3s in a 10s clip. In this beat use only up, upward, rising, vertical, past the horns, top of the frame. Do not mention the ground, nest, water, camera, lens or any person in this beat at all.
3. End: "jaws close and the flame ends"; only then, in the next beat, "the head returns to the start pose". Never lower the head in a beat that names fire.
Repeat the window and the geometry in weapon_continuity. The flame may leave the top of the frame; the dragon never does. Straight out at the horizon is the lowest permitted angle; prefer straight up.

BLENDING
Any fire, ice, rune light, mist or ember matches the frame's color temperature, direction and materials and lights the subject the way a real source would (bounce on the chest, glow on the inner wings, cold light under the jaw). State this in lighting or weapon_continuity, not in action. Existing glows in the frame stay as they are.

MODES
- Single: exactly one shot whose duration equals the total; one camera move; no cuts.
- Multi (15s): 3 or 4 shots with hard cuts; durations sum exactly to the total. Shot 1 starts on the start frame. Later shots change size, angle and lens around the same subject in the same place. The continuity blocks describe the subject once, so each shot's action only says what moves. A colossal creature and any human keep the identical scale relationship in every shot.

SOUND (only when sound is on)
"sound": 2-4 effects in beat order, tied to the beats (breath, a crackle, wind, a roar, the rush of flame, settling embers), ending "No music, no speech." Effects only.

BUDGET (hard limit: your compact JSON must be at most BUDGET_CHARS characters; the standing rules are added after you answer and are not part of this)
Compact JSON has no spaces after colons or commas. Keys and punctuation cost about 150 characters, plus about 80 per shot. Allocate the rest roughly: action 25%, character_continuity 18%, weapon_continuity 14%, environment 11%, lighting 8%, style 8%, framing 5%, camera 3%, emotion 2%, sound 6% when on. Typical results:
- 5s slide: style 100, environment 160, lighting 130, characters 280, weapon 200, framing 65, camera 40, action 380, emotion 25.
- 10s hatch dragon with sound: style 120, environment 170, lighting 140, characters 300, weapon 230, framing 80, camera 60, action 420, emotion 30, sound 110.
- 15s multi, 3 shots, 2 characters: style 100, environment 140, lighting 110, characters 2 x 130, weapon 150; per shot framing 65, camera 40, action 135, emotion 20.
Trim by cutting adjectives and repeated nouns, never by dropping a beat's time range, a count in character_continuity or the breath geometry. Leave no field empty.

OUTPUT
JSON only: one object, no markdown fences, no commentary, no line breaks or double quotes inside strings, plain ASCII punctuation. Before you answer, check: shot 1 starts on the frame; shot durations sum to the total; every beat has a time range; no negation and no forbidden verb inside action or camera_motion; breath, if any, has raise, burst and end beats with upward geometry; counts in character_continuity match the image; the compact length is under the limit.`;

export async function writeShotSheet(opts: {
  mode: "single" | "multi";
  seconds: number;
  /** Kling 3.0 with sound on: each shot gets a "sound" line (effects only, no music, no speech). */
  sound: boolean;
  /** The start frame, as a public URL. */
  imageUrl: string;
  /** What should happen: the post's existing motion idea / scene notes. */
  brief: string;
  /** Lane-specific rules (e.g. the subtle-powers rule). */
  constraints?: string[];
}): Promise<string | null> {
  try {
    const res = await fetch(opts.imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`start frame fetch ${res.status}`);
    const img = Buffer.from(await res.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const small = await sharp(img).resize(768, 1365, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const rules = dedupeRules([...BASE_CONSTRAINTS, ...(opts.constraints ?? [])]);
    // Rules are appended by code, so the writer's own budget excludes them.
    const budget = SHOT_SHEET_MAX_CHARS - JSON.stringify(rules).length - 25;
    const shotsLine =
      opts.mode === "single"
        ? `ONE continuous shot of ${opts.seconds} seconds: a single camera move, no cuts.`
        : `3 or 4 shots totalling ${opts.seconds} seconds, with hard cuts between them (like a film trailer): shot 1 starts on the start frame; later shots change framing and lens around the same subject and place.`;
    const user = [
      `Total duration: ${opts.seconds} seconds. ${shotsLine}`,
      `Style: ${MYTHIC_STYLE}`,
      `What should happen: ${opts.brief.slice(0, 1500)}`,
      `Standing rules (appended by code; obey them, don't copy them):\n${rules.map((r) => `- ${r}`).join("\n")}`,
      opts.sound
        ? 'Each shot has a "sound" line: sound effects only (breath, growls, roars, wind, impacts), no music, no speech.'
        : "No sound field (this model renders silent video).",
    ].join("\n\n");
    let feedback = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 2500,
        effort: "medium",
        system: SYSTEM.replace("SOUND_FIELD", opts.sound ? ',"sound"' : "").replace("BUDGET_CHARS", String(budget)),
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } },
              { type: "text", text: user + feedback },
            ],
          },
        ],
      });
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const sheet = normalizeSheet(JSON.parse(lastJsonText(text)), opts, rules);
      const problem = sheetProblem(sheet, opts);
      const out = JSON.stringify(sheet);
      if (!problem && out.length <= SHOT_SHEET_MAX_CHARS) {
        console.log(`[shot-sheet] ok ${out.length} chars (${fieldSizes(sheet)})`);
        return out;
      }
      const own = out.length - JSON.stringify(rules).length;
      feedback = `\n\nYour previous sheet was rejected: ${problem ?? `your part was about ${own} characters, over your ${budget} budget. Field sizes: ${fieldSizes(sheet)}. Cut the largest fields first`}. Write it again.`;
      console.warn(`[shot-sheet] attempt ${attempt + 1} rejected: ${problem ?? `${out.length} chars (${fieldSizes(sheet)})`}`);
    }
    return null;
  } catch (err) {
    console.warn(`[shot-sheet] failed — using the old prompt: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

function normalizeSheet(raw: Partial<ShotSheet>, opts: { seconds: number; sound: boolean }, rules: string[]): ShotSheet {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const chars: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw.character_continuity ?? {})) if (str(v)) chars[k] = str(v);
  const extra = (raw.visual_constraints ?? []).map(str).filter(Boolean).slice(0, 1);
  const given = dedupeRules([...rules, ...extra]);
  return {
    style: str(raw.style) || SHORT_STYLE,
    aspect_ratio: "9:16",
    duration: `${opts.seconds} seconds`,
    environment_continuity: str(raw.environment_continuity),
    lighting: str(raw.lighting),
    character_continuity: chars,
    weapon_continuity: str(raw.weapon_continuity),
    shots: (raw.shots ?? []).map((s, i) => ({
      shot_number: i + 1,
      duration: str(s?.duration),
      framing: str(s?.framing),
      camera_motion: str(s?.camera_motion),
      action: str(s?.action),
      emotion: str(s?.emotion),
      ...(opts.sound && str(s?.sound) ? { sound: str(s?.sound) } : {}),
    })),
    visual_constraints: given,
  };
}

/** Why a sheet can't be used, or null. */
export function sheetProblem(sheet: ShotSheet, opts: { mode: "single" | "multi"; seconds: number }): string | null {
  if (!sheet.environment_continuity || !sheet.lighting) return "environment_continuity or lighting is empty";
  if (Object.keys(sheet.character_continuity).length === 0) return "character_continuity is empty";
  const n = sheet.shots.length;
  if (opts.mode === "single" && n !== 1) return `single mode needs exactly 1 shot, got ${n}`;
  if (opts.mode === "multi" && (n < 2 || n > 5)) return `multi mode needs 3-4 shots, got ${n}`;
  if (sheet.shots.some((s) => !s.action || !s.framing || !s.camera_motion)) return "a shot is missing framing, camera_motion or action";
  const total = sheet.shots.reduce((a, s) => a + (parseFloat(s.duration) || 0), 0);
  if (Math.abs(total - opts.seconds) > 0.5) return `shot durations add up to ${total}s, not ${opts.seconds}s`;
  // Kling executes every verb it reads (Fable layout review, 2026-10-06).
  for (const sh of sheet.shots) {
    const neg = `${sh.action} ${sh.camera_motion}`.match(/\b(no|not|never|without|doesn't|does not)\b/i);
    if (neg) return `shot ${sh.shot_number} action/camera_motion contains "${neg[0]}": write only what happens; prohibitions go in visual_constraints`;
    const verb = sh.action.match(/\b(lunges?|charges?|rears|rearing|leaps?|swings?|attacks?|strikes?|bites?|flies|takes? off)\b/i);
    if (verb) return `shot ${sh.shot_number} action contains the forbidden motion "${verb[0]}"`;
    const fire = sh.action.search(/\b(fire|flame|flames|ice breath|frost breath|blast of ice|ice crystals)\b/i);
    if (fire >= 0) {
      const raise = sh.action.search(/\b(tilts (its )?head back|snout points|raises its head|neck arches up|head tilts back)\b/i);
      if (raise < 0 || raise > fire) return `shot ${sh.shot_number}: the dragon must raise its head (snout pointing up at the top of the frame) in a beat BEFORE the breath`;
      const beats = sh.action.split(/(?=\d+(?:\.\d+)?-\d+(?:\.\d+)?s:)/);
      for (const b of beats) {
        if (/\b(fire|flame|flames|ice breath|frost breath|blast of ice|ice crystals)\b/i.test(b) && /\b(down|downward|downwards|ground|nest|water|camera|lens)\b/i.test(b))
          return `shot ${sh.shot_number}: the breath beat mentions a downward direction or the ground/nest/water/camera; use only up, upward, rising, vertical, top of the frame`;
      }
    }
  }
  if (/\b(downward|downwards|at the ground|at the camera|at the lens|into the nest|at the water)\b/i.test(sheet.weapon_continuity))
    return "weapon_continuity sends the breath downward or at the camera; breath rises up out of the top of the frame";
  return null;
}

/** Same rule twice (exact or paraphrase-identical once normalized) only once. */
function dedupeRules(rules: string[]): string[] {
  const seen = new Set<string>();
  return rules.filter((r) => {
    const k = r.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function fieldSizes(sheet: ShotSheet): string {
  const len = (v: unknown) => JSON.stringify(v).length;
  return [
    `style ${len(sheet.style)}`,
    `environment ${len(sheet.environment_continuity)}`,
    `lighting ${len(sheet.lighting)}`,
    `characters ${len(sheet.character_continuity)}`,
    `weapon ${len(sheet.weapon_continuity)}`,
    `shots ${len(sheet.shots)}`,
  ].join(", ");
}

/** Mythicals slide motion rule (2026-10-06, per Keenan: subtle, nothing over the top). */
export const SUBTLE_MOTION_RULES = [
  "Subtle: the subject holds its pose (breathing, a blink or slight head turn, wind in mane or cloak, one slow wingbeat at most). No attacks, swings, rearing, charging or lunging; a creature never holds a weapon.",
];
