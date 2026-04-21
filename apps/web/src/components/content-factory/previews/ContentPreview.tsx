"use client";

import type { PreviewPiece } from "./types";
import BlogPreview from "./BlogPreview";
import TwitterPreview from "./TwitterPreview";
import TikTokPreview from "./TikTokPreview";
import AdCopyPreview from "./AdCopyPreview";
import EmailPreview from "./EmailPreview";
import RedditDraftPreview from "./RedditDraftPreview";

export default function ContentPreview({ piece }: { piece: PreviewPiece }) {
  switch (piece.type) {
    case "BLOG":
      return <BlogPreview piece={piece} />;
    case "TWITTER":
      return <TwitterPreview piece={piece} />;
    case "TIKTOK":
      return <TikTokPreview piece={piece} />;
    case "AD_COPY":
      return <AdCopyPreview piece={piece} />;
    case "EMAIL":
      return <EmailPreview piece={piece} />;
    case "REDDIT_DRAFT":
      return <RedditDraftPreview piece={piece} />;
    default:
      return (
        <pre className="whitespace-pre-wrap font-mono text-sm text-white/80">
          {piece.body}
        </pre>
      );
  }
}
