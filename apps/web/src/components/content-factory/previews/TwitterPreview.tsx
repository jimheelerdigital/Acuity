"use client";

import type { PreviewPiece } from "./types";

export default function TwitterPreview({ piece }: { piece: PreviewPiece }) {
  const text = piece.body;
  const charCount = text.length;
  const overLimit = charCount > 280;

  return (
    <div className="mx-auto max-w-[520px]">
      <div className="rounded-2xl border border-white/10 bg-[#0A0A0F] p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-[#D4A843] to-[#B8922F] flex items-center justify-center text-xs font-bold text-white">
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-white">Acuity</span>
              <span className="text-sm text-white/40">@getacuity</span>
            </div>
            {/* Body */}
            <p className="mt-1 text-[15px] leading-snug text-white/90 whitespace-pre-wrap break-words">
              {text}
            </p>
            {/* Timestamp */}
            <p className="mt-3 text-xs text-white/30">
              {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              {" · "}
              {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
            {/* Divider */}
            <hr className="my-3 border-white/10" />
            {/* Engagement icons */}
            <div className="flex items-center justify-between text-white/30 max-w-[360px]">
              {/* Reply */}
              <button className="flex items-center gap-1.5 text-xs hover:text-[#1D9BF0] transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                </svg>
                0
              </button>
              {/* Repost */}
              <button className="flex items-center gap-1.5 text-xs hover:text-green-400 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M4.5 12c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662" />
                </svg>
                0
              </button>
              {/* Like */}
              <button className="flex items-center gap-1.5 text-xs hover:text-pink-400 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                0
              </button>
              {/* Share */}
              <button className="flex items-center gap-1.5 text-xs hover:text-[#1D9BF0] transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Character count */}
      <div className="mt-2 flex justify-end">
        <span className={`text-xs font-medium ${overLimit ? "text-red-400" : "text-green-400/70"}`}>
          {charCount}/280 characters
        </span>
      </div>
    </div>
  );
}
