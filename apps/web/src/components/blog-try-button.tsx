"use client";

import Link from "next/link";
import { TryItNowButtonDark } from "@/components/try-it-now-button";

/**
 * Client component wrapper for the blog post CTA section.
 * Renders "Start Free Trial" (purple + ring) and "Try It First" (light + ring)
 * side by side. Needed because the blog page is a server component.
 */
export function BlogCtaButtons() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
      <a
        href="/?utm_campaign=blog"
        className="group relative rounded-full p-[2px] transition active:scale-95 hover:scale-[1.02] overflow-hidden"
      >
        <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
        <span className="relative flex items-center justify-center rounded-full bg-acuity-primary px-7 py-3.5 text-sm font-semibold text-white">
          Start Free Trial
        </span>
      </a>
      <TryItNowButtonDark />
    </div>
  );
}
