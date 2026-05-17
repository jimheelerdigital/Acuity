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
        "The AI voice journal that turns your daily debrief into action. Task extraction, goal tracking, mood tracking, pattern detection, and weekly reports — all from a 60-second voice recording.",
      url: "https://getacuity.io",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: "12.99",
        priceCurrency: "USD",
        name: "Pro",
        description: "14-day free trial. Unlimited voice entries, AI analysis, weekly reports, and Life Matrix.",
      },
      // aggregateRating removed — Keenan must provide a verifiable public
      // review source (App Store, G2, Trustpilot) before re-adding.
      // Google penalizes unverifiable aggregate ratings.
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is Acuity?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity is an AI voice journal where you speak freely for 60 seconds each day. AI automatically extracts your tasks, tracks your goals, detects life patterns, and writes a weekly report about your week.",
          },
        },
        {
          "@type": "Question",
          name: "How does Acuity work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Open Acuity any time of day, hit record, and talk for 60 seconds. The AI voice journal transcribes your daily debrief, extracts tasks, tracks goals, scores your mood, detects patterns, and every Sunday delivers your weekly report.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Acuity cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity costs $12.99/month with a 14-day free trial. No card required. 90 seconds to set up.",
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
      {/* SSR content for crawlers — visually hidden but in initial HTML for
          Meta Event Setup Tool, Googlebot, and other bots that don't execute JS.
          The client-rendered LandingPage component overlays this. */}
      <div aria-hidden="true" className="sr-only">
        <h1>Acuity — One Minute a Day. A Life of Clarity.</h1>
        <p>The AI voice journal that turns your daily shutdown ritual into action. Record a 60-second debrief each night. AI extracts your tasks, tracks your goals, detects life patterns, and delivers a weekly report every Sunday.</p>
        <h2>How Acuity Works</h2>
        <p>Step 1: Record your day in 60 seconds. Step 2: AI extracts tasks, goals, and mood. Step 3: Get your weekly report every Sunday.</p>
        <h2>What You Get</h2>
        <ul>
          <li>Tasks extracted from your voice automatically</li>
          <li>Goals tracked across weeks without lifting a finger</li>
          <li>Patterns surfaced that you cannot see on your own</li>
          <li>Weekly report delivered every Sunday morning</li>
          <li>Life Matrix — score 6 key areas of your life over time</li>
        </ul>
        <h2>Pricing</h2>
        <p>$12.99/month after a 14-day free trial. No credit card required. Cancel anytime.</p>
        <h2>Start Your Free Trial</h2>
        <p>Download Acuity on the App Store or sign up at getacuity.io/auth/signup.</p>
      </div>
      <AccountDeletedBanner />
      <LandingPage />
    </>
  );
}
