"use client";

import {
  LandingNav,
  Footer,
  ParallaxOrbs,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  UrgencyBadge,
  MidPageCTA,
  HowItWorksSection,
  RevealCards,
  LifeMatrixShowcase,
  TestimonialsSection,
  PricingSection,
  CTABanner,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  StickyCTA,
} from "@/components/landing-shared";

const UTM = "decoded";
const WAITLIST = `/auth/signup?utm_campaign=${UTM}`;

export default function DecodedPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-24 sm:pb-0 overflow-x-hidden">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="Your subconscious, decoded." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed max-w-2xl mx-auto">
              Most people have no idea what's actually driving their moods, decisions, and habits. Acuity reveals the patterns you can't see from the inside.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={WAITLIST}>
                Start Free Trial
              </PulsingCTA>
              <a
                href="#how-it-works"
                className="rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-[#A0A0B8] transition hover:border-white/20 hover:bg-white/5 active:scale-95"
              >
                See how it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-6">
              <UrgencyBadge text="What pattern has been running your life without you knowing?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── OPENING HOOK ───── */}
      <section className="px-6 py-24 sm:py-32 bg-[#13131F]">
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

      {/* ───── WHAT ACUITY REVEALS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12 text-white">
              What Acuity reveals
            </h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "What triggers your stress", desc: "See the recurring situations, people, and thoughts that spike your anxiety." },
              { title: "What actually moves your goals forward", desc: "Discover which actions correlate with real progress — not just busy work." },
              { title: "What you keep avoiding", desc: "Surface the things you keep saying you'll do — and keep putting off." },
            ].map((card, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
                  <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                    <svg className="h-5 w-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>
                  <p className="text-xs text-[#A0A0B8] leading-relaxed">{card.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
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

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to find out what your subconscious has been trying to tell you?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

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
        extractTasks={[
          { text: "Mentioned career change again" },
          { text: "Avoided talking about relationship" },
          { text: "Energy higher after solo time" },
        ]}
        extractGoal="Figure out what I actually want next"
        extractMood="Restless but self-aware"
        reflectPattern="You mention feeling 'stuck' 3x per week — always tied to career, never relationships."
        reflectActions={["Explore what 'stuck' means for you", "Notice when energy peaks", "Track which topics you avoid"]}
      />

      {/* ───── LIFE MATRIX ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#7C5CFC] mb-4">
                Life Matrix
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Your Life Matrix. Built from everything you've ever said.
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
                  "Work appears in 91% of your debriefs — the only area that spikes on weekends.",
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

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What would you do differently if you could finally see your blind spots?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── THE MOMENT ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              The moment everything clicks.
            </h2>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed">
              Most users describe receiving their first weekly report as the moment
              Acuity became real. Not because it told them something new. Because it
              showed them something they already knew — but had never seen
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
              "Day 23: Acuity told me I'd mentioned my job in 21 of 23 debriefs but only mentioned my family 4 times. I hadn't realized how consumed I'd become.",
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

      <TrustStrip />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your patterns are already running. Start seeing them tonight."
        buttonText="Start Free Trial"
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
