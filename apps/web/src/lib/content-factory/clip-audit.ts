/**
 * Mythicals clip audit (2026-10-27, per Keenan: "make the builds frame by
 * frame, and once you get it back, audit the post before moving to the next
 * frame. if it needs rebuilding, rebuild just those images").
 *
 * Each Kling clip is checked as soon as it comes back: six frames across the
 * clip go to Claude with the motion it was asked for, and a clip with a real
 * defect is re-rendered on its own (carousel-post-video.ts). Fails open:
 * if the audit itself can't run, the clip passes.
 */

import { contentAnthropic, lastJsonText, VISION_MODEL } from "./claude-client";

const SYSTEM = `You check short AI-generated video clips for Legendary Mythicals, an epic fantasy page, before they are posted. You see six frames from one clip, left to right in time; the first frame is the start picture. You also get the motion the clip was asked for.

FAIL the clip only for a defect a viewer would notice:
- a person, creature, object, fire or effect that is not in the first frame appears later (it arrives in the sky or background, steps in, materializes)
- a body changes: morphing, melting, extra or missing heads, limbs, wings or tails, a crest or horns growing, a face changing, armor or plates changing shape or turning into something else
- something detaches that shouldn't (flames tear off a torch, scales or plates fall away)
- fire, lava, fireballs, explosions, beams or liquid pouring from a mouth that the motion did not ask for
- a weapon bends, changes shape, swaps sides or hits the ground; a creature holds a weapon
- the main subject leaves the frame or is cut off by the edge, or the scene cuts to a different place
- a creature gets a human face

PASS anything else: natural movement, the asked-for action, brighter glows, embers, mist, dust, small camera moves, minor softness.

Return only JSON: {"pass": true|false, "problem": "<if it fails: what goes wrong, in which part of the clip, in one short sentence>"}`;

export interface ClipVerdict {
  pass: boolean;
  problem?: string;
  /** True when the audit couldn't run and the clip passed by default. */
  skipped?: boolean;
}

export async function auditMythicClip(opts: { clipUrl: string; motion: string }): Promise<ClipVerdict> {
  try {
    const res = await fetch(opts.clipUrl, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`clip fetch ${res.status}`);
    const { clipFrameStrip } = await import("./living-reel");
    const strip = await clipFrameStrip(Buffer.from(await res.arrayBuffer()));
    const response = await contentAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: strip.toString("base64") } },
            { type: "text", text: `The motion this clip was asked for: ${opts.motion || "(subtle ambient movement)"}` },
          ],
        },
      ],
    });
    const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const j = JSON.parse(lastJsonText(text)) as { pass?: boolean; problem?: string };
    if (j.pass === false) return { pass: false, problem: (j.problem ?? "a visible defect").trim().slice(0, 300) };
    return { pass: true };
  } catch (err) {
    console.warn(`[clip-audit] couldn't audit, passing the clip: ${err instanceof Error ? err.message : err}`);
    return { pass: true, skipped: true };
  }
}

/** Extra direction for a retake: the last take's problem, named so Kling avoids it. */
export function retakePrompt(prompt: string, problem: string): string {
  return `${prompt} RETAKE: the previous take of this shot failed because ${problem.replace(/\.$/, "")}. Avoid that completely. Keep the movement smaller and simpler, keep everything in the frame exactly as in the first frame, and add nothing new.`;
}
