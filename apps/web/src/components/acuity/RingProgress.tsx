"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Ripple RingProgress — web mirror of `apps/mobile/components/acuity/
 * RingProgress.tsx`. Per DESIGN_SYSTEM.md §5.5.
 *
 * SVG circular progress ring with gradient stroke + optional center
 * slot. Motion: stroke fills 0 → value over 850ms easeOutCubic on
 * mount (or whenever `value` changes). prefers-reduced-motion
 * short-circuits to a static render.
 *
 * Stroke linecap is `round` so the head of the arc visually pops.
 * Track color is a hairline at low alpha (#ffffff14 dark, #00000010
 * light) — matches mobile.
 */

export interface RingProgressProps {
  /** 0..100. Values outside the range are clamped. */
  value: number;
  /** Diameter in px. Default 96 matches the design's hero ring. */
  size?: number;
  /** Stroke width. Default 8 matches the hero ring. */
  strokeWidth?: number;
  /** Two-stop gradient. Defaults to primary → secondary (gradMix). */
  gradientColors?: [string, string];
  /** Disable animation. Default true. */
  animated?: boolean;
  /** Center content. Pass a number, label, anything. */
  children?: ReactNode;
  className?: string;
}

const DURATION_MS = 850;

export function RingProgress({
  value,
  size = 96,
  strokeWidth = 8,
  gradientColors,
  animated = true,
  children,
  className = "",
}: RingProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const [displayValue, setDisplayValue] = useState(animated ? 0 : clamped);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animated) {
      setDisplayValue(clamped);
      return;
    }
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setDisplayValue(clamped);
      return;
    }

    const startTime = performance.now();
    const startValue = displayValue;
    const delta = clamped - startValue;

    function tick(now: number) {
      const t = Math.min(1, (now - startTime) / DURATION_MS);
      // easeOutCubic — matches mobile's `cubic-bezier(.16, .9, .3, 1)`.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayValue(startValue + delta * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // displayValue intentionally not in deps — we capture the starting
    // value at animation start, not on every interim tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, animated]);

  // Gradient ID derived from props so multiple rings on a page don't
  // share defs (and the browser caches the gradient render).
  const gradientId = `acuity-ring-${gradientColors?.[0] ?? "primary"}-${gradientColors?.[1] ?? "secondary"}-${size}`.replace(/[^a-zA-Z0-9-]/g, "");
  const stop1 = gradientColors?.[0] ?? "var(--acuity-primary)";
  const stop2 = gradientColors?.[1] ?? "var(--acuity-secondary)";

  const dashOffset = circumference * (1 - displayValue / 100);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stop1} />
            <stop offset="100%" stopColor={stop2} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--acuity-line-strong)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}
