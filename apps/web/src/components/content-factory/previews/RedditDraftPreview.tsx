"use client";

import type { PreviewPiece } from "./types";

/**
 * Parse the CTA field which stores: "r/Subreddit | angle text | dontMention text"
 */
function parseRedditMeta(cta: string) {
  const parts = cta.split(" | ");
  return {
    subreddit: parts[0] ?? "r/unknown",
    angle: parts[1] ?? "",
    dontMention: parts[2] ?? "Do not link Acuity in the post body.",
  };
}

/**
 * Split body into annotated sections based on structure:
 * Hook (first sentence), Context (next 2-3), Turning point, Result
 */
function annotateSections(body: string): { label: string; hint: string; text: string }[] {
  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [{ label: "BODY", hint: "", text: body }];

  const sections: { label: string; hint: string; text: string }[] = [];
  const labels = [
    { label: "HOOK", hint: "Specific number or visceral image earns credibility" },
    { label: "CONTEXT", hint: "Name specific tools to sound real, not generic" },
    { label: "TURNING POINT", hint: "The key insight that changed things" },
    { label: "RESULT", hint: "Concrete observation, not vague benefit" },
  ];

  paragraphs.forEach((p, i) => {
    const l = labels[Math.min(i, labels.length - 1)];
    sections.push({ label: l.label, hint: l.hint, text: p });
  });

  return sections;
}

export default function RedditDraftPreview({ piece }: { piece: PreviewPiece }) {
  const { subreddit, angle, dontMention } = parseRedditMeta(piece.cta);
  const sections = annotateSections(piece.body);
  const charCount = piece.body.length;

  return (
    <div className="space-y-4">
      {/* Draft warning banner */}
      <div className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-5 py-3">
        <p className="text-sm font-semibold text-amber-300">
          DRAFT ONLY — rewrite in your own voice before posting
        </p>
      </div>

      {/* Subreddit + angle */}
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-[#FF4500]/20 px-3 py-1 text-xs font-medium text-[#FF6633]">
          {subreddit}
        </span>
        {angle && (
          <span className="text-xs text-white/40 italic">{angle}</span>
        )}
      </div>

      {/* Reddit post mockup */}
      <div className="rounded-xl border border-amber-500/10 bg-amber-900/[0.06] p-5">
        {/* Title */}
        <h2
          className="text-lg font-bold text-white leading-snug"
          style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
        >
          {piece.title}
        </h2>

        {/* Annotated body */}
        <div className="mt-4 space-y-4">
          {sections.map((section, i) => (
            <div key={i} className="relative pl-4 border-l-2 border-amber-500/20">
              <div className="absolute -left-px top-0 -translate-x-full pr-3 hidden lg:block">
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500/40 whitespace-nowrap">
                  {section.label}
                </span>
              </div>
              <div className="mb-1 lg:hidden">
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500/40">
                  {section.label}
                </span>
                {section.hint && (
                  <span className="ml-2 text-[9px] text-white/20">
                    — {section.hint}
                  </span>
                )}
              </div>
              <p
                className="text-sm text-white/80 leading-relaxed"
                style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
              >
                {section.text}
              </p>
              {section.hint && (
                <p className="mt-1 text-[10px] text-amber-400/30 italic hidden lg:block">
                  {section.hint}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Char count */}
        <div className="mt-4 flex justify-end">
          <span className="text-[10px] text-white/25">
            {charCount} characters
          </span>
        </div>
      </div>

      {/* Don't mention reminder */}
      <div className="rounded-lg bg-red-900/10 border border-red-500/15 px-4 py-2">
        <p className="text-xs text-red-300/70">{dontMention}</p>
      </div>

      {/* Checklist */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
          Your checklist before posting
        </h3>
        <ul className="space-y-2 text-sm text-white/60">
          {[
            "Rewrite in your own voice (don't copy-paste)",
            "Verify the hook feels true to your real experience",
            `Check ${subreddit}'s rules for self-promotion`,
            "Post at peak time for that subreddit (Tuesday 8am ET is usually best)",
            "Reply to every comment within 15 minutes for first 2 hours",
            "Do NOT link Acuity in the post body — only in comments when asked",
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-white/20 flex items-center justify-center text-[10px] text-white/20">
                &#x2610;
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
