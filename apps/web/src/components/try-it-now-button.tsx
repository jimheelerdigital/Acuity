"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Lazy-load the full try flow — it's heavy (canvas-confetti, MediaRecorder, etc.)
const TryDebriefFlow = dynamic(
  () => import("@/components/try-debrief-flow").then((m) => ({ default: m.TryDebriefFlow })),
  { ssr: false }
);

// Lazy-import the check function — same module, avoids pulling the whole flow at button render
function checkTryUsed(): boolean {
  try {
    return localStorage.getItem("acuity_try_used") === "1";
  } catch {
    return false;
  }
}

/**
 * "Try it now — free" button that opens the TryDebriefFlow as a full-screen
 * overlay on the current page (preserving the landing page URL for attribution).
 *
 * ISSUE 2: After the first try, the button changes to "Sign up to continue"
 * and links to the signup page instead of opening the try flow.
 */
export function TryItNowButton({
  variant = "primary",
  className = "",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);

  useEffect(() => { setUsed(checkTryUsed()); }, []);

  if (open) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <TryDebriefFlow onClose={() => setOpen(false)} />
      </div>
    );
  }

  // After first try: show "Sign up to continue" instead
  if (used) {
    if (variant === "secondary") {
      return (
        <a
          href="/auth/signup"
          className={`rounded-full border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-7 py-3.5 text-sm font-bold text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 active:scale-95 inline-block ${className}`}
        >
          Sign up to continue
        </a>
      );
    }
    return (
      <a
        href="/auth/signup"
        className={`rounded-full px-8 py-4 text-sm font-bold text-white transition hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 inline-block ${className}`}
        style={{
          background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)",
          boxShadow: "0 8px 32px rgba(124,92,252,0.3), 0 2px 8px rgba(124,58,237,0.15)",
        }}
      >
        Sign up to continue
      </a>
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
  const [used, setUsed] = useState(false);

  useEffect(() => { setUsed(checkTryUsed()); }, []);

  if (open) {
    return (
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <TryDebriefFlow onClose={() => setOpen(false)} />
      </div>
    );
  }

  if (used) {
    return (
      <a
        href="/auth/signup"
        className={`rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] active:scale-95 inline-block ${className}`}
      >
        Sign up to continue
      </a>
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
