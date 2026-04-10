"use client";

import {
  LandingNav,
  Footer,
  ParallaxOrbs,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  UrgencyBadge,
  PainSection,
  HowItWorksSection,
  ComparisonTable,
  StatsSection,
  TestimonialsSection,
  PricingSection,
  CTABanner,
  AnimatedCounter,
} from "@/components/landing-shared";

const UTM = "founders";
const SIGNIN = `/auth/signin?utm_source=paid&utm_campaign=${UTM}`;

export default function FoundersPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      <LandingNav />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text="The 60-second nightly debrief that high performers use instead of therapy." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-2xl mx-auto">
              Speak freely for 60 seconds. Acuity extracts your action items, tracks
              your decision patterns, flags your blind spots, and writes your weekly
              performance report &mdash; automatically.
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

      {/* ───── FOUNDER PAIN ───── */}
      <PainSection
        points={[
          "Decision fatigue is real. You make 100 decisions a day. By 10pm your brain is full and you have nowhere to put it.",
          "Your best thinking happens after hours. It disappears by morning. Voice memos go nowhere. Notion stays empty.",
          "You track everything in your business. You track nothing about yourself. That's the gap killing your performance.",
        ]}
      />

      {/* ───── WHAT ACUITY EXTRACTS ───── */}
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4">
              What Acuity extracts from a founder debrief
            </h2>
            <p className="text-center text-zinc-500 mb-12">
              From a single 60-second recording, Acuity automatically extracts:
            </p>
          </Reveal>

          <div className="space-y-4">
            {[
              {
                icon: "tasks",
                text: "Every action item you mentioned — organized by priority",
              },
              {
                icon: "target",
                text: "Every goal you referenced — tracked across sessions",
              },
              {
                icon: "bolt",
                text: "Your energy and focus score for the day",
              },
              {
                icon: "brain",
                text: "Decisions you're circling but haven't made",
              },
              {
                icon: "users",
                text: "People and relationships that keep surfacing",
              },
              {
                icon: "chart",
                text: "Patterns in what's draining vs energizing you",
              },
            ].map((item, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                <div className="flex items-center gap-4 rounded-xl border border-zinc-100 bg-[#FAFAF7] p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <svg
                      className="h-5 w-5 text-violet-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm text-zinc-700 font-medium">{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Debrief",
            description:
              "End your day in 60 seconds. Hit record, speak freely about wins, blockers, decisions, and what's on your mind. No app to configure.",
          },
          {
            label: "Step 2",
            title: "Extract",
            description:
              "AI pulls every action item, goal, decision, and concern — organized by priority. Your scattered thoughts become a structured operating system.",
          },
          {
            label: "Step 3",
            title: "Report",
            description:
              "Every Sunday, get a performance report: task completion, goal progress, energy trends, decision patterns, and one key insight you missed.",
          },
        ]}
        extractTasks={[
          { text: "Follow up with lead investor", checked: true },
          { text: "Review Q2 hiring plan" },
          { text: "Prep board deck for Friday" },
        ]}
        extractGoal="Close Series A by end of month"
        extractMood="Focused but running on fumes"
        reflectPattern="Decision quality drops on days with 5+ meetings. Best calls happen on mornings with deep work blocks."
        reflectActions={["Cap meetings at 4/day", "Protect Monday mornings", "Delegate investor updates"]}
      />

      {/* ───── WEEKLY PERFORMANCE REPORT ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4">
              Your Sunday morning debrief. Written by AI.
            </h2>
            <p className="text-center text-zinc-500 mb-12">
              Framed as a performance report, not a wellness diary.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  "Task completion rate this week",
                  "Goal progress across all active goals",
                  "Energy trend across 7 days",
                  "Top themes (what dominated your thinking)",
                  "Decision patterns (what you keep postponing)",
                  "Life Matrix scores across 6 areas",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-violet-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm text-zinc-600">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-violet-50 border border-violet-100 p-4">
                <div className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-violet-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                    />
                  </svg>
                  <span className="text-sm text-violet-700 font-medium">
                    + One key insight the AI surfaced that you missed
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── COMPOUNDING INTELLIGENCE ───── */}
      <section className="px-6 py-24 sm:py-32 bg-zinc-900 text-white">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              The longer you use it, the smarter it gets about you.
            </h2>
            <p className="mt-6 text-lg text-zinc-400 leading-relaxed">
              After 90 days, Acuity has processed everything you&apos;ve said about your
              business, your team, your goals, and your mental state. It knows your
              patterns better than your co-founder. It remembers every goal you&apos;ve
              set, every concern you&apos;ve voiced, every decision you&apos;ve been
              avoiding.{" "}
              <span className="text-white font-semibold">
                That&apos;s your competitive advantage.
              </span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── COMPARISON ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12">
              How Acuity compares
            </h2>
          </Reveal>
          <ComparisonTable
            headers={["Executive Coach", "Therapy", "Acuity"]}
            rows={[
              { feature: "Cost", values: ["$500+/month", "$600+/month", "$19/month"] },
              {
                feature: "Availability",
                values: ["Scheduled", "Scheduled", "Every night"],
              },
              { feature: "Memory", values: ["Limited", "Limited", "Perfect"] },
              { feature: "Action items", values: ["Manual", "None", "Automatic"] },
              {
                feature: "Pattern detection",
                values: ["Slow", "Slow", "Real-time"],
              },
            ]}
          />
        </div>
      </section>

      {/* ───── TIME ROI ───── */}
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              60 seconds a night.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                7 minutes a week.
              </span>
            </h2>
            <p className="mt-4 text-lg text-zinc-500 mb-8">
              That&apos;s the total time investment. In return:
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="grid gap-4 sm:grid-cols-2 text-left max-w-lg mx-auto">
              {[
                "Every task captured automatically",
                "Every goal tracked without a system",
                "Weekly performance report written for you",
                "90-day pattern intelligence building in the background",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-violet-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-sm text-zinc-600">{item}</span>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={2}>
            <p className="mt-8 text-sm text-zinc-400">
              You spend more time in a single Slack thread.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <TestimonialsSection
        headline="What founders are saying"
        testimonials={[
          {
            quote:
              "I replaced my $500/month executive coach with Acuity. Not because it's cheaper. Because it's available at 11pm when I actually need to process.",
            name: "David L.",
            role: "CEO",
          },
          {
            quote:
              "The weekly report is the first thing I read on Sunday. It tells me things about my week that I didn't see while I was living it.",
            name: "Priya M.",
            role: "VP Product",
          },
          {
            quote:
              "I've tried every productivity system. Acuity is the only one that requires no setup, no maintenance, and gets more valuable over time.",
            name: "James K.",
            role: "Founder",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="$19/month for a personal performance system"
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="You track your MRR. Your burn rate. Your pipeline. Start tracking what's actually running your business — your mind."
        buttonText="Sign Up for the Waitlist — Get Your First Month Free"
        utmCampaign={UTM}
      />

      <Footer />
    </div>
  );
}
