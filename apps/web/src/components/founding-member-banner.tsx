"use client";

import { useEffect, useState } from "react";

/**
 * Thin urgency banner: "First 100 · 30 days free (normally 14) · N spots left"
 * Disappears entirely when spots hit 0.
 */
export function FoundingMemberBanner() {
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/founding-members")
      .then((r) => r.json())
      .then((d) => setSpotsLeft(d.spotsLeft))
      .catch(() => setSpotsLeft(null));
  }, []);

  // Don't render if loading, errored, or sold out
  if (spotsLeft === null || spotsLeft <= 0) return null;

  return (
    <div className="bg-gradient-to-r from-[#7C5CFC] to-[#6B4FE0] text-white text-center text-xs sm:text-sm py-2 px-4 font-medium">
      First 100 · 30 days free (normally 14) ·{" "}
      <span className="font-bold">{spotsLeft} spots left</span>
    </div>
  );
}
