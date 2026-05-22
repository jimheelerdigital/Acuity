"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Lazy-load the full try flow — it's heavy (canvas-confetti, MediaRecorder, etc.)
const TryDebriefFlow = dynamic(
  () => import("@/components/try-debrief-flow").then((m) => ({ default: m.TryDebriefFlow })),
  { ssr: false }
);

/**
 * "Try it now — free" button that opens the TryDebriefFlow as a full-screen
 * overlay on the current page (preserving the landing page URL for attribution).
 *
 * Variants:
 *   - "primary": purple gradient, same style as main CTA
 *   - "secondary": outlined, placed next to primary CTAs
 */
export function TryItNowButton({
  variant = "primary",
  className = "",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="fixed inset-0 z-[100]">
        <TryDebriefFlow onClose={() => setOpen(false)} />
      </div>
    );
  }

  if (variant === "secondary") {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-7 py-3.5 text-sm font-bold text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 active:scale-95 ${className}`}
      >
        Try it now &mdash; free
      </button>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={`rounded-full px-8 py-4 text-sm font-bold text-white transition hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 ${className}`}
      style={{
        background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)",
        boxShadow: "0 8px 32px rgba(124,92,252,0.3), 0 2px 8px rgba(124,58,237,0.15)",
      }}
    >
      Try it now &mdash; free
    </button>
  );
}

/**
 * Dark-theme variant for the landing pages with dark backgrounds.
 */
export function TryItNowButtonDark({
  className = "",
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="fixed inset-0 z-[100]">
        <TryDebriefFlow onClose={() => setOpen(false)} />
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className={`rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] active:scale-95 ${className}`}
    >
      Try it now &mdash; free
    </button>
  );
}
