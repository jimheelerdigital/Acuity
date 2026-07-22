import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import { AccountDeletedBanner } from "@/components/account-deleted-banner";
import { MarketingHome } from "@/components/marketing/MarketingHome";

// Life Matrix FAQ copy derived from the canonical DEFAULT_LIFE_AREAS so it
// can't drift from the live app. Was stale at "6 key areas — Health,
// Wealth, Relationships, Spirituality, Career, Growth"; the app renders 10
// (2026-06-09). Deriving count + example labels means a future axis change
// updates this answer automatically.
const lifeAreaNames = DEFAULT_LIFE_AREAS.map((a) => a.shortName);
const lifeMatrixFaqAnswer = `The Life Matrix scores your life across ${lifeAreaNames.length} areas — including ${lifeAreaNames
  .slice(0, 3)
  .join(", ")}, and more — and tracks them over time so you can see which areas are thriving and which need attention.`;

// ISR: regenerate every 60 seconds. Auth redirect for logged-in users
// is handled by middleware (not getServerSession here) so this page
// can be statically generated and served from edge cache.
export const revalidate = 60;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Ripple",
      description:
        "The AI voice journal that turns your daily debrief into action. Task extraction, goal tracking, mood tracking, pattern detection, and weekly reports — all from a daily voice recording.",
      url: "https://goripple.io",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: "4.99",
        priceCurrency: "USD",
        name: "Pro",
        description: "7-day free trial. Unlimited voice entries, AI analysis, weekly reports, and Life Matrix.",
      },
      // Re-added 2026-06-09 with REAL App Store data (4 × 5-star). sameAs
      // + the rating url point Google at the verifiable source. Bump
      // ratingValue/reviewCount here (and the hero badge) as reviews grow.
      sameAs: "https://apps.apple.com/app/id6762633410",
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "5.0",
        reviewCount: "4",
        bestRating: "5",
        worstRating: "1",
        url: "https://apps.apple.com/app/id6762633410",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Ripple?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ripple is an AI voice journal where you speak freely each day. AI automatically extracts your tasks, tracks your goals, detects life patterns, and writes a weekly report about your week.",
          },
        },
        {
          "@type": "Question",
          name: "How does Ripple work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Open Ripple any time of day, hit record, and just open the app and talk. The AI voice journal transcribes your daily debrief, extracts tasks, tracks goals, scores your mood, detects patterns, and every Sunday delivers your weekly report.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Ripple cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Ripple costs $4.99/month with a 7-day free trial. No card required. Quick setup.",
          },
        },
        {
          "@type": "Question",
          name: "Is Ripple a replacement for therapy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Ripple is not a replacement for therapy. It fills the gap between sessions by tracking your mood, detecting emotional patterns, and helping you show up to therapy with real data instead of vague feelings.",
          },
        },
        {
          "@type": "Question",
          name: "What is the Life Matrix?",
          acceptedAnswer: {
            "@type": "Answer",
            text: lifeMatrixFaqAnswer,
          },
        },
      ],
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AccountDeletedBanner />
      {/* Marketing home rebuilt on the app design system. Built in batches
          (A: nav + hero; B: how-it-works + features; C: pricing + footer).
          The old LandingPage is retained only for /for/* persona pages. */}
      <MarketingHome />
    </>
  );
}
