"use client";

import type { PreviewPiece } from "./types";

function estimateReadTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / 150) * 60);
}

export default function TikTokPreview({ piece }: { piece: PreviewPiece }) {
  const totalText = `${piece.hook} ${piece.body} ${piece.cta}`;
  const seconds = estimateReadTime(totalText);

  return (
    <div className="mx-auto max-w-[480px] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/30">TikTok Script Preview</p>
        <p className="text-xs text-white/50">
          Est. duration: <span className="font-medium text-white/70">{seconds}s</span>
        </p>
      </div>

      {/* Hook */}
      <div className="rounded-t-xl bg-[#D4A843]/10 border border-[#D4A843]/20 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#D4A843]/60 mb-2">
          Hook (0–2s)
        </p>
        <p className="text-lg font-bold text-white leading-snug">
          {piece.hook}
        </p>
      </div>

      {/* Body */}
      <div className="bg-[#0A0A0F] border border-white/10 p-5 -mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
          Body (2–{Math.max(seconds - 2, 10)}s)
        </p>
        <p className="font-mono text-[15px] leading-relaxed text-white/85 whitespace-pre-wrap">
          {piece.body}
        </p>
      </div>

      {/* CTA */}
      {piece.cta && (
        <div className="rounded-b-xl bg-[#D4A843]/10 border border-[#D4A843]/20 p-5 -mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#D4A843]/60 mb-2">
            CTA (last 2s)
          </p>
          <p className="text-lg font-bold text-white leading-snug">
            {piece.cta}
          </p>
        </div>
      )}

      <p className="text-[11px] text-white/25 italic text-center pt-1">
        This is the script to read aloud while filming.
      </p>
    </div>
  );
}
