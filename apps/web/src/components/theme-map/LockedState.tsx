"use client";

import Link from "next/link";

/**
 * Pre-unlock landing. Appears when the user has fewer than 10
 * recording entries. Blurred orbital teaser + lock icon + progress
 * bar + record CTA.
 */
export function LockedState({ count }: { count: number }) {
  const remaining = Math.max(0, 10 - count);
  const pct = Math.min(100, (count / 10) * 100);

  return (
    <div className="flex flex-col items-center text-center px-6 pt-[60px] pb-10">
      {/* Blurred orbital teaser */}
      <div
        className="relative"
        style={{ width: 200, height: 200, marginBottom: 24 }}
      >
        <svg
          viewBox="0 0 200 200"
          style={{ width: 200, height: 200, filter: "blur(1px)" }}
          aria-hidden
        >
          <defs>
            <radialGradient id="tm-lock-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(124,58,237,0.35)" />
              <stop offset="100%" stopColor="rgba(124,58,237,0)" />
            </radialGradient>
          </defs>
          <circle cx={100} cy={100} r={80} fill="url(#tm-lock-halo)" />
          <circle
            cx={100}
            cy={100}
            r={26}
            fill="#7C3AED"
            opacity={0.55}
          />
          {/* Corner planets */}
          <circle cx={40} cy={40} r={8} fill="#34D399" opacity={0.35} />
          <circle cx={160} cy={40} r={8} fill="#F87171" opacity={0.35} />
          <circle cx={40} cy={160} r={7} fill="#94a3b8" opacity={0.35} />
          <circle cx={160} cy={160} r={7} fill="#94a3b8" opacity={0.35} />
          {/* Connection lines */}
          <line
            x1={100}
            y1={100}
            x2={40}
            y2={40}
            stroke="#7C3AED"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
          <line
            x1={100}
            y1={100}
            x2={160}
            y2={40}
            stroke="#7C3AED"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
          <line
            x1={100}
            y1={100}
            x2={40}
            y2={160}
            stroke="#7C3AED"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
          <line
            x1={100}
            y1={100}
            x2={160}
            y2={160}
            stroke="#7C3AED"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
        </svg>
        {/* Lock icon — absolutely centered over the blurred art */}
        <div
          className="absolute left-1/2 top-1/2 flex items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E]"
          style={{
            width: 64,
            height: 64,
            transform: "translate(-50%, -50%)",
            fontSize: 28,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          🔒
        </div>
      </div>

      <h1
        className="text-zinc-900 dark:text-zinc-50 font-bold mb-2"
        style={{ fontSize: 24, letterSpacing: "-0.4px" }}
      >
        Unlock your Theme Map
      </h1>
      <p
        className="text-zinc-500 dark:text-zinc-400 mb-6"
        style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 300 }}
      >
        Record {remaining} more session{remaining === 1 ? "" : "s"} and Acuity
        will surface the patterns hiding in your words.
      </p>

      {/* Progress card */}
      <div
        className="w-full rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-5 mb-6"
        style={{ maxWidth: 320 }}
      >
        <div className="flex items-end justify-between mb-3">
          <span
            className="text-zinc-900 dark:text-zinc-50 tabular-nums"
            style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}
          >
            {count}
          </span>
          <span className="text-sm text-zinc-400 dark:text-zinc-500">
            of 10 entries
          </span>
        </div>
        <div
          className="rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden"
          style={{ height: 8 }}
        >
          <div
            className="tm-locked-bar h-full"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #7C3AED, #A78BFA)",
              boxShadow: "0 0 12px rgba(124,58,237,0.5)",
              animation: "tmBarGrow 1.2s ease-out",
            }}
          />
        </div>
        <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500 text-left">
          {remaining} more to unlock
        </p>
      </div>

      <Link
        href="/home#record"
        className="inline-block rounded-[14px] font-semibold text-white"
        style={{
          fontSize: 15,
          padding: "14px 28px",
          backgroundColor: "#7C3AED",
          boxShadow: "0 8px 24px rgba(124,58,237,0.4)",
        }}
      >
        Record now
      </Link>

      <style jsx>{`
        @keyframes tmBarGrow {
          from {
            width: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tm-locked-bar {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
