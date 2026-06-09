/**
 * Acuity marketing home — rebuilt on the app design system.
 * Composition root. Built in batches:
 *   Batch A: MarketingNav + Hero
 *   Batch B (in progress): HowItWorks + FeatureRow ×3
 *   Batch C: Consistency + Pricing + FinalCTA + Footer
 *
 * Page chrome reads the Tailwind acuity-* tokens, so the nav theme toggle
 * (wired to the real appearance/cookie system) re-tints the whole page.
 * Phone screens are token-OBJECT driven at fixed modes (the prototype's
 * hero/Home + Life-Matrix-light intent).
 */
import { makeAcuityTokens } from "@acuity/shared";

import { FeatureRow } from "./FeatureRow";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { MarketingNav } from "./MarketingNav";
import { PhoneFrame } from "./PhoneFrame";
import { HomeDashboard } from "./screens/home";

export function MarketingHome() {
  const tDark = makeAcuityTokens({ dark: true, accent: "coral" });

  return (
    <div className="min-h-screen bg-acuity-bg transition-colors duration-300">
      <MarketingNav />
      <Hero />
      <HowItWorks />

      <div id="features" />

      {/* Feature 1 — Home (dark phone). Reuses the corrected HomeDashboard
          (live TodayStatsRow). */}
      <FeatureRow
        eyebrow="Your home"
        accent="var(--acuity-primary)"
        title="Your day, sorted into action."
        body="Open Acuity and everything from last night is already organized — your streak, your tasks, the themes you keep circling, and your next gentle nudge to record."
        points={[
          "Tasks surface themselves from your voice",
          "Streaks and tiers that reward the habit",
          "Last night’s entry, summarized in a line",
        ]}
        phone={
          <PhoneFrame t={tDark} scale={0.62}>
            <HomeDashboard t={tDark} />
          </PhoneFrame>
        }
      />

      {/* Batch B cont. — Feature 2 (Theme Map) + Feature 3 (Life Matrix) */}
      {/* Batch C — Consistency, Pricing, FinalCTA, Footer */}
    </div>
  );
}
