/**
 * Ripple SubscriptionPill — web mirror of `apps/mobile/components/
 * acuity/SubscriptionPill.tsx`. Slice 1 web foundation.
 *
 * Per DESIGN_SYSTEM.md §5.3: subscription state badge.
 *   - PRO: gradMix fill, sparkle icon, 9pt mono uppercase white label.
 *          Focal point. Never demote it visually.
 *   - TRIAL: good-soft fill, good hairline, mint mono label. Reads as
 *            "active + positive" without competing with PRO.
 *   - FREE / PAST_DUE / CANCELED: quiet pill — bg-sub fill, line
 *            border, text-ter mono uppercase. Deprioritized so PRO
 *            stays focal when both are on screen.
 *
 * Inline SVG sparkle (8 strokes radiating from center) matches the
 * mobile Ionicons "sparkles" glyph at size 10 closely enough. We do
 * NOT pull a full icon library for this single primitive.
 */

import type { HTMLAttributes } from "react";

export type SubscriptionStatus =
  | "FREE"
  | "PRO"
  | "TRIAL"
  | "PAST_DUE"
  | "CANCELED";

export interface SubscriptionPillProps
  extends HTMLAttributes<HTMLSpanElement> {
  status: SubscriptionStatus;
  /** Custom label override. Defaults to a spec-aligned status name. */
  label?: string;
  /**
   * Trial-only urgency input (slice 6, 2026-05-25). When `status==="TRIAL"`
   * and this is set, the pill shifts visual treatment based on days
   * remaining: gradient-mix tint at 4-7 days, warn-amber at 1-3 days.
   * Pure presentation; the caller computes the count from
   * (user.trialEndsAt - now).
   */
  daysRemaining?: number;
  /**
   * When true, force the "TRIAL ENDED" variant regardless of `status`.
   * Used by surfaces that detect a recent FREE-post-expiry transition
   * (`subscriptionStatus==="FREE"` AND `trialExpiredAt` recent) and
   * want to keep the pill expressive for ~14 days afterward.
   */
  trialEnded?: boolean;
}

const DEFAULT_LABELS: Record<SubscriptionStatus, string> = {
  FREE: "Free Plan",
  PRO: "Pro",
  TRIAL: "Trial",
  PAST_DUE: "Past Due",
  CANCELED: "Canceled",
};

const SHARED_INNER =
  "flex items-center gap-[5px] rounded-acuity-pill " +
  "px-[10px] py-1 font-mono text-[9px] font-bold uppercase " +
  "tracking-[1.2px]";

function SparkleGlyph({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SubscriptionPill({
  status,
  label,
  daysRemaining,
  trialEnded,
  className = "",
  ...rest
}: SubscriptionPillProps) {
  const text = label ?? DEFAULT_LABELS[status];

  // Post-expiry "TRIAL ENDED" — wins over any status. Surfaces in the
  // FREE-post-expiry window (~14 days after trialExpiredAt) carry this
  // flag so the pill stays expressive instead of silently dropping to
  // "Free Plan".
  if (trialEnded) {
    const endedLabel = label ?? "Trial ended";
    return (
      <span
        className={`inline-flex self-start items-center rounded-acuity-pill px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] ${className}`}
        style={{
          color: "var(--acuity-warn)",
          backgroundColor: "color-mix(in oklch, var(--acuity-warn), transparent 88%)",
          borderWidth: 0.5,
          borderStyle: "solid",
          borderColor: "var(--acuity-warn)",
        }}
        {...rest}
      >
        {endedLabel}
      </span>
    );
  }

  if (status === "PRO") {
    return (
      <span
        className={`inline-flex self-start overflow-hidden rounded-acuity-pill bg-acuity-grad-mix ${className}`}
        {...rest}
      >
        <span className={`${SHARED_INNER} text-white`}>
          <SparkleGlyph color="#ffffff" />
          {text}
        </span>
      </span>
    );
  }

  if (status === "TRIAL") {
    // Urgency tinting kicks in only when caller supplies daysRemaining.
    // Without it we render the legacy mint "Trial" pill — preserves the
    // existing behavior of any consumer that hasn't opted in to slice 6.
    if (typeof daysRemaining === "number") {
      if (daysRemaining <= 0) {
        // Trial ended but caller passed status=TRIAL anyway (cron not
        // yet flipped). Treat as ended for visual consistency.
        const endedLabel = label ?? "Trial ended";
        return (
          <span
            className={`inline-flex self-start items-center rounded-acuity-pill px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] ${className}`}
            style={{
              color: "var(--acuity-warn)",
              backgroundColor: "color-mix(in oklch, var(--acuity-warn), transparent 88%)",
              borderWidth: 0.5,
              borderStyle: "solid",
              borderColor: "var(--acuity-warn)",
            }}
            {...rest}
          >
            {endedLabel}
          </span>
        );
      }
      const countLabel = `Trial · ${daysRemaining}d`;
      const finalLabel = label ?? countLabel;
      if (daysRemaining <= 3) {
        // Urgent — warn-amber tint, hairline. Visible but not banner-yell.
        return (
          <span
            className={`inline-flex self-start items-center rounded-acuity-pill px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] ${className}`}
            style={{
              color: "var(--acuity-warn)",
              backgroundColor: "color-mix(in oklch, var(--acuity-warn), transparent 88%)",
              borderWidth: 0.5,
              borderStyle: "solid",
              borderColor: "var(--acuity-warn)",
            }}
            {...rest}
          >
            {finalLabel}
          </span>
        );
      }
      if (daysRemaining <= 7) {
        // Mid-trial — gradMix fill, white text. Reads as "active +
        // approaching" without screaming.
        return (
          <span
            className={`inline-flex self-start overflow-hidden rounded-acuity-pill bg-acuity-grad-mix ${className}`}
            {...rest}
          >
            <span className={`${SHARED_INNER} text-white`}>{finalLabel}</span>
          </span>
        );
      }
      // > 7 days remaining — legacy mint pill, with the day count.
      return (
        <span
          className={`inline-flex self-start items-center gap-[5px] rounded-acuity-pill bg-acuity-good-soft px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-acuity-good ${className}`}
          style={{ borderWidth: 0.5, borderStyle: "solid", borderColor: "var(--acuity-good)" }}
          {...rest}
        >
          {finalLabel}
        </span>
      );
    }
    // No daysRemaining provided — legacy "Trial" pill.
    return (
      <span
        className={`inline-flex self-start items-center gap-[5px] rounded-acuity-pill bg-acuity-good-soft px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-acuity-good ${className}`}
        style={{ borderWidth: 0.5, borderStyle: "solid", borderColor: "var(--acuity-good)" }}
        {...rest}
      >
        {text}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex self-start items-center rounded-acuity-pill bg-acuity-bg-sub px-[10px] py-1 font-mono text-[9px] font-bold uppercase tracking-[1.2px] text-acuity-text-ter ${className}`}
      style={{ borderWidth: 0.5, borderStyle: "solid", borderColor: "var(--acuity-line)" }}
      {...rest}
    >
      {text}
    </span>
  );
}
