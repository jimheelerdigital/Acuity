/**
 * Acuity marketing home — rebuilt on the app design system.
 * Composition root. Built in batches:
 *   Batch A (this): MarketingNav + Hero
 *   Batch B: HowItWorks + FeatureRow ×3
 *   Batch C: Consistency + Pricing + FinalCTA + Footer
 *
 * Page chrome reads the Tailwind acuity-* tokens, so the nav theme toggle
 * (wired to the real appearance/cookie system) re-tints the whole page.
 */
import { Hero } from "./Hero";
import { MarketingNav } from "./MarketingNav";

export function MarketingHome() {
  return (
    <div className="min-h-screen bg-acuity-bg transition-colors duration-300">
      <MarketingNav />
      <Hero />
      {/* Batch B — HowItWorks, FeatureRow ×3 */}
      {/* Batch C — Consistency, Pricing, FinalCTA, Footer */}
    </div>
  );
}
