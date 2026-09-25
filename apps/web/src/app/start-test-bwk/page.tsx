import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";

import { FunnelV9 } from "@/components/funnel-v9";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "See what Ripple would keep track of for you.",
  robots: { index: false, follow: false },
};

/**
 * /start-test-bwk — the v9 evidence-based funnel for the men's/BWK audience
 * (2026-09-25, per Keenan). Same engine as /start-test, BWK copy on the dusk
 * theme (lib/funnel-v9-config.ts → BWK_V9).
 */
// Charcoal body behind the funnel so overscroll never flashes another color.
const bodyBg = <style dangerouslySetInnerHTML={{ __html: "body{background:oklch(0.18 0.006 60)}" }} />;

// Serif for the statement quotes on the charcoal/cream theme (.lux-serif in
// funnel-v9.tsx). Loaded only on this page.
const lux = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], style: ["italic", "normal"], variable: "--font-lux", display: "swap" });

export default function StartTestBwkPage() {
  return (
    <>
      {bodyBg}
      <div className={lux.variable}>
        <FunnelV9 brand="bwk" />
      </div>
    </>
  );
}
