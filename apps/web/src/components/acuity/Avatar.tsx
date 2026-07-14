/**
 * Ripple Avatar — web mirror of `apps/mobile/components/acuity/Avatar.tsx`.
 * Slice 1 web foundation.
 *
 * Per DESIGN_SYSTEM.md §5.1: gradient circle with initial. `gradMix`
 * linear gradient background, white initial glyph centered, optional
 * 1.5px white-tint border at #ffffff26 for separation against hero
 * backgrounds.
 *
 * Sizes: 44 (home greeting variant), 64 (profile identity hero). Custom
 * sizes are allowed for one-off needs but should be rare — most
 * surfaces want one of the canonical two.
 *
 * Initial font size defaults to ~38% of pixel size, matches mobile.
 */

import type { HTMLAttributes } from "react";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  initials: string;
  /** Pixel size of the circle. Default 44 (Home variant). */
  size?: number;
  /** Show the white-tint separator border. Default true. */
  border?: boolean;
  /** Override the initial font size. Defaults to ~38% of `size`. */
  initialFontSize?: number;
}

export function Avatar({
  initials,
  size = 44,
  border = true,
  initialFontSize,
  className = "",
  style,
  ...rest
}: AvatarProps) {
  const fontSize = initialFontSize ?? Math.round(size * 0.38);
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-acuity-grad-mix ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: border ? 1.5 : 0,
        borderStyle: border ? "solid" : "none",
        // Matches mobile's #ffffff26 (~15% alpha white tint).
        borderColor: border ? "rgba(255,255,255,0.15)" : "transparent",
        ...style,
      }}
      {...rest}
    >
      <span
        className="font-display font-bold tracking-[-0.3px] text-white"
        style={{ fontSize, lineHeight: 1 }}
      >
        {initials}
      </span>
    </div>
  );
}
