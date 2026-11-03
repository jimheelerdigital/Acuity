import type { Metadata } from "next";

import { FunnelV9 } from "@/components/funnel-v9";
import { findAdMatch } from "@/lib/funnel-ad-match";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "See how far you've come, week by week.",
  robots: { index: false, follow: false },
};

/**
 * /start-progress — pain-first funnel: no progress (2026-11-02, per Keenan). Same engine, look
 * and 3-screen paywall as /start-journal, its own questions
 * (lib/funnel-v9-config.ts → PROGRESS_V9). One arm of the /start-pain split.
 */
export default async function Page({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const adMatch = await findAdMatch(searchParams.utm_content);
  return (
    <>
      {/* Fraunces: the redesign's heading face (sunrise theme). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" />
      {/* ?for=men: his wording (2026-11-02). */}
      <FunnelV9 brand={searchParams.for === "men" ? "progress_m" : "progress"} adMatch={adMatch} />
    </>
  );
}
