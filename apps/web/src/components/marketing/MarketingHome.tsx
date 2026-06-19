/**
 * Acuity marketing home — rebuilt on the app design system.
 * Composition root. Built in batches:
 *   Batch A: MarketingNav + Hero
 *   Batch B: HowItWorks + FeatureRow ×3
 *   Batch C: Consistency + Pricing + FinalCTA + Footer
 *
 * Page chrome reads the Tailwind acuity-* tokens, so the nav theme toggle
 * (wired to the real appearance/cookie system) re-tints the whole page.
 * Phone screens are token-OBJECT driven at fixed modes: Home + Theme Map
 * dark, Life Matrix light (the prototype intentionally shows the app's
 * light mode here). All three mirror the LIVE app (parity-by-default).
 */
import { makeAcuityTokens } from "@acuity/shared";

import { InlineInstallCTA } from "@/components/inline-install-cta";

import { Consistency } from "./Consistency";
import { FeatureRow } from "./FeatureRow";
import { FinalCTA } from "./FinalCTA";
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { MarketingNav } from "./MarketingNav";
import { PhoneFrame } from "./PhoneFrame";
import { Pricing } from "./Pricing";
import { HomeDashboard } from "./screens/home";
import { LifeMatrix } from "./screens/life-matrix";
import { ThemeMap } from "./screens/theme-map";

export function MarketingHome() {
  const tDark = makeAcuityTokens({ dark: true, accent: "coral" });
  const tLight = makeAcuityTokens({ dark: false, accent: "coral" });

  return (
    <div className="min-h-screen bg-acuity-bg transition-colors duration-300">
      <MarketingNav />
      <Hero />
      <HowItWorks />

      <div id="features" />

      {/* Feature 1 — Home (dark). Reuses the corrected HomeDashboard. */}
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

      <InlineInstallCTA location="mid_page" />

      {/* Feature 2 — Theme Map (dark, flipped). */}
      <FeatureRow
        flip
        eyebrow="Theme Map"
        accent="var(--acuity-secondary)"
        title="See what you actually think about."
        body="Every theme you mention becomes a planet, sized by how often it’s on your mind. Watch your inner world take shape — career, family, health — orbiting quietly over time."
        points={[
          "Planets scale with what you dwell on",
          "A cosmic, personal view of your months",
          "Unlocks after your first ten entries",
        ]}
        phone={
          <PhoneFrame t={tDark} scale={0.62}>
            <ThemeMap t={tDark} />
          </PhoneFrame>
        }
      />

      {/* Feature 3 — Life Matrix (LIGHT mode). Copy reflects the live 10
          axes — NOT the prototype's "12-axis" claim. */}
      <FeatureRow
        eyebrow="Life Matrix"
        accent="var(--acuity-good)"
        title="Every life area, measured."
        body="Ten areas of your life, scored 0–100 and tracked week over week. The radar shows where you’re thriving and where you’ve gone quiet — with the deltas that matter."
        points={[
          "A ten-area radar of your whole life",
          "Week-over-week movement, not vanity",
          "Top movers surfaced automatically",
        ]}
        phone={
          <PhoneFrame t={tLight} scale={0.62}>
            <LifeMatrix t={tLight} />
          </PhoneFrame>
        }
      />

      <Consistency />
      <Pricing />
      <FinalCTA />
      <InlineInstallCTA location="footer" />
      <Footer />
    </div>
  );
}
