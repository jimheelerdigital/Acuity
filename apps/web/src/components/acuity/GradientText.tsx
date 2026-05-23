import type { HTMLAttributes, ReactNode } from "react";

/**
 * Acuity GradientText — web mirror of `apps/mobile/components/acuity/
 * GradientText.tsx`. Per DESIGN_SYSTEM.md §5.8.
 *
 * Text rendered with a gradient fill via `background-clip: text`.
 * Mobile uses MaskedView + LinearGradient because RN doesn't support
 * the CSS clip-path. Web uses the native `background-image` +
 * `background-clip: text` + `-webkit-text-fill-color: transparent`
 * pattern — supported in every browser back to Safari 14 / Chrome 60.
 *
 * Use cases (per design):
 *   - Hero score numbers (Home / Insights ring centers)
 *   - Onboarding axis name in the question
 *   - TierPill level number
 *   - Ritual variant greeting
 *
 * Tabular nums: callers passing numeric content should add
 * `style={{ fontVariantNumeric: "tabular-nums" }}` so digits don't
 * jitter during count-up animation.
 */

export type GradientTextVariant = "primary" | "secondary" | "mix";

export interface GradientTextProps extends HTMLAttributes<HTMLSpanElement> {
  /** Which canonical gradient to use. Default `mix` (coral → violet). */
  variant?: GradientTextVariant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<GradientTextVariant, string> = {
  primary: "bg-acuity-grad-primary",
  secondary: "bg-acuity-grad-secondary",
  mix: "bg-acuity-grad-mix",
};

export function GradientText({
  variant = "mix",
  className = "",
  children,
  ...rest
}: GradientTextProps) {
  return (
    <span
      className={`inline-block bg-clip-text text-transparent ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
