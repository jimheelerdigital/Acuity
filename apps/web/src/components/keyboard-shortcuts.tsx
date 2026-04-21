"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Global keyboard shortcuts. Mount once at the app root (dashboard
 * layout). Shortcut table:
 *
 *   n   — start a new recording (/dashboard#record)
 *   g   — jump to Goals
 *   i   — jump to Insights
 *   e   — jump to Entries list
 *   /   — focus the first [data-search-input] on the page (if any)
 *
 * Fires only when the user isn't typing into an input / textarea /
 * contentEditable. Letters are case-insensitive; modifier keys
 * (⌘, ⌃, ⌥, shift) disable the shortcut so OS + browser shortcuts
 * pass through.
 */
export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "/") {
        const input = document.querySelector<HTMLInputElement>(
          "[data-search-input]"
        );
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      if (key === "n") {
        e.preventDefault();
        router.push("/dashboard#record");
      } else if (key === "g") {
        e.preventDefault();
        router.push("/goals");
      } else if (key === "i") {
        e.preventDefault();
        router.push("/insights");
      } else if (key === "e") {
        e.preventDefault();
        router.push("/entries");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
