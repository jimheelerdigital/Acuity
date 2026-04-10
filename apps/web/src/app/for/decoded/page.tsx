"use client";

import {
  LandingNav,
  Footer,
  ParallaxOrbs,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  UrgencyBadge,
  HowItWorksSection,
  RevealCards,
  LifeMatrixShowcase,
  TestimonialsSection,
  PricingSection,
  CTABanner,
} from "@/components/landing-shared";

const UTM = "decoded";
const SIGNIN = `/auth/signin?utm_source=paid&utm_campaign=${UTM}`;

export default function DecodedPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="You have patterns running your life that you've never seen." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-2xl mx-auto">
              Acuity listens to your nightly brain dump and decodes your subconscious
              &mdash; surfacing the emotional patterns, recurring thoughts, and hidden
              themes that are quietly shaping everything you do.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={SIGNIN}>
                Sign Up for the Waitlist &mdash; Get Your First Month Free
              </PulsingCTA>
              <a
                href="#how-it-works"
                className="rounded-xl border border-zinc-200 px-7 py-3.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300 hover:bg-white active:scale-95"
              >
                See how it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-6">
              <UrgencyBadge />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── OPENING HOOK ───── */}
      <section className="px-6 py-24 sm:py-32 bg-zinc-900">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="text-2xl sm:text-4xl font-bold text-white leading-snug tracking-tight">
              After 30 days, most Acuity users discover something that surprises
              them.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                What will yours be?
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── WHAT GETS DECODED ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12">
              What gets decoded
            </h2>
          </Reveal>
          <RevealCards
            items={[
              "Why you feel anxious every Sunday night",
              "Which relationships drain you vs energize you",
              "The goal you keep mentioning but never act on",
              "What you actually care about vs what you think you care about",
            ]}
          />
        </div>
      </section>

      {/* ───── HOW DECODING WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Speak",
            description:
              "Talk for 60 seconds every night. No structure. No prompts. Just whatever's on your mind.",
          },
          {
            label: "Step 2",
            title: "Detect",
            description:
              "Acuity's AI builds a pattern map from every word you say — tracking themes, emotions, people, goals, and contradictions across every entry.",
          },
          {
            label: "Step 3",
            title: "Reveal",
            description:
              "Your Life Matrix and weekly report surface what your conscious mind couldn't see — specific, named patterns with dates, frequencies, and context.",
          },
        ]}
      />

      {/* ───── LIFE MATRIX ───── */}
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-4">
                Life Matrix
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Your Life Matrix. Built from everything you&apos;ve ever said.
              </h2>
            </div>
          </Reveal>

          <LifeMatrixShowcase
            areas={[
              {
                label: "Health",
                score: 78,
                color: "#14B8A6",
                insight:
                  "Your energy crashes every Monday — suggesting Sunday anxiety is disrupting your sleep.",
              },
              {
                label: "Wealth",
                score: 62,
                color: "#F59E0B",
                insight:
                  "You've mentioned a business idea 8 times in 6 weeks — but it never appears in your task list.",
              },
              {
                label: "Relationships",
                score: 88,
                color: "#F43F5E",
                insight:
                  "You haven't mentioned your closest friend in 3 weeks — a pattern that precedes your lowest mood scores.",
              },
              {
                label: "Spirituality",
                score: 45,
                color: "#A855F7",
                insight:
                  "You feel most purposeful on days you mention helping someone else.",
              },
              {
                label: "Career",
                score: 92,
                color: "#3B82F6",
                insight:
                  "Work appears in 91% of your brain dumps — the only area that spikes on weekends.",
              },
              {
                label: "Growth",
                score: 71,
                color: "#22C55E",
                insight:
                  "You mention wanting to read more every 12 days — always a different book, suggesting exploration over depth.",
              },
            ]}
          />
        </div>
      </section>

      {/* ───── THE MOMENT ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              The moment everything clicks.
            </h2>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed">
              Most users describe receiving their first weekly report as the moment
              Acuity became real. Not because it told them something new. Because it
              showed them something they already knew &mdash; but had never seen
              clearly.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <TestimonialsSection
        headline="Pattern discoveries"
        testimonials={[
          {
            quote:
              "Day 23: Acuity told me I'd mentioned my job in 21 of 23 brain dumps but only mentioned my family 4 times. I hadn't realized how consumed I'd become.",
            name: "Alex R.",
            role: "Consultant",
          },
          {
            quote:
              "It spotted a connection between my Sunday mood scores and Monday productivity that I would never have found on my own.",
            name: "Priya M.",
            role: "Engineer",
          },
          {
            quote:
              "I thought I wanted a promotion. Acuity showed me I mention feeling trapped every time I talk about work. That changed everything.",
            name: "David L.",
            role: "Marketing Director",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="30 days. That's all it takes to see yourself clearly."
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your patterns are already running. Start seeing them tonight."
        buttonText="Sign Up for the Waitlist — Get Your First Month Free"
        utmCampaign={UTM}
      />

      <Footer />
    </div>
  );
}
