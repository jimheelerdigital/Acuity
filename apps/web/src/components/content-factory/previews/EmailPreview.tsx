"use client";

import { useState } from "react";
import DOMPurify from "dompurify";
import type { PreviewPiece } from "./types";

export default function EmailPreview({ piece }: { piece: PreviewPiece }) {
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const sanitized = DOMPurify.sanitize(piece.body);

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex items-center gap-1">
        <p className="text-xs text-white/30 mr-2">Preview:</p>
        {(["desktop", "mobile"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              view === v
                ? "bg-white/10 text-white"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {v === "desktop" ? "Desktop" : "Mobile"}
          </button>
        ))}
      </div>

      {/* Email chrome */}
      <div
        className={`mx-auto rounded-xl border border-white/10 bg-[#0A0A0F] overflow-hidden transition-all ${
          view === "desktop" ? "max-w-[700px]" : "max-w-[375px]"
        }`}
      >
        {/* Email header */}
        <div className="border-b border-white/10 px-5 py-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/30 w-12">From:</span>
            <span className="text-white/70">Acuity &lt;hello@getacuity.io&gt;</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/30 w-12">To:</span>
            <span className="text-white/70">you@example.com</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-white/30 w-12">Subject:</span>
            <span className="font-medium text-white/90">{piece.title}</span>
          </div>
        </div>

        {/* Email body */}
        <div className="p-5">
          <div
            className="mx-auto bg-white rounded-lg overflow-hidden"
            style={{ maxWidth: view === "desktop" ? 600 : "100%" }}
          >
            <div
              className="p-6 text-sm leading-relaxed text-gray-800 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-[#7C5CFC] [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_li]:mb-1 [&_img]:max-w-full"
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
