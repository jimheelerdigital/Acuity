"use client";

import type { PreviewPiece } from "./types";

export default function AdCopyPreview({ piece }: { piece: PreviewPiece }) {
  return (
    <div className="mx-auto max-w-[500px]">
      <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#7C5CFC] to-[#5A3FD4] flex items-center justify-center text-[10px] font-bold text-white">
            A
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Acuity</p>
            <p className="text-[11px] text-white/40">Sponsored</p>
          </div>
        </div>

        {/* Primary text */}
        <div className="px-4 pb-3">
          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
            {piece.body}
          </p>
        </div>

        {/* Image placeholder */}
        <div className="aspect-[1.91/1] bg-[#13131F] flex items-center justify-center border-y border-white/5">
          <div className="text-center">
            <div className="mx-auto mb-2 h-10 w-10 rounded-lg bg-white/5 flex items-center justify-center">
              <svg className="h-5 w-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
            </div>
            <p className="text-xs text-white/20">Ad creative goes here</p>
          </div>
        </div>

        {/* Bottom section */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0A0A0F]/50">
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-xs text-white/30 uppercase tracking-wide">getacuity.io</p>
            <p className="text-sm font-semibold text-white truncate">{piece.hook}</p>
            {piece.cta && (
              <p className="text-xs text-white/50 truncate mt-0.5">{piece.cta}</p>
            )}
          </div>
          <button className="shrink-0 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white">
            Try free for 14 days
          </button>
        </div>
      </div>
    </div>
  );
}
