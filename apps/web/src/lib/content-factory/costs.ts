/**
 * Content Factory — generation cost estimates (2026-08-18, per Keenan:
 * the dashboard undercounted real spend because Higgsfield clips were
 * invisible; now every format's estimate includes its video renders).
 *
 * These are ESTIMATES for the admin dashboard, not billing records:
 * - gpt-image-2 slide: ~8¢/image (observed average)
 * - Higgsfield clip: 2 credits/clip; on the $5/100-credit top-up that's
 *   ~5¢/credit → 10¢/clip. Override with HIGGSFIELD_CLIP_COST_CENTS if
 *   the plan's effective credit price differs.
 * - ElevenLabs voiceover: a ~75-word script is ~450 characters — roughly
 *   10¢ on the Creator tier. Override with TTS_COST_CENTS.
 * - Claude script/topic call: ~2¢ (logged precisely in ClaudeCallLog;
 *   this flat figure keeps the per-post estimate honest).
 */

export const IMAGE_COST_CENTS = 8;
export const CLAUDE_CALL_COST_CENTS = 2;

/** Cost of one Higgsfield clip render (2 credits). */
export function clipCostCents(): number {
  const c = Number(process.env.HIGGSFIELD_CLIP_COST_CENTS);
  return Number.isFinite(c) && c >= 0 ? c : 10;
}

/** Cost of one full-script ElevenLabs voiceover. */
export function ttsCostCents(): number {
  const c = Number(process.env.TTS_COST_CENTS);
  return Number.isFinite(c) && c >= 0 ? c : 10;
}

export type CostFormat = "PHOTO" | "VIDEO" | "STORY" | "AMBIENT";

/**
 * Estimate what one post cost to generate, from its format and slides.
 * Slide counts exclude legacy CTA slides (composed, not generated).
 *
 * - PHOTO:   images only
 * - VIDEO:   every slide is also animated (one clip per slide)
 * - STORY:   every scene slide is animated + one voiceover (format dead
 *            since 2026-08-24 — kept for historical posts)
 * - AMBIENT: one image, one clip. No TTS since 2026-08-24 (Keenan voices
 *            calm posts himself) — slightly undercounts pre-change posts.
 */
export function estimatePostCostCents(post: {
  format: string;
  slides: { kind: string }[];
}): number {
  const generated = post.slides.filter((s) => s.kind !== "CTA").length;
  const images = generated * IMAGE_COST_CENTS;
  switch (post.format as CostFormat) {
    case "VIDEO":
      return images + generated * clipCostCents() + CLAUDE_CALL_COST_CENTS;
    case "STORY":
      return (
        images + generated * clipCostCents() + ttsCostCents() + CLAUDE_CALL_COST_CENTS
      );
    case "AMBIENT":
      return images + clipCostCents() + CLAUDE_CALL_COST_CENTS;
    case "PHOTO":
    default:
      return images + CLAUDE_CALL_COST_CENTS;
  }
}
