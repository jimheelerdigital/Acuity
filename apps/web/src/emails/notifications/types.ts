/**
 * Shared types for the smart-notifications email templates (PR 2).
 *
 * These are STATIC, no-AI emails. Each category exports an array of
 * variant renderers `(tone, vars) => RenderedNotif`. The engine picks
 * a variant by index and a tone, then renders subject + html. User
 * values (firstName, milestoneTitle, links) are HTML-escaped before
 * interpolation — see escapeHtml.
 *
 * Voice: mirror, not coach. Reflect, don't advise. No fixed-time
 * language, no recording-duration claims. See docs/acuity-positioning.md
 * and _design/DESIGN_SYSTEM.md §7.
 */

/** Voice of the copy. Mirrors NotificationTone in @acuity/shared. */
export type NotifTone = "caring" | "direct";

export interface NotifVars {
  firstName: string;
  /** Primary CTA link (open app / record). */
  appUrl: string;
  /** Link to notification settings. */
  manageUrl: string;
  /** Turn off all notification emails. */
  unsubscribeUrl: string;
  /** Turn off THIS category only. */
  categoryOptOutUrl: string;
  /** streak_preservation only. */
  streakCount?: number;
  /** milestone_celebration only. */
  milestoneTitle?: string;
}

export interface RenderedNotif {
  subject: string;
  html: string;
}

/** A single variant: switches phrasing on tone, returns subject + html. */
export type NotifVariant = (tone: NotifTone, vars: NotifVars) => RenderedNotif;
