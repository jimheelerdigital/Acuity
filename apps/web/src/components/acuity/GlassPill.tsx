import type { HTMLAttributes, ReactNode } from "react";

/**
 * Acuity GlassPill — web mirror of `apps/mobile/components/acuity/
 * GlassPill.tsx`. Per DESIGN_SYSTEM.md §5.7.
 *
 * Translucent surface for floating chrome. CSS `backdrop-filter`
 * delivers the blur natively in every browser we support (Safari
 * with `-webkit-` prefix on older versions; the tailwind
 * `backdrop-blur-*` utilities emit both forms).
 *
 * Use cases (per design):
 *   - Top-bar floating buttons (back / share / more)
 *   - Recording top "Cancel" + REC indicator pills
 *   - Sticky bottom action pill in extract review
 *
 * Default radius is `pill` (full rounded). Pass a Tailwind radius
 * class for the rare card-sized surface (e.g. `rounded-acuity-lg`).
 */

export type GlassPillTint = "dark" | "light" | "auto";

export interface GlassPillProps extends HTMLAttributes<HTMLDivElement> {
  /** Background tint base. `auto` picks dark when inside a
   *  `data-theme="dark"` ancestor (the common case). */
  tint?: GlassPillTint;
  /** Padding shorthand — `tight` (6/12), `default` (8/14), or
   *  `loose` (12/20). Or omit `padding` and pass your own className. */
  padding?: "tight" | "default" | "loose";
  /** Override the radius. Defaults to `rounded-acuity-pill`. */
  radiusClassName?: string;
  children: ReactNode;
}

const PADDING_CLASS: Record<NonNullable<GlassPillProps["padding"]>, string> = {
  tight: "px-3 py-1.5",
  default: "px-[14px] py-2",
  loose: "px-5 py-3",
};

export function GlassPill({
  tint = "auto",
  padding = "default",
  radiusClassName = "rounded-acuity-pill",
  className = "",
  children,
  ...rest
}: GlassPillProps) {
  // Tint: dark uses 6% white over blurred backdrop; light uses 4%
  // black. `auto` follows ancestor data-theme via CSS variable so a
  // single class works for both modes.
  const tintBg =
    tint === "dark"
      ? "bg-white/[0.06]"
      : tint === "light"
        ? "bg-black/[0.04]"
        // auto: rely on the `--acuity-line` token's mode flip — it
        // resolves to a low-alpha white on dark and low-alpha black
        // on light. Slightly different mechanic than mobile's
        // BlurView tint enum, but achieves the same visual.
        : "bg-acuity-line";

  return (
    <div
      className={`inline-flex items-center backdrop-blur-xl backdrop-saturate-150 border border-acuity-line-strong ${tintBg} ${radiusClassName} ${PADDING_CLASS[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
