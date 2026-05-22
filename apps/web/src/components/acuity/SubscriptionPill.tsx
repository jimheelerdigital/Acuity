/**
 * Acuity SubscriptionPill — web mirror of `apps/mobile/components/
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
  className = "",
  ...rest
}: SubscriptionPillProps) {
  const text = label ?? DEFAULT_LABELS[status];

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
