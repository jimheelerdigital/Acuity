import type { HTMLAttributes, ReactNode } from "react";

/**
 * Acuity Card primitive — slice 1 web foundation.
 *
 * Per DESIGN_SYSTEM.md §5.15:
 *   - default: bg-acuity-card-bg, card-border hairline, radius lg (22)
 *              or xl (28), shadowSoft. Padding 16-20.
 *   - tinted:  bg-acuity-card-bg-tint, no shadow, no corner blob.
 *              For lists of grouped rows.
 *   - hero:    handled by a separate HeroCard primitive (out of slice
 *              1 scope — ships in the slice that needs it).
 *
 * Glow is NEVER applied to cards. Per §4.4 the glow rule reserves
 * glow for the mic FAB, recording orb, primary CTA, and Done button
 * only. If a consumer is reaching for a glowing card, the design is
 * wrong — talk to a designer before special-casing.
 */

type CardVariant = "default" | "tinted";
type CardRadius = "lg" | "xl";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  /** Default `xl` (28px) for hero contexts; pass `lg` for tighter
   *  grouped surfaces like list rows. */
  radius?: CardRadius;
  /** Override default padding. Numbers map to Tailwind p-{n}; pass
   *  null for zero padding when the card is a pure wrapper. */
  padding?: 4 | 5 | 6 | null;
  children: ReactNode;
}

const VARIANT_CLASS: Record<CardVariant, string> = {
  default:
    "bg-acuity-card-bg border border-acuity-card-border " +
    "shadow-acuity-soft",
  tinted: "bg-acuity-card-bg-tint border border-acuity-card-border",
};

const RADIUS_CLASS: Record<CardRadius, string> = {
  lg: "rounded-acuity-lg",
  xl: "rounded-acuity-xl",
};

const PADDING_CLASS: Record<NonNullable<CardProps["padding"]>, string> = {
  4: "p-4",
  5: "p-5",
  6: "p-6",
};

export function Card({
  variant = "default",
  radius = "xl",
  padding = 5,
  className = "",
  children,
  ...rest
}: CardProps) {
  const paddingClass = padding === null ? "" : PADDING_CLASS[padding];
  return (
    <div
      className={`${VARIANT_CLASS[variant]} ${RADIUS_CLASS[radius]} ${paddingClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
