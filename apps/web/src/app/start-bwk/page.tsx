import type { Metadata } from "next";

import { StartBwkPageClient } from "./client";
import { BWK_ENTRY_QUESTION, BWK_ENTRY_INTRO, BWK_FUNNEL_CONFIG } from "@/lib/funnel-config-bwk";
import { FunnelSsrEntry } from "@/components/funnel-ssr-entry";

export const metadata: Metadata = {
  title: "Start Free Trial — Ripple",
  description:
    "Debrief out loud. Ripple tracks the tasks, patterns, and blind spots you can't see from inside your own week.",
  robots: { index: false, follow: false },
};

// The funnel is dark (dusk theme); paint the page behind it the same navy so
// iOS overscroll and the gap before hydration never flash white.
const bodyBg = <style dangerouslySetInnerHTML={{ __html: "body{background:oklch(0.168 0.037 287)}" }} />;

/**
 * Server component for the men's/BWK funnel — mirrors /start: renders
 * Screen 1 (Entry Question) as real HTML in the initial response so content
 * is visible before any JS downloads. The client component hydrates on top
 * and takes over for step navigation.
 *
 * Critical for FB in-app browser traffic where JS takes 3-5s to load.
 */
export default async function StartBwkPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const step = typeof searchParams.step === "string" ? searchParams.step : null;

  // If returning to a specific step (refresh, OAuth, Stripe), skip SSR — let client handle
  if (step) {
    return (
      <>
        {bodyBg}
        <StartBwkPageClient skipSSR />
      </>
    );
  }

  return (
    <>
      {bodyBg}
      <FunnelSsrEntry question={BWK_ENTRY_QUESTION} intro={BWK_ENTRY_INTRO} theme="dusk" totalSteps={BWK_FUNNEL_CONFIG.STEP_ORDER.length} />

      {/* Client component hydrates on top — hides SSR content and takes over */}
      <StartBwkPageClient />
    </>
  );
}
