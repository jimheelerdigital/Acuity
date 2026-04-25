"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Circular back button used on every sub-page.
 *
 * Two variants:
 *   - `<BackButton />` — inline, flows with content.
 *   - `<StickyBackButton />` — fixed to top-left of the viewport so
 *     it stays visible as content scrolls underneath. Mirrors the
 *     mobile pattern. Use on detail pages where the inline button
 *     would scroll out of reach.
 *
 * ~40px diameter, subtle backdrop, Lucide ChevronLeft inside.
 * Matches the mobile BackButton. Tap fires router.back().
 */
export function BackButton({
  onClick,
  className,
  ariaLabel = "Go back",
}: {
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={onClick ?? (() => router.back())}
      aria-label={ariaLabel}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/80 dark:bg-[#1E1E2E]/80 backdrop-blur text-zinc-700 dark:text-zinc-200 transition hover:bg-white hover:border-zinc-300 dark:hover:bg-[#24243A] dark:hover:border-white/20 ${className ?? ""}`}
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

/**
 * Position-fixed variant. Stays pinned at viewport top-left as the
 * page scrolls. The parent page must provide appropriate top padding
 * on its main content container so the button doesn't cover the first
 * heading at scroll-zero.
 */
export function StickyBackButton({
  onClick,
  ariaLabel = "Go back",
}: {
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={onClick ?? (() => router.back())}
      aria-label={ariaLabel}
      className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/85 dark:bg-[#0B0B12]/85 backdrop-blur-md text-zinc-700 dark:text-zinc-200 shadow-lg transition hover:bg-white hover:border-zinc-300 dark:hover:bg-[#13131F] dark:hover:border-white/20 lg:left-[252px]"
      style={{ top: "max(1rem, env(safe-area-inset-top))" }}
    >
      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
