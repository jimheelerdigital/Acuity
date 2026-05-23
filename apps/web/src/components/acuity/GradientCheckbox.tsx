"use client";

/**
 * Acuity GradientCheckbox — web mirror of `apps/mobile/components/
 * acuity/GradientCheckbox.tsx`. Per DESIGN_SYSTEM.md §5.9.
 *
 * Circular checkbox primitive. Visual layer only — toggle behavior
 * lives in the parent.
 *
 * Unchecked: round hairline ring at line-strong, transparent fill.
 * Checked: round gradMix fill + white check glyph.
 *
 * Motion (per motion gallery #5 task-check):
 *   - Ring opacity 1 → 0 over 380ms
 *   - Fill opacity 0 → 1 over 380ms
 *   - Check glyph scale 0 → 1.2 → 1 over 380ms (spring arc)
 * All easings: cubic-bezier(.16, .9, .3, 1) — easeEnter.
 *
 * `muted` keeps parity with the legacy Checkbox for snoozed tasks —
 * dashed unchecked ring.
 */

export interface GradientCheckboxProps {
  checked: boolean;
  onChange?: () => void;
  /** Size in px. Default 22 matches the mobile primitive. */
  size?: number;
  /** Dashed unchecked ring (used for snoozed-tab state). Default false. */
  muted?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}

export function GradientCheckbox({
  checked,
  onChange,
  size = 22,
  muted = false,
  ariaLabel,
  disabled = false,
}: GradientCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={
        ariaLabel ?? (checked ? "Mark incomplete" : "Mark complete")
      }
      onClick={onChange}
      disabled={disabled}
      className="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ width: size, height: size }}
    >
      {/* Unchecked ring */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full border-acuity-line-strong transition-opacity duration-[380ms]"
        style={{
          opacity: checked ? 0 : 1,
          borderWidth: 1.5,
          borderStyle: muted ? "dashed" : "solid",
          transitionTimingFunction: "var(--acuity-ease-enter)",
        }}
      />
      {/* Checked gradient fill */}
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full overflow-hidden bg-acuity-grad-mix transition-opacity duration-[380ms]"
        style={{
          opacity: checked ? 1 : 0,
          transitionTimingFunction: "var(--acuity-ease-enter)",
        }}
      />
      {/* Check glyph */}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center transition-[transform,opacity] duration-[380ms]"
        style={{
          opacity: checked ? 1 : 0,
          transform: checked ? "scale(1)" : "scale(0.3)",
          transitionTimingFunction: "var(--acuity-ease-enter)",
        }}
      >
        <svg
          width={Math.round(size * 0.64)}
          height={Math.round(size * 0.64)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      </span>
    </button>
  );
}
