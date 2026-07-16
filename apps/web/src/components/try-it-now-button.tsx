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
        className={`rounded-full border border-[#8E6FE6]/30 bg-[#8E6FE6]/5 px-7 py-3.5 text-sm font-bold text-[#8E6FE6] transition hover:bg-[#8E6FE6]/10 active:scale-95 inline-block ${className}`}
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
        background: "linear-gradient(135deg, #8E6FE6 0%, #9F7AEA 50%, #7D62CA 100%)",
        boxShadow: "0 8px 32px rgba(142,111,230,0.3), 0 2px 8px rgba(125,98,202,0.15)",
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
      <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #CAB8E9 85%, transparent 100%)' }} />
      <span className="relative flex items-center justify-center rounded-full bg-[#F0EDE8] px-7 py-3.5 text-sm font-semibold text-[#181614]">
        Start Free Trial
      </span>
    </Link>
  );
}
