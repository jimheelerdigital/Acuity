"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Circular back button used on every sub-page. Replaces the
 * text-based "← Parent" links that were ugly + hard to tap.
 *
 * ~40px diameter, subtle backdrop, Lucide ChevronLeft inside.
 * Matches the Theme Map back button style that was already in
 * the design. Tap fires router.back().
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
