"use client";

import DOMPurify from "dompurify";
import type { PreviewPiece } from "./types";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function stripJsonLd(html: string): string {
  return html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (match) return match[1];
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 155) + (text.length > 155 ? "…" : "");
}

export default function BlogPreview({ piece }: { piece: PreviewPiece }) {
  const slug = slugify(piece.title);
  const cleaned = stripJsonLd(piece.body);
  const sanitized = DOMPurify.sanitize(cleaned);
  const metaDesc = extractMetaDescription(piece.body);

  return (
    <div className="space-y-4">
      {/* Google SERP preview */}
      <div className="rounded-lg border border-white/10 bg-[#0A0A0F] p-4">
        <p className="text-[11px] text-white/30 mb-1">Search preview</p>
        <p className="text-sm text-green-400/80">
          getacuity.io/blog/{slug}
        </p>
        <p className="text-base text-[#8AB4F8] hover:underline cursor-default">
          {piece.title}
        </p>
        <p className="text-sm text-white/50 line-clamp-2">
          {metaDesc}
        </p>
      </div>

      {/* Article preview */}
      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <article className="mx-auto max-w-[680px]">
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {piece.title}
          </h1>
          {piece.targetKeyword && (
            <p className="mt-2 text-xs text-[#7C5CFC]">
              Target keyword: {piece.targetKeyword}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-white/40">
            <span>Acuity Team</span>
            <span>&middot;</span>
            <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
          <hr className="my-6 border-white/10" />
          <div
            className="prose prose-invert prose-sm max-w-none prose-headings:text-white prose-headings:font-semibold prose-p:text-white/80 prose-a:text-[#7C5CFC] prose-strong:text-white/90 prose-li:text-white/80 prose-code:text-[#7C5CFC]/80 prose-blockquote:border-[#7C5CFC]/40 prose-blockquote:text-white/60"
            dangerouslySetInnerHTML={{ __html: sanitized }}
          />
          {piece.cta && (
            <div className="mt-8 rounded-lg bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 p-5 text-center">
              <p className="text-sm font-medium text-white/90">{piece.cta}</p>
              <button className="mt-3 rounded-lg bg-[#7C5CFC] px-6 py-2 text-sm font-medium text-white">
                Try Acuity Free
              </button>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
