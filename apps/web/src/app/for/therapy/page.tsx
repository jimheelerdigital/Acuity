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
} from "@/components/landing-shared";

const UTM = "therapy";
const WAITLIST = `/waitlist?utm_campaign=${UTM}`;

export default function TherapyPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="What if you had a therapist who listened every single night?" />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-2xl mx-auto">
              Acuity listens to your 60-second nightly debrief, tracks your emotional
              patterns, and writes your weekly mental health report &mdash; for less than
              the cost of one therapy copay.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={WAITLIST}>
                Join the waitlist &mdash; first month free
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
              <UrgencyBadge text="What would change if you had emotional support every single night?" />
            </div>
          </Reveal>
        </div>
      </section>

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
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12">
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

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your thoughts deserve to be heard every night. Not just once a week."
        utmCampaign={UTM}
      />

      <Footer />
    </div>
  );
}
