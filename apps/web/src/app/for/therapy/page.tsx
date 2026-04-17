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
  PainSection,
  SolutionSection,
  HowItWorksSection,
  ComparisonTable,
  FeatureGrid,
  TestimonialsSection,
  PricingSection,
  CTABanner,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  StickyCTA,
} from "@/components/landing-shared";

const UTM = "therapy";
const WAITLIST = `/waitlist?utm_campaign=${UTM}`;

export default function TherapyPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white overflow-x-hidden pb-24 sm:pb-0">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="What if you had a therapist who listened every single night?" />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed max-w-2xl mx-auto">
              Acuity listens to your 60-second nightly debrief, tracks your emotional
              patterns, and writes your weekly mental health report — for less than
              the cost of one therapy copay.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={WAITLIST}>
                Join the waitlist — first month free
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
              <UrgencyBadge text="What would change if you had emotional support every single night?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── PAIN SECTION ───── */}
      <PainSection
        points={[
          "Therapy is $150/session. You can only afford once a week.",
          "6 days pass between sessions. Your thoughts pile up.",
          "You show up to therapy with vague feelings instead of actual patterns.",
        ]}
      />

      {/* ───── SOLUTION ───── */}
      <SolutionSection
        headline="Acuity fills the 6 days between sessions."
        body="Every night you speak freely for 60 seconds. Acuity tracks your mood, detects emotional patterns, flags recurring themes, and builds a mental health timeline that compounds over time. Show up to therapy with 7 days of actual data — not just how you feel in the moment."
      />

      <TrustStrip />

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to show up to your next session with real data?"
        subheadline="No credit card required · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── HOW IT WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Record",
            description:
              "Open Acuity at night. Hit record. Speak freely. No prompts, no structure, no judgment.",
          },
          {
            label: "Step 2",
            title: "Analyze",
            description:
              "AI detects your mood, emotional themes, recurring patterns, and what's weighing on you most.",
          },
          {
            label: "Step 3",
            title: "Report",
            description:
              "Every Sunday, receive a 400-word narrative about your emotional week — your wins, your spirals, your blind spots.",
          },
        ]}
        extractTasks={[
          { text: "Journal about the argument" },
          { text: "Schedule therapist follow-up" },
          { text: "Try the breathing exercise" },
        ]}
        extractGoal="Process the anxiety around work changes"
        extractMood="Anxious but hopeful"
        reflectPattern="Anxiety spikes on Sundays. Calm returns after Monday therapy sessions."
        reflectActions={["Discuss Sunday anxiety pattern", "Add wind-down ritual", "Track sleep vs mood"]}
      />

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What if your therapist could see your emotional data from the last 7 days?"
        subheadline="No credit card required · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── COMPARISON TABLE ───── */}
      <section className="px-6 py-24 sm:py-32 bg-transparent">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12 text-white">
              Therapy vs. Acuity
            </h2>
          </Reveal>
          <ComparisonTable
            headers={["Therapy", "Acuity"]}
            rows={[
              { feature: "Cost", values: ["$150/session", "$12.99/month"] },
              { feature: "Frequency", values: ["Once a week", "Every single night"] },
              {
                feature: "Memory",
                values: ["Depends on therapist", "Perfect — remembers everything"],
              },
              {
                feature: "Availability",
                values: ["Business hours", "10pm when you need it"],
              },
              {
                feature: "Patterns",
                values: ["Spotted over months", "Detected in days"],
              },
            ]}
            note="Acuity is not a replacement for therapy. It's what makes therapy more effective."
          />
        </div>
      </section>

      {/* ───── FEATURES ───── */}
      <FeatureGrid
        features={[
          {
            icon: "moon",
            title: "Nightly mood tracking",
            description:
              "Log your emotional state every night with zero effort — just speak and Acuity captures it.",
          },
          {
            icon: "brain",
            title: "Emotional pattern detection",
            description:
              "AI identifies recurring emotional themes across days and weeks, surfacing what your conscious mind misses.",
          },
          {
            icon: "doc",
            title: "Weekly narrative report",
            description:
              "Every Sunday, a 400-word story about your emotional week — wins, spirals, and blind spots.",
          },
          {
            icon: "map",
            title: "Life Matrix (6 life areas scored)",
            description:
              "Health, Wealth, Relationships, Spirituality, Career, and Growth — tracked and scored over time.",
          },
          {
            icon: "repeat",
            title: "Recurring theme analysis",
            description:
              "See which thoughts, worries, and goals keep appearing across your entries.",
          },
          {
            icon: "lock",
            title: "Private and encrypted",
            description:
              "Your debriefs are yours alone. End-to-end encryption keeps your thoughts completely private.",
          },
        ]}
      />

      {/* ───── WHAT USERS SAY ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <div className="rounded-xl border border-white/10 bg-[#13131F] p-8 sm:p-10">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-base sm:text-lg text-[#A0A0B8] leading-relaxed italic">
                "I stopped going to therapy because of the cost. Acuity gives me the pattern recognition I was getting in sessions — at a fraction of the price."
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C5CFC]/20 text-sm font-bold text-[#7C5CFC]">S</div>
                <div>
                  <div className="text-sm font-semibold text-white">Sarah, 31</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── FEATURE HIGHLIGHTS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12 text-white">
              Built for emotional clarity
            </h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { title: "Mood tracking", desc: "Log your emotional state nightly with zero effort — just speak." },
              { title: "Pattern detection", desc: "AI identifies recurring emotional themes across days and weeks." },
              { title: "Weekly report", desc: "Every Sunday, a narrative about your emotional week — wins, spirals, blind spots." },
            ].map((f, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#13131F] p-6 text-center">
                  <div className="h-10 w-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center mb-4 mx-auto">
                    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-xs text-[#A0A0B8] leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <TestimonialsSection
        headline="What therapy-goers are saying"
        testimonials={[
          {
            quote:
              "I started showing up to therapy with actual data instead of just feelings. My therapist noticed the difference immediately.",
            name: "Sarah K.",
            role: "Product Manager",
          },
          {
            quote:
              "Acuity caught a pattern my therapist and I had been trying to identify for months. It spotted it in 3 weeks.",
            name: "Marcus T.",
            role: "Designer",
          },
          {
            quote:
              "At $12.99/month it's the most affordable mental health tool I've ever used. And the most consistent.",
            name: "Jamie L.",
            role: "Teacher",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="Less than one therapy copay. Every month."
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your thoughts deserve to be heard every night. Not just once a week."
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
