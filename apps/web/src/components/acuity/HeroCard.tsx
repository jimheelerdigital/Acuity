import type { HTMLAttributes, ReactNode } from "react";

/**
 * Acuity HeroCard — web mirror of `apps/mobile/components/acuity/
 * HeroCard.tsx`. Per DESIGN_SYSTEM.md §5.2.
 *
 * Large gradient-backed card with an optional corner glow blob.
 * Three variants:
 *
 *   - primary:   gradPrimary corner blob over cardBgTint surface.
 *                Used for Home hero "Life Matrix" card, Profile
 *                identity hero, Entry detail pull-quote.
 *   - secondary: gradSecondary corner blob (cool variant).
 *   - mix:       full-bleed gradMix (no surface tint underneath).
 *                Used for the extract-review pull-quote and the
 *                Sunday-morning weekly-report priming card.
 *
 * Padding defaults to 20 (matches the mobile hero card spec).
 * Radius `xl` (28).
 *
 * On `primary` / `secondary`, the corner blob is a 240x180 absolutely
 * positioned div in the top-right with ~60% opacity. Mobile achieves
 * this with `LinearGradient + opacity`; web uses a `bg-acuity-grad-*`
 * div with the same dimensions. Functionally identical.
 */

type HeroCardVariant = "primary" | "secondary" | "mix";

export interface HeroCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: HeroCardVariant;
  /** Override default padding. Numbers map to Tailwind `p-{n}`. */
  padding?: 4 | 5 | 6 | 7 | 8;
  children: ReactNode;
}

const PADDING_CLASS: Record<NonNullable<HeroCardProps["padding"]>, string> = {
  4: "p-4",
  5: "p-5",
  6: "p-6",
  7: "p-7",
  8: "p-8",
};

export function HeroCard({
  variant = "primary",
  padding = 5,
  className = "",
  children,
  ...rest
}: HeroCardProps) {
  const paddingClass = PADDING_CLASS[padding];

  // Full-bleed gradient variant — no tinted surface, no corner blob.
  if (variant === "mix") {
    return (
      <div
        className={`relative overflow-hidden rounded-acuity-xl border border-acuity-card-border bg-acuity-grad-mix ${paddingClass} ${className}`}
        {...rest}
      >
        {children}
      </div>
    );
  }

  const blobClass =
    variant === "secondary"
      ? "bg-acuity-grad-secondary"
      : "bg-acuity-grad-primary";

  return (
    <div
      className={`relative overflow-hidden rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg-tint ${className}`}
      {...rest}
    >
      {/* Corner glow blob — `.acuity-hero-blob` CSS rule (tokens.css)
          renders 35% opacity in light mode and 60% in dark; the
          gradient at 60% reads aggressive against a white card
          surface. Slice 25 polish. `rounded-full` keeps the bleed
          soft. Pointer-events disabled so it doesn't intercept
          clicks on content. */}
      <div
        aria-hidden="true"
        className={`acuity-hero-blob pointer-events-none absolute -right-5 -top-5 h-[180px] w-[240px] rounded-full ${blobClass}`}
      />
      <div className={`relative ${paddingClass}`}>{children}</div>
    </div>
  );
}
