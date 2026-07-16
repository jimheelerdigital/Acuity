"use client";

import { useEffect, useState } from "react";

/**
 * Urgency banner: "First 100 members — only N spots left"
 * Disappears entirely when spots hit 0 or on error.
 */
export function FoundingMemberBanner() {
  const [spotsLeft, setSpotsLeft] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/founding-members")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.spotsLeft === "number") setSpotsLeft(d.spotsLeft);
      })
      .catch(() => setSpotsLeft(null));
  }, []);

  if (spotsLeft === null || spotsLeft <= 0) return null;

  return (
    <div className="w-full bg-gradient-to-r from-[#8E6FE6] to-[#7D62CA] text-white text-center text-xs sm:text-sm py-2.5 sm:py-2 px-4 font-medium z-[60] relative">
      <span className="inline-block leading-snug">
        🔥 First 100 founding members get early access — only{" "}
        <span className="font-bold text-sm sm:text-base">{spotsLeft}</span>{" "}
        spots left
      </span>
    </div>
  );
}
