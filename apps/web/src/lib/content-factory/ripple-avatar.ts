/**
 * Ripple's cover avatar (2026-10-15, per Keenan: "for all ripple posts - no
 * more selfie... it should be a picture of a women who's our avatar walking in
 * a scenic area away from the camera"; "just the cover").
 *
 * The selfie lane's cover ONLY (the list lane keeps scenery; 2026-10-15
 * correction) is the SAME woman, seen from
 * behind, walking away from the camera through a scenic place. Identity
 * carries across posts by passing her latest cover as the reference image.
 * The marker line lets the animator and the anchor lookup recognize these.
 */

export const RIPPLE_AVATAR_MARKER = "RIPPLE AVATAR WALK";

/** The original selfie-era avatar (SELFIE_PERSONAS "brunette-greying"). */
export const RIPPLE_AVATAR_LOOK =
  "a woman in her mid-40s with shoulder-length brown hair with natural greying strands, light skin and an average, realistic build, in everyday clothes (a soft sweater, cardigan or light jacket, jeans or leggings, sneakers or boots)";

export function buildAvatarWalkPrompt(opts: { scene: string; setting?: string; hasReference: boolean }): string {
  return [
    `${RIPPLE_AVATAR_MARKER}`,
    `Scene (follow exactly): ${opts.scene}`,
    opts.setting ? `Setting and palette: ${opts.setting}.` : "",
    opts.hasReference
      ? "From the reference image take ONLY the woman's identity: the same hair, build and overall look. Take NOTHING else from it (not the pose, place, framing or light)."
      : "",
    `THE WOMAN: ${RIPPLE_AVATAR_LOOK}. She is seen FROM BEHIND, walking AWAY from the camera mid-stride, small to mid-size in the frame (the place matters as much as she does), alone. Her face is NEVER visible. She is not posing and does not look back.`,
    "PHOTO: a breathtaking, real photograph of a beautiful place, natural light (golden hour, soft morning, misty, crisp winter light), true color, crisp detail, real depth. It must look like a genuine photograph, never a render or painting. Leave calm open space (sky, mist, water or snow) in the upper third for text.",
    "NO other people, NO animals in focus, NO text, letters, signs or logos.",
    "9:16 vertical portrait.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Her most recent avatar cover (text-free), used as the identity reference. */
export async function latestAvatarCoverUrl(): Promise<string | null> {
  const { prisma } = await import("@/lib/prisma");
  const slide = await prisma.carouselSlide.findFirst({
    where: {
      order: 0,
      rawImageUrl: { not: null },
      imagePrompt: { contains: RIPPLE_AVATAR_MARKER },
      carouselPost: { lane: "selfie" },
    },
    orderBy: { createdAt: "desc" },
    select: { rawImageUrl: true },
  });
  return slide?.rawImageUrl ?? null;
}

/** Animation line for her cover clip: she keeps walking, the place moves. */
export const AVATAR_WALK_MOTION =
  "The woman keeps walking away from the camera at a natural, unhurried pace, her hair and clothes moving in the breeze; we never see her face and she never turns around. The place moves around her naturally (light, wind in grass or trees, water, mist, falling snow or leaves).";
