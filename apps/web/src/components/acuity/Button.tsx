"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

/**
 * Acuity Button primitive — slice 1 web foundation.
 *
 * Per DESIGN_SYSTEM.md §5.14:
 *   - primary:     gradPrimary fill, white text, rounded-full,
 *                  hover brightens, active scale 0.98.
 *   - secondary:   bg-acuity-bg-sub, line border, text-acuity-text.
 *   - ghost:       no fill, text-acuity-text-sec, underline on hover.
 *   - destructive: bad text, transparent fill, bad border.
 *
 * Sizing follows the §3.2 body-floor + §4.1 padding rules: 14px
 * vertical / 24px horizontal at the default `md`. `sm` and `lg`
 * scale proportionally. All variants use the canonical pill radius
 * (`acuity-pill` = 999).
 *
 * Mobile parity: the spec lives in `_design/design_handoff_acuity_v2/
 * acuity-chrome.jsx` (button primitives) and is mirrored in
 * `apps/mobile/components/acuity/` consumer screens. The mobile RN
 * `<Pressable>` equivalent doesn't have a dedicated Button primitive
 * yet — when it does, both surfaces should agree on these variants.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // Gradient fill via the canonical `bg-acuity-grad-primary` token.
  // White label is intentional — works on every palette because the
  // gradient's mid stop is dark enough for AA contrast at 15/600.
  primary:
    "bg-acuity-grad-primary text-white shadow-acuity-glow-primary " +
    "hover:brightness-105 active:scale-[0.98]",
  secondary:
    "bg-acuity-bg-sub border border-acuity-line text-acuity-text " +
    "hover:bg-acuity-bg-inset active:scale-[0.98]",
  ghost:
    "bg-transparent text-acuity-text-sec " +
    "hover:text-acuity-text hover:underline",
  // Outlined destructive: never solid-red CTA. See §5.17 modal rule.
  destructive:
    "bg-transparent border border-acuity-bad text-acuity-bad " +
    "hover:bg-acuity-bad-soft active:scale-[0.98]",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-[13px] font-semibold",
  md: "px-6 py-[14px] text-[15px] font-semibold",
  lg: "px-8 py-4 text-base font-semibold",
};

const BASE_CLASS =
  "inline-flex items-center justify-center gap-2 rounded-acuity-pill " +
  "font-sans tracking-[-0.2px] whitespace-nowrap " +
  "transition-[transform,filter,background-color,color] duration-acuity-base " +
  "ease-acuity-standard " +
  "disabled:opacity-50 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-acuity-primary focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-acuity-bg";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      className = "",
      children,
      ...rest
    },
    ref
  ) {
    return (
      <button
        ref={ref}
        className={`${BASE_CLASS} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
