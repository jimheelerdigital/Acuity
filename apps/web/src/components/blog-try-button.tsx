"use client";

/**
 * Blog post CTA — single "Start Free Trial" button linking to /start.
 */
export function BlogCtaButtons() {
  return (
    <div className="flex items-center justify-center">
      <a
        href="/start"
        className="group relative rounded-full p-[2px] transition active:scale-95 hover:scale-[1.02] overflow-hidden"
      >
        <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
        <span className="relative flex items-center justify-center rounded-full bg-acuity-primary px-7 py-3.5 text-sm font-semibold text-white">
          Start Free Trial
        </span>
      </a>
    </div>
  );
}
