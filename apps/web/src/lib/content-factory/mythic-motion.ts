/**
 * Picture-grounded clip motion for Legendary Mythicals (2026-10-27, per
 * Keenan: "the last mythicals post had a ton of animation issues (which beast
 * would your bro turn into?) ... figure out why, and permanently fix").
 *
 * What went wrong: the MOTION line is written with the post, before any
 * picture exists, and nothing checked it against the start frame. On that
 * post three option images left out the companion the scene named (the
 * knight, the raider, the warlord), yet the motion told Kling to animate
 * him, so Kling conjured him mid-clip and warped the beast to make room.
 * Another asked for a mid-air catch (a rider leaping onto a flying wyvern),
 * which Kling can't do. The cover asked torch flames to "bend one after
 * another", and they tore off the torches and floated.
 *
 * The fix: before every Mythicals clip, Claude looks at the actual start
 * frame and rewrites the motion so it only moves what is really in the
 * picture, in the measured best-era style (2026-10-13). A phrase check backs
 * it up, and if both fail the clip gets a safe ambient motion instead of the
 * blind one.
 */

import { contentAnthropic, lastJsonText, VISION_MODEL } from "./claude-client";

const SYSTEM = `You direct short image-to-video clips (Kling) for Legendary Mythicals, an epic fantasy page. The image you are given is the EXACT first frame of the clip. You get the planned motion, written before the picture existed. Rewrite it so it works on THIS picture.

Rules, and why (each one is a failure we have shipped):
- Only animate what you can SEE in the frame. If the plan mentions a person, creature, rider, weapon or object that is not clearly visible, drop that part completely. Nothing enters the frame, appears, materializes or is revealed during the clip, because Kling invents it on the spot and warps everything around it.
- ONE main movement by the main subject, measured and believable at real speed (a dragon lifts its head and breathes a jet of fire into the sky; wings open and beat once; a beast takes two or three heavy steps; a warrior shifts his stance and swings the blade through the air). Any second figure only makes small movements: breathing, a cloak or hair in the wind, a tighter grip, a slight turn of the head.
- No interactions that need contact or timing between two figures: no catching, landing, mounting, leaping onto, grabbing, or one figure lifting another.
- No big pose changes that show body parts the picture doesn't (rearing onto hind legs, standing up, turning fully around, folding into a new shape).
- Nothing transforms or grows: armor, plates, scales, crests, horns, wings, tails and heads stay exactly as drawn, attached and unchanged. Glow may brighten (eyes, runes, embers).
- Flames stay on their source (torch, brazier, blade, breath); they flicker and lean but never detach or float away.
- A weapon keeps its exact shape and never hits the ground; a creature never holds a weapon.
- Living atmosphere is welcome: mist, embers, dust, snow, rain, water, banners, cloaks. The camera is steady or makes one slow, gentle push-in.

Return only JSON: {"visible": "<the subjects you actually see, in a few words>", "motion": "<ONE sentence, 20-45 words, describing the movement>"}`;

/** Phrases that mean a rewrite still asks Kling for something it can't do. */
const RISKY = [
  /\b(catch|catches|caught|catching)\b/i,
  /\b(lands?|landing)\s+(on|onto)\b/i,
  /\b(leaps?|jumps?|climbs?|swings?)\s+(onto|on to|up onto)\b/i,
  /\b(mounts?|mounting)\b/i,
  /\b(appears?|appearing|emerges?|emerging|materiali[sz]es?|enters?\s+the\s+frame|steps?\s+into\s+(the\s+)?frame|comes?\s+into\s+view|is\s+revealed)\b/i,
  /\b(transforms?|transforming|morphs?|morphing|turns?\s+into|grows?|growing|sprouts?|sprouting)\b/i,
  /\b(rears?|rearing)\s+(up|onto|on)\b/i,
  /\b(stands?\s+up|rises?\s+onto\s+its\s+hind\s+legs)\b/i,
  /\b(flames?|fire)\b[^.]*\b(detach|break\s+free|fly\s+off|float\s+away|leap\s+off)\b/i,
];

export function riskyMotion(motion: string): string | null {
  for (const re of RISKY) {
    const m = motion.match(re);
    if (m) return m[0];
  }
  return null;
}

/** Used when the picture can't be checked: moves only what every frame has. */
export const SAFE_MYTHIC_MOTION =
  "the main subject holds its pose and breathes slowly, its eyes and any runes or embers glowing a little brighter, while mist, dust and embers drift through the air around it and the camera makes one slow, gentle push-in";

/**
 * Rewrite a clip's planned motion against its real start frame. Returns the
 * grounded motion, or SAFE_MYTHIC_MOTION when the check fails twice or the
 * call errors. Never throws.
 */
export async function groundMythicMotion(opts: { imageUrl: string; motion: string; seconds: number; isCover?: boolean }): Promise<{ motion: string; visible?: string; source: "grounded" | "safe" }> {
  try {
    const res = await fetch(opts.imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`start frame fetch ${res.status}`);
    const { default: sharp } = await import("sharp");
    const small = await sharp(Buffer.from(await res.arrayBuffer())).resize(768, 1365, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const brief = [
      `Clip length: ${opts.seconds} seconds.`,
      opts.isCover
        ? "This is the COVER clip: building anticipation. The hero moves (walks forward or turns his head); only small things move around him; whatever is hidden stays hidden to the last frame."
        : "This is one option in a pick-one post.",
      `Planned motion (written before the picture existed): ${opts.motion || "(none)"}`,
    ].join("\n");
    let feedback = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 600,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } },
              { type: "text", text: brief + feedback },
            ],
          },
        ],
      });
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      const parsed = JSON.parse(lastJsonText(text)) as { visible?: string; motion?: string };
      const motion = (parsed.motion ?? "").trim();
      const risky = motion ? riskyMotion(motion) : "empty";
      if (motion.length >= 20 && !risky) {
        console.log(`[mythic-motion] grounded (sees: ${parsed.visible ?? "?"}): ${motion}`);
        return { motion, visible: parsed.visible, source: "grounded" };
      }
      feedback = `\n\nYour last answer was rejected because it asks for "${risky}", which Kling can't do on this picture. Write it again within the rules.`;
      console.warn(`[mythic-motion] attempt ${attempt + 1} rejected (${risky}): ${motion}`);
    }
  } catch (err) {
    console.warn(`[mythic-motion] check failed, using the safe motion: ${err instanceof Error ? err.message : err}`);
  }
  return { motion: SAFE_MYTHIC_MOTION, source: "safe" };
}
