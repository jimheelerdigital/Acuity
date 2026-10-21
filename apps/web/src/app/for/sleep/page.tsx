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
  TestimonialsSection,
  PricingSection,
  CTABanner,
  AnimatedCounter,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  StickyCTA,
} from "@/components/landing-shared";
import { displayAnnualAsMonthly } from "@/lib/pricing";

const UTM = "sleep";
const WAITLIST = `/start?utm_campaign=${UTM}`;

export default function SleepPage() {
  return (
    <div className="min-h-screen bg-acuity-bg text-white pb-24 sm:pb-0 overflow-x-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://goripple.io" },
              { "@type": "ListItem", position: 2, name: "Ripple for Sleep", item: "https://goripple.io/for/sleep" },
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
            <p className="mt-6 text-lg text-acuity-text-sec leading-relaxed max-w-2xl mx-auto">
              Racing thoughts are often unfinished thoughts with nowhere to go.
              Ripple is a brain dump app: talk whenever your head is full, and it
              turns the swirl into a to-do list, so it stops living in your head.
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={WAITLIST}>
                Start Free Trial
              </PulsingCTA>
              <a
                href="#how-it-works"
                className="rounded-xl border border-acuity-line px-7 py-3.5 text-sm font-semibold text-acuity-text-sec transition hover:border-acuity-line-strong hover:bg-acuity-card-bg active:scale-95"
              >
                See how it works
              </a>
            </div>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-6">
              <UrgencyBadge text="What if your thoughts had somewhere to go besides your head?" />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── THE RELATABLE OPENING ───── */}
      <section className="px-6 py-24 sm:py-32 bg-acuity-card-bg">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <div className="space-y-4 text-xl sm:text-2xl font-medium text-acuity-text-sec leading-relaxed">
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
            <div className="rounded-2xl border border-acuity-line bg-acuity-card-bg p-8 sm:p-12 shadow-sm">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-4">
                Why your brain won't stop.
              </h2>
              <p className="text-acuity-text-sec leading-relaxed">
                Your mind treats unprocessed thoughts like open browser tabs. They stay
                active, consuming energy, until they're acknowledged and filed. Getting
                thoughts out of your head and onto something external is one of the
                oldest tricks there is, so your brain can stop holding on to them.
                Ripple makes it effortless. And then organizes
                everything automatically.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to give your racing thoughts somewhere to go?"
        subheadline="7-day free trial · Cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── HOW IT WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Debrief",
            description:
              "Open Ripple. Hit record. Say everything that's on your mind. Tasks, worries, wins, frustrations. No filter.",
          },
          {
            label: "Step 2",
            title: "Release",
            description:
              "The moment you stop recording, your brain knows those thoughts are captured. The open loops close. The tabs shut.",
          },
          {
            label: "Step 3",
            title: "Get it back organized",
            description:
              "Within minutes, your tasks are extracted, your habits checked off and your mood logged. You didn't type a word.",
          },
        ]}
        extractTasks={[
          { text: "Reply to Sarah's email" },
          { text: "Cancel tomorrow's 8am meeting" },
          { text: "Pick up prescription" },
        ]}
        extractGoal="Get back to a consistent sleep schedule"
        extractMood="Tired but relieved after talking it out"
        reflectPattern="You mention feeling rested more often on days you talk things through."
        reflectActions={["Talk it out when your head gets full", "Limit screen time in the evening", "Walk on low-sleep days"]}
      />

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What if you could finally stop staring at the ceiling?"
        subheadline="7-day free trial · Cancel anytime"
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
          "Thoughts out of your head and on a list",
          "Tasks captured automatically",
          "Less to hold on to",
        ]}
      />

      <TrustStrip />

      {/* ───── DAILY HABIT ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Make it part of your day.
            </h2>
            <p className="mt-6 text-lg text-acuity-text-sec leading-relaxed">
              Ripple works best as a daily habit. Talk whenever something&apos;s on
              your mind: in the car, on a walk, or when you put your phone down for
              the day. Everything out. Mind clear.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-lg mx-auto">
              <div className="rounded-2xl border border-acuity-line bg-acuity-bg-inset p-6 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4 mx-auto">
                  <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold mb-1">Daily reminder</h3>
                <p className="text-xs text-acuity-text-sec">
                  Set a custom time to get your daily debrief reminder
                </p>
              </div>
              <div className="rounded-2xl border border-acuity-line bg-acuity-bg-inset p-6 shadow-sm">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 mx-auto">
                  <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold mb-1">Streak tracking</h3>
                <p className="text-xs text-acuity-text-sec">
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
              "I used to lie awake running through my to-do list. Now the list lives in Ripple instead of in my head.",
            name: "Rachel T.",
            role: "Project Manager",
          },
          {
            quote:
              "I was told to try journaling. I could never make myself write. Ripple is the first thing that actually stuck.",
            name: "James K.",
            role: "Founder",
          },
          {
            quote:
              "I didn't download it for this. But getting my list out of my head has been the most unexpected benefit.",
            name: "Mia L.",
            role: "Designer",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline={`Everything out of your head for ${displayAnnualAsMonthly()}/month, billed yearly`}
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Your brain has been waiting for somewhere to put all of this."
        subheadline="Just talk. See what happens."
        buttonText="Start Free Trial"
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
