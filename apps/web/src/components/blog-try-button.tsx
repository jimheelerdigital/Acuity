"use client";

import { TryItNowButtonDark } from "@/components/try-it-now-button";

/**
 * Client component wrapper for the "Try it now" button in blog post CTAs.
 * Needed because the blog page is a server component and can't directly
 * use the interactive TryItNowButtonDark.
 */
export function BlogTryButton() {
  return <TryItNowButtonDark className="mb-3" />;
}
