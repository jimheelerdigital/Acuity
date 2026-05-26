"use client";

import Link from "next/link";

/**
 * Primary CTA button that links to /start (the onboarding funnel).
 * Always shows "Start Free Trial" — consistent label sitewide.
 */
export function TryItNowButton({
  variant = "primary",
  className = "",
}: {
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const href = "/start";
  const label = "Start Free Trial";

  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className={`rounded-full border border-[#7C5CFC]/30 bg-[#7C5CFC]/5 px-7 py-3.5 text-sm font-bold text-[#7C5CFC] transition hover:bg-[#7C5CFC]/10 active:scale-95 inline-block ${className}`}
      >
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`rounded-full px-8 py-4 text-sm font-bold text-white transition hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 inline-block ${className}`}
      style={{
        background: "linear-gradient(135deg, #7C5CFC 0%, #9F7AEA 50%, #7C3AED 100%)",
        boxShadow: "0 8px 32px rgba(124,92,252,0.3), 0 2px 8px rgba(124,58,237,0.15)",
      }}
    >
      {label}
    </Link>
  );
}

/**
 * Dark variant CTA with shining ring animation.
 * Light background, dark text — designed for dark landing pages.
 */
export function TryItNowButtonDark({
  className = "",
}: {
  className?: string;
}) {
  return (
    <Link
      href="/start"
      className={`group relative rounded-full p-[2px] transition active:scale-95 hover:scale-[1.02] overflow-hidden inline-block ${className}`}
    >
      <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
      <span className="relative flex items-center justify-center rounded-full bg-[#F0EDE8] px-7 py-3.5 text-sm font-semibold text-[#181614]">
        Start Free Trial
      </span>
    </Link>
  );
}
