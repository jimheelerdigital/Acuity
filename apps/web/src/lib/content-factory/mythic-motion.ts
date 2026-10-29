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
 * picture. Since the evening of 10-27 only two things are hard limits
 * (nothing appears that isn't in the frame; no catches, landings or
 * mounting), and bold action and powers are welcome otherwise (Keenan: "we
 * need less stringent restrictions"). A phrase check backs it up; if both
 * fail, the clip gets a safe ambient motion instead of the blind one.
 */

import { contentAnthropic, lastJsonText, VISION_MODEL } from "./claude-client";

const SYSTEM = `You direct short image-to-video clips (Kling) for Legendary Mythicals, an epic fantasy page. The image you are given is the EXACT first frame of the clip. You get the planned motion, written before the picture existed. Rewrite it so it works on THIS picture.

Rules (loosened 2026-10-27 per Keenan: "we need less stringent restrictions"; only the two that caused real glitches are hard limits):
- HARD LIMIT: only animate what you can SEE in the frame. If the plan mentions a person, creature, rider, weapon or object that isn't clearly visible, drop that part. Nothing new enters, appears or materializes during the clip, because Kling invents it and warps everything around it.
- HARD LIMIT: no catching, landing on, leaping onto or mounting another figure, and no one figure lifting another. Kling can't time two figures meeting.
- Otherwise keep the plan's energy. Bold, cinematic action is welcome when the subject is in the picture: a beast rears up and roars, charges a few heavy strides, spreads its wings wide and beats them; a dragon breathes a long jet of fire; a warrior swings his blade or raises his shield; both figures can act at once.
- Powers and effects are welcome on what's in the picture: fire breath, flames along a blade or armor, glowing runes and eyes, embers, frost, lightning across horns or steel.
- Dragon fire must be obvious (2026-10-29, Keenan). When a dragon breathes, say so plainly and make it the clip's main beat: jaws open wide, a thick, bright jet of fire (or ice) pours from its mouth for at least two seconds, out into the sky or landscape. Never a faint wisp or a puff.
- A weapon keeps its shape; a creature doesn't hold a weapon. The camera is steady or makes a slow push-in.
- If the plan already fits the picture, return it almost unchanged.

Return only JSON: {"visible": "<the subjects you actually see, in a few words>", "motion": "<ONE sentence, 20-50 words, describing the movement>"}`;

/** Phrases that mean a rewrite still asks Kling for something it can't do. */
const RISKY = [
  /\b(catch|catches|caught|catching)\b/i,
  /\b(lands?|landing)\s+(on|onto)\b/i,
  /\b(leaps?|jumps?|climbs?)\s+(onto|on to|up onto)\b/i,
  /\b(mounts?|mounting)\b/i,
  /\b(appears?|appearing|emerges?|emerging|materiali[sz]es?|enters?\s+the\s+frame|steps?\s+into\s+(the\s+)?frame|comes?\s+into\s+view)\b/i,
]

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
