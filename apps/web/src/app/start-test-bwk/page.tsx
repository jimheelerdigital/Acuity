import type { Metadata } from "next";

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
const bodyBg = <style dangerouslySetInnerHTML={{ __html: "body{background:oklch(0.168 0.037 287)}" }} />;

export default function StartTestBwkPage() {
  return (
    <>
      {bodyBg}
      <FunnelV9 brand="bwk" />
    </>
  );
}
