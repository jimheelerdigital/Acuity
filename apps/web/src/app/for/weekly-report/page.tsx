"use client";

import {
  LandingNav,
  Footer,
  ParallaxOrbs,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  UrgencyBadge,
  ReportPreview,
  RevealCards,
  LifeMatrixShowcase,
  TestimonialsSection,
  PricingSection,
  CTABanner,
} from "@/components/landing-shared";

const UTM = "weekly-report";
const SIGNIN = `/auth/signin?utm_source=paid&utm_campaign=${UTM}`;

export default function WeeklyReportPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="Every Sunday morning, Acuity sends you a story about your week. Written by AI. Starring you." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-2xl mx-auto">
              Not bullet points. Not a summary. A 400-word narrative of your week
              &mdash; your wins, your patterns, your emotional arc, your blind spots
              &mdash; written in your own voice.
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

      {/* ───── HOW THE REPORT IS BUILT ───── */}
      <section id="how-it-works" className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">
              How the report is built
            </h2>
          </Reveal>

          <div className="space-y-6">
            {[
              "Every night you record a 60-second brain dump",
              "AI extracts mood, themes, tasks, goals, insights",
              "7 days of entries are synthesized",
              "Claude writes your weekly narrative",
              "Delivered every Sunday morning",
            ].map((step, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600 font-bold text-sm shrink-0">
                    {i + 1}
                  </div>
                  <p className="text-zinc-600">{step}</p>
                  {i < 4 && (
                    <svg
                      className="h-5 w-5 text-zinc-300 ml-auto hidden sm:block"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-14">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-4">
                Life Matrix
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                Your Life Matrix grows with every report.
              </h2>
              <p className="mt-4 text-zinc-500 text-base max-w-xl mx-auto">
                Across Health, Wealth, Relationships, Spirituality, Career, and Growth
                &mdash; Acuity tracks your scores over time and surfaces the patterns
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

      {/* ───── COMPOUNDING VALUE ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Report 1 is interesting.
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                Report 12 is transformative.
              </span>
            </h2>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed">
              The first weekly report shows you last week. The twelfth shows you who
              you&apos;ve been for three months &mdash; the patterns that repeat, the
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
            <p className="mt-4 text-xs text-zinc-400">
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
        headline="One report alone is worth $19/month."
        subheadline="52 weekly reports a year. A Life Matrix that grows smarter every week. A complete record of your inner life."
        utmCampaign={UTM}
      />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your first report arrives Sunday. Start recording tonight."
        buttonText="Sign Up for the Waitlist — Get Your First Month Free"
        utmCampaign={UTM}
      />

      <Footer />
    </div>
  );
}
