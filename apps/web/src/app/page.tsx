import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAuthOptions } from "@/lib/auth";
import { AccountDeletedBanner } from "@/components/account-deleted-banner";
import { LandingPage } from "@/components/landing";

export const dynamic = "force-dynamic";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Acuity",
      description:
        "Speak for 60 seconds before bed. Wake up to extracted tasks, mood trends, and a weekly narrative of your life written by AI.",
      url: "https://getacuity.io",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: "12.99",
        priceCurrency: "USD",
        name: "Pro",
        description: "First month free. Unlimited voice entries, AI analysis, weekly reports, and Life Matrix.",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        ratingCount: "127",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Acuity?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity is a nightly shutdown ritual for your brain. Speak for 60 seconds before bed. By morning, your tasks are extracted, your mood is tracked, and every Sunday you get a 400-word narrative of your week.",
          },
        },
        {
          "@type": "Question",
          name: "How does Acuity work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Open Acuity before bed. Hit record. Talk about your day for 60 seconds. By morning your tasks are pulled out, your mood is scored, and every Sunday a 400-word story of your week lands on your phone.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Acuity cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity costs $12.99/month with your first month completely free. No credit card required to join the waitlist.",
          },
        },
        {
          "@type": "Question",
          name: "Is Acuity a replacement for therapy?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Acuity is not a replacement for therapy. It fills the gap between sessions by tracking your mood, detecting emotional patterns, and helping you show up to therapy with real data instead of vague feelings.",
          },
        },
        {
          "@type": "Question",
          name: "What is the Life Matrix?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "The Life Matrix scores your life across 6 key areas — Health, Wealth, Relationships, Spirituality, Career, and Growth — and tracks them over time so you can see which areas are thriving and which need attention.",
          },
        },
      ],
    },
  ],
};

export default async function HomePage() {
  const session = await getServerSession(getAuthOptions());
  if (session) redirect("/home");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AccountDeletedBanner />
      <LandingPage />
    </>
  );
}
