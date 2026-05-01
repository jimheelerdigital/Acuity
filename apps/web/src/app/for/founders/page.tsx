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
  HowItWorksSection,
  ComparisonTable,
  StatsSection,
  TestimonialsSection,
  PricingSection,
  CTABanner,
  AnimatedCounter,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  StickyCTA,
} from "@/components/landing-shared";

const UTM = "founders";
const WAITLIST = `/auth/signup?utm_campaign=${UTM}`;

export default function FoundersPage() {
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
              { "@type": "ListItem", position: 3, name: "Acuity for Founders", item: "https://getacuity.io/for/founders" },
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
            <HeroHeadline text="Your nightly debrief. 60 seconds. AI does the rest." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed max-w-2xl mx-auto">
              Every night you go to bed with 40 unfinished thoughts. Acuity captures
              every task, tracks every goal, and writes your weekly debrief
              automatically.
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
              <UrgencyBadge text="What decisions are you avoiding that a debrief would surface?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── FOUNDER PAIN ───── */}
      <PainSection
        points={[
          "Decision fatigue is real. You make 100 decisions a day. By 10pm your brain is full and you have nowhere to put it.",
          "Your best thinking happens after hours. It disappears by morning. Voice memos go nowhere. Notion stays empty.",
          "You track everything in your business. You track nothing about yourself. That's the gap killing your performance.",
        ]}
      />

      {/* ───── FOUNDER STATS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-center mb-10 text-white">
              Founders who use Acuity report
            </h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              "Fewer forgotten tasks",
              "Clearer weekly priorities",
              "Less mental overhead at bedtime",
            ].map((stat, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#13131F] p-6 text-center">
                  <div className="h-10 w-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center mb-4 mx-auto">
                    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-white">{stat}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── WHAT ACUITY EXTRACTS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4">
              What Acuity extracts from a founder debrief
            </h2>
            <p className="text-center text-[#A0A0B8] mb-12">
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
                <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#13131F] p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
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
                  <p className="text-sm text-[#A0A0B8] font-medium">{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to start capturing every idea, task, and decision automatically?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

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

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What would your performance look like if you debriefed every night?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── WEEKLY PERFORMANCE REPORT ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4">
              Your Sunday morning debrief. Written by AI.
            </h2>
            <p className="text-center text-[#A0A0B8] mb-12">
              Framed as a performance report, not a wellness diary.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="rounded-2xl border border-white/10 bg-[#13131F] p-8 shadow-sm">
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
                    <span className="text-sm text-[#A0A0B8]">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-xl bg-[#7C5CFC]/10 border border-[#7C5CFC]/30 p-4">
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
                  <span className="text-sm text-[#7C5CFC] font-medium">
                    + One key insight the AI surfaced that you missed
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── COMPOUNDING INTELLIGENCE ───── */}
      <section className="px-6 py-24 sm:py-32 bg-[#13131F] text-white">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              The longer you use it, the smarter it gets about you.
            </h2>
            <p className="mt-6 text-lg text-zinc-400 leading-relaxed">
              After 90 days, Acuity has processed everything you've said about your
              business, your team, your goals, and your mental state. It knows your
              patterns better than your co-founder. It remembers every goal you've
              set, every concern you've voiced, every decision you've been
              avoiding.{" "}
              <span className="text-white font-semibold">
                That's your competitive advantage.
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
              { feature: "Cost", values: ["$500+/month", "$600+/month", "$12.99/month"] },
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
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              60 seconds a night.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                7 minutes a week.
              </span>
            </h2>
            <p className="mt-4 text-lg text-[#A0A0B8] mb-8">
              That's the total time investment. In return:
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
                  <span className="text-sm text-[#A0A0B8]">{item}</span>
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
        headline="$12.99/month for a personal performance system"
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      <TrustStrip />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="You track your MRR. Your burn rate. Your pipeline. Start tracking what's actually running your business — your mind."
        buttonText="Start Free Trial"
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
