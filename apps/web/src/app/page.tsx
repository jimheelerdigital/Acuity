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
        "AI journaling app that turns a 60-second nightly voice brain dump into extracted tasks, mood tracking, mental pattern detection, and weekly AI reports.",
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
            text: "Acuity is an AI journaling app where you speak freely for 60 seconds each night. AI automatically extracts your tasks, tracks your goals, detects mental patterns, and writes a weekly narrative report about your life.",
          },
        },
        {
          "@type": "Question",
          name: "How does Acuity work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Open Acuity at night, hit record, and speak freely for 60 seconds. AI transcribes your voice, extracts tasks and goals, scores your mood, detects emotional patterns, and every Sunday delivers a written report about your week.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Acuity cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity costs $12.99/month with your 30-day free trial. No card. 90 seconds to set up.",
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
