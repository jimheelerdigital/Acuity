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

/** Rules every Mythicals sheet carries (motion rules agreed 2026-09-29 to 10-05). */
const BASE_CONSTRAINTS = [
  "No text, letters, logos or watermarks anywhere.",
  "No morphing, warping, melting or design changes; every creature, person and object keeps one exact design.",
  "Real-time speed, no slow motion, no repeated actions.",
  "The main subject stays fully inside the frame.",
  "No new creatures or people beyond those described.",
];

const SYSTEM = `You write SHOT SHEETS: structured JSON prompts for an image-to-video model (Kling). The attached image is the exact START FRAME of the video. Write a sheet that brings it to life as a breathtaking, cinematic shot.

Output ONE JSON object with exactly these keys, in this order:
- "style": use the given style text (you may add 1 short clause specific to this subject).
- "aspect_ratio": "9:16".
- "duration": the given total, e.g. "5 seconds".
- "environment_continuity": the place exactly as it appears in the frame: terrain, structures, weather, scale cues, where the subject stands. What must stay consistent.
- "lighting": light source and direction, color temperature, rim light, haze, as seen in the frame; keep it consistent.
- "character_continuity": an object keyed by snake_case character name, each a precise description of that character AS IT APPEARS IN THE IMAGE (anatomy, size, colors, materials, horns, wings, armor, eyes, distinguishing marks) and "preserve ... throughout".
- "weapon_continuity": the weapon, armor, power or prop and exactly how it behaves (e.g. fire breath: where it goes, when it starts and stops). If none, say what stays absent.
- "shots": array of shots, each {"shot_number","duration","framing" (shot size + lens, e.g. "low full-body, 24mm lens"),"camera_motion","action" (beat by beat, with timings for longer shots),"emotion"SOUND_FIELD}. Shot durations must add up exactly to the total.
- "visual_constraints": array of short hard rules (include every given rule, plus any specific to this shot).

Rules:
- Shot 1 must START on the exact start frame: same subject, pose, framing and place. Describe only motion that is physically believable for this subject.
- Make the action specific and cinematic: concrete physical beats (breath fogging, scales catching light, muscles shifting, dust lifting, embers drifting), never vague words like "comes alive".
- Write dense, precise prose. The whole JSON must stay under ${SHOT_SHEET_MAX_CHARS} characters: this is a hard limit.
- JSON only, no markdown fences.`;

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
    const rules = [...BASE_CONSTRAINTS, ...(opts.constraints ?? [])];
    const shotsLine =
      opts.mode === "single"
        ? `ONE continuous shot of ${opts.seconds} seconds: a single camera move, no cuts.`
        : `3 or 4 shots totalling ${opts.seconds} seconds, with hard cuts between them (like a film trailer): shot 1 starts on the start frame; later shots change framing and lens around the same subject and place.`;
    const user = [
      `Total duration: ${opts.seconds} seconds. ${shotsLine}`,
      `Style: ${MYTHIC_STYLE}`,
      `What should happen: ${opts.brief.slice(0, 1500)}`,
      `Rules to include in visual_constraints:\n${rules.map((r) => `- ${r}`).join("\n")}`,
      opts.sound
        ? 'Each shot has a "sound" line: sound effects only (breath, growls, roars, wind, impacts, crackling fire), no music, no speech.'
        : "No sound field (this model renders silent video).",
    ].join("\n\n");
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 2500,
        effort: "medium",
        system: SYSTEM.replace("SOUND_FIELD", opts.sound ? ',"sound"' : ""),
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
      if (!problem && out.length <= SHOT_SHEET_MAX_CHARS) return out;
      feedback = `\n\nYour previous sheet was rejected: ${problem ?? `it was ${out.length} characters, over the ${SHOT_SHEET_MAX_CHARS} limit; write every field tighter`}. Write it again.`;
      console.warn(`[shot-sheet] attempt ${attempt + 1} rejected: ${problem ?? `${out.length} chars`}`);
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
  const given = new Set((raw.visual_constraints ?? []).map(str).filter(Boolean));
  for (const r of rules) given.add(r);
  return {
    style: str(raw.style) || MYTHIC_STYLE,
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
    visual_constraints: [...given],
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
  return null;
}

/** Subtle-powers rule for Mythicals slides (living-reel.ts action mode, 2026-10-05). */
export const SUBTLE_POWER_RULES = [
  "Keep it subtle: the subject holds its pose (slow breathing, a slight head turn or blink at most).",
  "Powers are small effects on the subject: glowing eyes or runes, embers, flames licking along armor or a blade, frost mist, faint lightning.",
  "The only big actions allowed are slow powerful wingbeats and breathing fire or ice into the sky or landscape, never at a person.",
  "No attacks, swings, rearing, charging or lunging. A creature never holds or uses a weapon.",
  "Camera moves slowly and steadily.",
];
