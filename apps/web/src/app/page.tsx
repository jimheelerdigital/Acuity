import { AccountDeletedBanner } from "@/components/account-deleted-banner";
import { HOME_FAQS } from "@/components/marketing/home-v2/content";
import { HomeV2 } from "@/components/marketing/home-v2/HomeV2";
import { PRODUCT_CATEGORY } from "@/lib/positioning";
import {
  displayAnnual,
  displayAnnualAsMonthly,
  displayMonthly,
  displaySavingsPct,
} from "@/lib/pricing";

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
        `Ripple is ${PRODUCT_CATEGORY}. Talk through what is on your mind and it turns it into your to-do list, tracks your habits and mood, shows your patterns, and sends a weekly report.`,
      url: "https://goripple.io",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: displayAnnual().replace("$", ""),
        priceCurrency: "USD",
        name: "Pro (yearly)",
        description: "7-day free trial. Unlimited debriefs, to-dos, habits, mood, patterns, Life Matrix and a weekly report.",
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
      // Mirrors the FAQ visitors see on the page (home-v2/content.ts), as
      // Google expects. Was a separate, stale list ("No card required",
      // "daily voice recording") until the 2026-10 redesign.
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Ripple?",
          acceptedAnswer: {
            "@type": "Answer",
            text: `Ripple is ${PRODUCT_CATEGORY}. You talk through whatever is on your mind, and it turns it into your to-do list, tracks your habits and mood, shows you what keeps coming up, and sends a weekly report.`,
          },
        },
        ...HOME_FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
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
      {/* 2026-10 redesign (components/marketing/home-v2). The previous
          MarketingHome is kept in components/marketing/ until this one
          settles. The old LandingPage is retained only for /for/* pages. */}
      <HomeV2
        pricing={{
          annual: displayAnnual(),
          monthly: displayMonthly(),
          annualPerMonth: displayAnnualAsMonthly(),
          savingsPct: displaySavingsPct(),
        }}
      />
    </>
  );
}
