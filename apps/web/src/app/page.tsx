import Link from "next/link";
import nextDynamic from "next/dynamic";

import { AccountDeletedBanner } from "@/components/account-deleted-banner";

// Full interactive landing page loads AFTER first paint — not blocking
// hydration. The static hero below provides instant above-the-fold content.
const LandingPage = nextDynamic(
  () => import("@/components/landing").then((m) => m.LandingPage),
  { ssr: false },
);

// ISR: regenerate every 60 seconds. Auth redirect for logged-in users
// is handled by middleware (not getServerSession here) so this page
// can be statically generated and served from edge cache.
export const revalidate = 60;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Acuity",
      description:
        "The AI voice journal that turns your daily debrief into action. Task extraction, goal tracking, mood tracking, pattern detection, and weekly reports — all from a daily voice recording.",
      url: "https://getacuity.io",
      applicationCategory: "HealthApplication",
      operatingSystem: "Web, iOS, Android",
      offers: {
        "@type": "Offer",
        price: "4.99",
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
            text: "Acuity is an AI voice journal where you speak freely each day. AI automatically extracts your tasks, tracks your goals, detects life patterns, and writes a weekly report about your week.",
          },
        },
        {
          "@type": "Question",
          name: "How does Acuity work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Open Acuity any time of day, hit record, and just open the app and talk. The AI voice journal transcribes your daily debrief, extracts tasks, tracks goals, scores your mood, detects patterns, and every Sunday delivers your weekly report.",
          },
        },
        {
          "@type": "Question",
          name: "How much does Acuity cost?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Acuity costs $4.99/month with a 14-day free trial. No card required. Quick setup.",
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

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ─── Static hero — renders instantly with ZERO client JS ─── */}
      {/* This is the above-the-fold content users see in <240ms. The full
          interactive LandingPage loads over it once JS arrives. The
          [data-landing-loaded] selector hides this shell. */}
      <div id="static-hero" className="min-h-screen bg-[#0B0B12] text-white overflow-hidden peer-[.landing-loaded]:hidden">
        {/* Nav placeholder */}
        <nav className="flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
          <span className="font-bold text-lg tracking-tight">Acuity</span>
          <Link
            href="/start"
            className="rounded-full bg-[#7C5CFC] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Start Free Trial
          </Link>
        </nav>

        {/* Hero content */}
        <section className="pt-24 pb-16 sm:pt-32 px-6 max-w-4xl mx-auto text-center">
          <h1 className="font-black tracking-tight">
            <span className="block text-4xl sm:text-5xl lg:text-[3.75rem] leading-[1.1] mb-3">One minute a day.</span>
            <span className="block bg-gradient-to-r from-[#B8A5FF] to-[#7C5CFC] bg-clip-text text-transparent text-4xl sm:text-5xl lg:text-[3.75rem] leading-[1.2]">A life of clarity.</span>
          </h1>
          <p className="mt-8 text-base text-[#C0C0D0] leading-relaxed max-w-lg mx-auto">
            Acuity is the AI voice journal that turns your daily debrief into action. Talk any time of day — it catches your tasks, tracks your goals, and surfaces the patterns you can&rsquo;t see on your own.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/start"
              className="rounded-full bg-[#7C5CFC] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-95"
            >
              Start Free Trial
            </Link>
            <Link
              href="/try"
              className="rounded-full bg-[#F0EDE8] px-7 py-3.5 text-sm font-semibold text-[#181614] transition active:scale-95"
            >
              Try It First
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#A0A0B8]">No credit card. Quick setup.</p>
        </section>

        {/* SEO content for crawlers */}
        <div className="sr-only">
          <h2>How Acuity Works</h2>
          <p>Step 1: Record your day. Step 2: AI extracts tasks, goals, and mood. Step 3: Get your weekly report every Sunday.</p>
          <h2>Pricing</h2>
          <p>$4.99/month after a 30-day free trial. No credit card required. Cancel anytime.</p>
        </div>
      </div>

      <AccountDeletedBanner />
      <LandingPage />
    </>
  );
}
