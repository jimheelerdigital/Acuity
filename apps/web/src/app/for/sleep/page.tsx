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
  BeforeAfterSection,
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

const UTM = "sleep";
const WAITLIST = `/auth/signup?utm_campaign=${UTM}`;

export default function SleepPage() {
  return (
    <div className="min-h-screen bg-[#0F0D0B] text-white pb-24 sm:pb-0 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://getacuity.io" },
              { "@type": "ListItem", position: 2, name: "Use Cases", item: "https://getacuity.io/for/therapy" },
              { "@type": "ListItem", position: 3, name: "Acuity for Sleep", item: "https://getacuity.io/for/sleep" },
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
            <HeroHeadline text="Can't sleep because your brain won't stop?" />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#B0A898] leading-relaxed max-w-2xl mx-auto">
              Racing thoughts at night aren't a sleep problem — they're an
              unprocessed thoughts problem. Acuity gives you 60 seconds to get it all
              out before bed.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={WAITLIST}>
                Start Free Trial
              </PulsingCTA>
              <a
                href="#how-it-works"
                className="rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-[#B0A898] transition hover:border-white/20 hover:bg-white/5 active:scale-95"
              >
                See how it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-6">
              <UrgencyBadge text="What if falling asleep only took 60 seconds of talking?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── THE RELATABLE OPENING ───── */}
      <section className="px-6 py-24 sm:py-32 bg-[#151210]">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <div className="space-y-4 text-xl sm:text-2xl font-medium text-[#B0A898] leading-relaxed">
              <p className="text-white">It's 11pm.</p>
              <p className="text-white">You should be asleep.</p>
              <p>
                Instead you're running through everything you said today,
              </p>
              <p>everything you didn't finish,</p>
              <p>everything you're worried about tomorrow.</p>
              <p className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 font-bold text-2xl sm:text-3xl pt-4">
                Sound familiar?
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── THE SCIENCE ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <div className="rounded-2xl border border-white/10 bg-[#151210] p-8 sm:p-12 shadow-sm">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-4">
                Why your brain won't stop.
              </h2>
              <p className="text-[#B0A898] leading-relaxed">
                Your mind treats unprocessed thoughts like open browser tabs. They stay
                active, consuming energy, until they're acknowledged and filed. The
                debrief is the oldest sleep trick in existence — getting
                thoughts out of your head and onto something external so your brain
                finally lets go. Acuity makes it take 60 seconds. And then organizes
                everything automatically.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to try the 60-second ritual that quiets your racing mind?"
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
              "Open Acuity. Hit record. Say everything that's on your mind. Tasks, worries, wins, frustrations. No filter.",
          },
          {
            label: "Step 2",
            title: "Release",
            description:
              "The moment you stop recording, your brain knows those thoughts are captured. The open loops close. The tabs shut.",
          },
          {
            label: "Step 3",
            title: "Wake up organized",
            description:
              "Your tasks are extracted, your goals updated, your mood logged — all while you slept.",
          },
        ]}
        extractTasks={[
          { text: "Reply to Sarah's email" },
          { text: "Cancel tomorrow's 8am meeting" },
          { text: "Pick up prescription" },
        ]}
        extractGoal="Get back to a consistent sleep schedule"
        extractMood="Tired but relieved after talking it out"
        reflectPattern="Sleep quality improves on days you debrief before winding down."
        reflectActions={["Debrief before winding down", "Limit screen time in the evening", "Morning walk on low-sleep days"]}
      />

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What if you could finally stop staring at the ceiling?"
        subheadline="No card. 90 seconds to set up. · cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── BEFORE / AFTER ───── */}
      <BeforeAfterSection
        before={[
          "Lying awake replaying everything",
          "Forgetting tasks by morning",
          "Mind still running at midnight",
        ]}
        after={[
          "Brain emptied in 60 seconds",
          "Tasks captured automatically",
          "Mind finally quiet",
        ]}
      />

      <TrustStrip />

      {/* ───── SLEEP STATS ───── */}
      <StatsSection
        stats={[
          { value: 23, suffix: " min", label: "Average reduction in time to fall asleep" },
          { value: 78, suffix: "%", label: "Report better sleep quality" },
          { value: 67, suffix: "s", label: "Average debrief duration" },
        ]}
      />
      <div className="text-center -mt-6 mb-12">
        <p className="text-xs text-[#B0A898]/60 italic">Based on user-reported survey data</p>
      </div>

      {/* ───── NIGHTLY RITUAL ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Make it part of your daily wind-down.
            </h2>
            <p className="mt-6 text-lg text-[#B0A898] leading-relaxed">
              Acuity works best as a daily ritual. Same time
              each day — many people use it right before they put their phone down. 60 seconds.
              Everything out. Mind clear.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-lg mx-auto">
              <div className="rounded-2xl border border-white/10 bg-[#1C1917] p-6 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4 mx-auto">
                  <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold mb-1">Daily reminder</h3>
                <p className="text-xs text-[#B0A898]">
                  Set a custom time to get your daily debrief reminder
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#1C1917] p-6 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 mx-auto">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold mb-1">Streak tracking</h3>
                <p className="text-xs text-[#B0A898]">
                  Build your streak and watch consistency compound
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <TestimonialsSection
        headline="Sleep stories"
        testimonials={[
          {
            quote:
              "I used to lie awake for an hour running through my to-do list. 60 seconds with Acuity and I'm asleep in 10 minutes.",
            name: "Rachel T.",
            role: "Project Manager",
          },
          {
            quote:
              "My therapist suggested journaling before bed. I could never make myself write. Acuity is the first thing that actually worked.",
            name: "James K.",
            role: "Founder",
          },
          {
            quote:
              "I didn't download it for sleep. But better sleep is the most unexpected benefit I've gotten from it.",
            name: "Mia L.",
            role: "Designer",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="Better sleep for $12.99/month"
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your brain has been waiting for somewhere to put all of this."
        subheadline="Tonight. 60 seconds. See what happens."
        buttonText="Start Free Trial"
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
