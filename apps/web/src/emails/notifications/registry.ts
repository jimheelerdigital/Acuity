/**
 * Central registry for the smart-notifications email templates (PR 2).
 *
 * The engine calls renderNotification with a category, a variant index,
 * a tone, and the per-user var bag. We select the category's variant
 * array, index variantIndex % count (so any index is safe), and render.
 *
 * Only the three PR-2 categories are handled here: streak_preservation,
 * habit_reminder, milestone_celebration. The other categories
 * (goal/task/theme/life-area) are deferred to a later slice and throw.
 */

import type { NotificationCategory } from "@acuity/shared";

import { habitVariants } from "./habit";
import { milestoneVariants } from "./milestone";
import { streakVariants } from "./streak";
import type { NotifTone, NotifVariant, NotifVars, RenderedNotif } from "./types";

/** Variant arrays for the three PR-2 categories. */
const VARIANTS: Record<string, NotifVariant[]> = {
  streak_preservation: streakVariants,
  habit_reminder: habitVariants,
  milestone_celebration: milestoneVariants,
};

/** Number of variants per category. Exact shape per the PR-2 spec. */
export const NOTIFICATION_VARIANT_COUNTS: Record<string, number> = {
  streak_preservation: streakVariants.length,
  habit_reminder: habitVariants.length,
  milestone_celebration: milestoneVariants.length,
};

export function renderNotification(input: {
  category: NotificationCategory;
  variantIndex: number;
  tone: NotifTone;
  vars: NotifVars;
}): RenderedNotif {
  const { category, variantIndex, tone, vars } = input;

  const variants = VARIANTS[category];
  if (!variants) {
    throw new Error(
      `renderNotification: unsupported category "${category}". PR-2 supports only ` +
        `streak_preservation, habit_reminder, milestone_celebration.`,
    );
  }

  const count = variants.length;
  // Safe modulo for any integer index (including negatives).
  const idx = ((Math.trunc(variantIndex) % count) + count) % count;
  return variants[idx](tone, vars);
}

export type { NotifTone, NotifVars, RenderedNotif } from "./types";
