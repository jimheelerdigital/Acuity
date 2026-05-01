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
  ReportPreview,
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

const UTM = "weekly-report";
const WAITLIST = `/auth/signup?utm_campaign=${UTM}`;

export default function WeeklyReportPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-24 sm:pb-0 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://getacuity.io" },
              { "@type": "ListItem", position: 2, name: "Use Cases", item: "https://getacuity.io/for/therapy" },
              { "@type": "ListItem", position: 3, name: "Acuity Weekly Report", item: "https://getacuity.io/for/weekly-report" },
            ],
          }),
        }}
      />
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-36 pb-16 sm:pt-44 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="Every Sunday, an AI writes your week back to you." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed max-w-2xl mx-auto">
              From your own voice notes. Your wins. Your patterns. What you said
              you'd do versus what actually happened.
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
              <UrgencyBadge text="What would you learn about yourself from 4 weekly reports?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── REPORT PREVIEW ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12">
              What the weekly report looks like
            </h2>
          </Reveal>

          <ReportPreview
            title="Your week of April 7–13"
            moodArc="Started the week with high energy and momentum, midweek brought friction around a specific project, recovered strongly by Thursday, ended the week reflective and purposeful."
            narrative="This was a week defined by contrast. Monday and Tuesday you showed up with rare clarity — three recordings that week mentioned feeling 'locked in', a phrase you almost never use. By Wednesday something shifted..."
            insightBullets={[
              "Your mood peaked on days you mentioned exercise before noon",
              "Work-related stress increased 40% compared to last week",
              "You mentioned your side project 5 times — more than any previous week",
            ]}
          />
        </div>
      </section>

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to get your first weekly report this Sunday?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── HOW IT WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Record",
            description:
              "Every night, open Acuity and speak for 60 seconds. Your wins, your worries, your reflections — no structure needed.",
          },
          {
            label: "Step 2",
            title: "Extract",
            description:
              "Your words become data. Tasks extracted, mood scored, goals tracked, themes tagged. All of it feeds into Sunday's report.",
          },
          {
            label: "Step 3",
            title: "Report",
            description:
              "Every Sunday, 7 days of entries are synthesized into a 400-word narrative about your week — delivered to you automatically.",
          },
        ]}
        extractTasks={[
          { text: "Revisit quarterly goals" },
          { text: "Follow up on investor intro" },
          { text: "Plan weekend with family" },
        ]}
        extractGoal="Write the Q2 strategy memo"
        extractMood="Reflective and purposeful"
        reflectPattern="Your highest energy days follow mornings with exercise and no meetings before 10am."
        reflectActions={["Protect morning focus blocks", "Review weekly report every Sunday", "Track energy vs output"]}
      />

      {/* ───── WHAT THE REPORT REVEALS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12">
              What the report reveals
            </h2>
          </Reveal>
          <RevealCards
            items={[
              "Your mood arc — how your emotional state moved through the week",
              "Your top themes — what you talked about most",
              "Your blind spots — what the AI noticed that you didn't",
              "Your goal progress — which goals moved forward, which stalled",
              "Your Life Matrix — 6 life area scores and weekly deltas",
              "Your wins — the moments worth celebrating that you almost forgot",
            ]}
          />
        </div>
      </section>

      {/* ───── LIFE MATRIX ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#7C5CFC] mb-4">
                Life Matrix
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Your Life Matrix grows with every report.
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-base max-w-xl mx-auto">
                Across Health, Wealth, Relationships, Spirituality, Career, and Growth
                — Acuity tracks your scores over time and surfaces the patterns
                that weekly reports reveal.
              </p>
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
        headline="What story will your first weekly report tell about you?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── COMPOUNDING VALUE ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Report 1 is interesting.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                Report 12 changes what you pay attention to.
              </span>
            </h2>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed">
              The first weekly report shows you last week. The twelfth shows you who
              you've been for three months — the patterns that repeat, the
              growth that compounds, the blind spots that finally become visible. This
              is the product that gets more valuable the longer you use it.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 flex items-center justify-center gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg transition-all duration-300"
                  style={{
                    width: "40px",
                    height: `${40 + i * 8}px`,
                    backgroundColor: `rgba(124, 58, 237, ${0.1 + i * 0.075})`,
                  }}
                />
              ))}
            </div>
            <p className="mt-4 text-xs text-[#A0A0B8]/60">
              12 weeks of compounding insight
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <TestimonialsSection
        headline="What people say about the report"
        testimonials={[
          {
            quote:
              "I got my first weekly report and read it three times. It surfaced something I'd been blind to for months. Worth every penny.",
            name: "Jamie L.",
            role: "Founder",
          },
          {
            quote:
              "My Sunday morning ritual is now: coffee, Acuity report, intention for the week. It's the most grounding 10 minutes of my week.",
            name: "Sarah K.",
            role: "Executive",
          },
          {
            quote:
              "The AI described my week better than I could have. And then it told me something about myself I didn't know.",
            name: "Marcus T.",
            role: "Designer",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="One report alone is worth $12.99/month."
        subheadline="52 weekly reports a year. A Life Matrix that grows smarter every week. A complete record of your inner life."
        utmCampaign={UTM}
      />

      <TrustStrip />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your first report arrives Sunday. Start recording tonight."
        buttonText="Start Free Trial"
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
