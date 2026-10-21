import type { Metadata } from "next";
import { getAppStoreRating } from "@/lib/app-store-rating";
import { AccountDeletedBanner } from "@/components/account-deleted-banner";
import { HOME_FAQS } from "@/components/marketing/home-v2/content";
import { HomeV2 } from "@/components/marketing/home-v2/HomeV2";
import { PRODUCT_CATEGORY } from "@/lib/positioning";
import { OG_IMAGE } from "@/lib/seo";
import {
  displayAnnual,
  displayAnnualAsMonthly,
  displayMonthly,
  displaySavingsPct,
} from "@/lib/pricing";

// ISR: regenerate hourly. Auth redirect for logged-in users
// is handled by middleware (not getServerSession here) so this page
// can be statically generated and served from edge cache.
export const revalidate = 3600;

const HOME_TITLE = "Ripple: AI Voice Journal & Habit Tracker App";
const HOME_DESCRIPTION =
  "Talk it out and Ripple turns it into your to-do list, tracks your habits and mood, spots patterns and sends a weekly report. Start your 7-day free trial.";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [OG_IMAGE.url],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Ripple",
      description:
        `Ripple is ${PRODUCT_CATEGORY}. Talk through what is on your mind and it turns it into your to-do list, tracks your habits and mood, shows your patterns, and sends a weekly report.`,
      url: "https://goripple.io",
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: displayAnnual().replace("$", ""),
        priceCurrency: "USD",
        name: "Pro (yearly)",
        description: "7-day free trial. Unlimited debriefs, to-dos, habits, mood, patterns, Life Matrix and a weekly report.",
      },
      // aggregateRating is added at render from the live App Store lookup
      // (lib/app-store-rating.ts); it was hardcoded "5.0 from 4" until 2026-10-21.
      sameAs: "https://apps.apple.com/app/id6762633410",
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

export default async function HomePage() {
  const rating = await getAppStoreRating();
  const graph = jsonLd["@graph"].map((node) =>
    node["@type"] === "SoftwareApplication" && rating
      ? {
          ...node,
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: String(rating.value),
            ratingCount: String(rating.count),
            bestRating: "5",
            worstRating: "1",
            url: "https://apps.apple.com/app/id6762633410",
          },
        }
      : node
  );
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...jsonLd, "@graph": graph }) }}
      />
      <AccountDeletedBanner />
      {/* 2026-10 redesign (components/marketing/home-v2). The old Acuity-era
          homepage components were deleted 2026-10-21. */}
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
