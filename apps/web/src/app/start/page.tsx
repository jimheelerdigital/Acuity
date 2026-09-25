import type { Metadata } from "next";

import { StartPageClient } from "./client";
import { ENTRY_QUESTION, ENTRY_INTRO, DEFAULT_FUNNEL_CONFIG } from "@/lib/funnel-config";
import { FunnelSsrEntry } from "@/components/funnel-ssr-entry";
import { S1_YESNO } from "@/lib/funnel-s1-test";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description:
    "Start your Ripple journey. See what one voice debrief can tell you about your life.",
  robots: { index: false, follow: false },
};

/**
 * Server component — renders Screen 1 (Entry Question) as real HTML in the
 * initial response so content is visible before any JS downloads. The client
 * component hydrates on top and takes over for step navigation.
 *
 * This is critical for FB in-app browser traffic where JS takes 3-5s to load.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const step = typeof searchParams.step === "string" ? searchParams.step : null;

  // If returning to a specific step (refresh, OAuth, Stripe), skip SSR — let client handle
  if (step) {
    return (
      <>
        <StartPageClient skipSSR />
      </>
    );
  }

  return (
    <>
      <FunnelSsrEntry question={ENTRY_QUESTION} intro={ENTRY_INTRO} theme="light" totalSteps={DEFAULT_FUNNEL_CONFIG.STEP_ORDER.length} yesno={S1_YESNO["v8"]} />

      {/* Client component hydrates on top — hides SSR content and takes over */}
      <StartPageClient />
    </>
  );
}
