import type { Metadata } from "next";

import { FunnelV9 } from "@/components/funnel-v9";
import { findAdMatch } from "@/lib/funnel-ad-match";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "Say it once and it's on your list, with the date. Nothing slips.",
  robots: { index: false, follow: false },
};

/**
 * /start-catch — pain-first funnel: things slip through (2026-11-02, per Keenan). Same engine, look
 * and 3-screen paywall as /start-journal, its own questions
 * (lib/funnel-v9-config.ts → SLIP_V9). One arm of the /start-pain split.
 */
export default async function Page({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const adMatch = await findAdMatch(searchParams.utm_content);
  return (
    <>
      {/* Fraunces: the redesign's heading face (sunrise theme). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap" />
      <FunnelV9 brand="slip" adMatch={adMatch} />
    </>
  );
}
