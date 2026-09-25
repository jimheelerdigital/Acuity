import type { Metadata } from "next";

import { FunnelV9 } from "@/components/funnel-v9";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description: "See what Ripple would keep track of for you.",
  robots: { index: false, follow: false },
};

/**
 * /start-test — the v9 evidence-based funnel, tested separately from
 * /start (2026-09-24, per Keenan). FunnelV9 is a client component, but
 * Next renders it on the server too, so screen 1 is in the initial HTML
 * and visible before JS loads in the FB/IG in-app browser.
 */
export default function StartTestPage() {
  return <FunnelV9 />;
}
