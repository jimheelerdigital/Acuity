import type { Metadata } from "next";

import { FunnelV9 } from "@/components/funnel-v9";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "See what Ripple would keep track of for you.",
  robots: { index: false, follow: false },
};

/**
 * /start-test-bwk — the v9 evidence-based funnel for the men's/BWK audience
 * (2026-09-25, per Keenan). Same engine and the same light look as
 * /start-test, with BWK copy (lib/funnel-v9-config.ts → BWK_V9).
 */

export default function StartTestBwkPage() {
  return (
    <FunnelV9 brand="bwk" />
  );
}
