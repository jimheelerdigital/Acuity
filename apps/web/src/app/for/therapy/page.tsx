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
const WAITLIST = `/start?utm_campaign=${UTM}`;

export default function TherapyPage() {
  return (
    <div className="min-h-screen bg-acuity-bg text-white overflow-x-hidden pb-24 sm:pb-0">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://goripple.io" },
              { "@type": "ListItem", position: 2, name: "Ripple for Therapy", item: "https://goripple.io/for/therapy" },
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
            <HeroHeadline text="Walk into your next session knowing what your week looked like." />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-acuity-text-sec leading-relaxed max-w-2xl mx-auto">
              Talk to Ripple whenever something&apos;s on your mind between sessions.
              It tracks your mood and the habits you&apos;re working on, notices what
              keeps coming up, and sends a weekly report every Sunday.
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
              <UrgencyBadge text="Support between sessions. Never a replacement for therapy." />
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* ───── PAIN SECTION ───── */}
      <PainSection
        points={[
          "A week is a long time. By your session, the details have blurred.",
          "Things happen between sessions and there's nowhere to put them.",
          "You walk in trying to remember what actually happened since last time.",
        ]}
      />

      {/* ───── SOLUTION ───── */}
      <SolutionSection
        headline="Ripple keeps track of the days between sessions."
        body="Talk whenever something's on your mind. Ripple tracks your mood, checks off the habits you're working on, notices the themes that keep coming up, and keeps a record you can look back on. Walk into your next session with a clear picture of your week, not just how you feel in that moment."
      />

      <TrustStrip />

      {/* ───── PRE-HOW-IT-WORKS CTA ───── */}
      <MidPageCTA
        headline="Ready to show up to your next session with real data?"
        subheadline="7-day free trial · Cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── HOW IT WORKS ───── */}
      <HowItWorksSection
        steps={[
          {
            label: "Step 1",
            title: "Record",
            description:
              "Open Ripple whenever you're ready. Hit record. Speak freely. No prompts, no structure, no judgment.",
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
        reflectPattern="Stress climbs on Sundays and eases after Monday sessions."
        reflectActions={["Discuss Sunday anxiety pattern", "Add wind-down ritual", "Track sleep vs mood"]}
      />

      {/* ───── MID-PAGE CTA ───── */}
      <MidPageCTA
        headline="What if the last 7 days were already written down when you walked in?"
        subheadline="7-day free trial · Cancel anytime"
        utmCampaign={UTM}
      />

      {/* ───── BETWEEN SESSIONS ───── */}
      <section className="px-6 py-24 sm:py-32 bg-transparent">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-4 text-white">
              What you bring to your next session
            </h2>
            <p className="text-center text-acuity-text-sec mb-12 max-w-xl mx-auto">
              Ripple supports the work you do in therapy. It never replaces it.
            </p>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: "Your mood, day by day", desc: "A simple line of how each day actually felt, not just how you feel walking in." },
              { title: "What kept coming up", desc: "The people, worries and topics you mentioned more than once this week." },
              { title: "The habits you're working on", desc: "Which ones you kept up and which ones slipped, checked off just by mentioning them." },
              { title: "Your weekly report", desc: "Every Sunday, a short written story of your week to read before you go in." },
            ].map((f, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-acuity-line bg-acuity-card-bg p-6">
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-acuity-text-sec leading-relaxed">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── FEATURES ───── */}
      <FeatureGrid
        features={[
          {
            icon: "moon",
            title: "Daily mood tracking",
            description:
              "Log your emotional state every day with zero effort — just speak and Ripple captures it.",
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
              { title: "Mood tracking", desc: "Log your emotional state daily with zero effort — just speak." },
              { title: "Pattern detection", desc: "AI identifies recurring emotional themes across days and weeks." },
              { title: "Weekly report", desc: "Every Sunday, a narrative about your emotional week — wins, spirals, blind spots." },
            ].map((f, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-acuity-line bg-acuity-card-bg p-6 text-center">
                  <div className="h-10 w-10 rounded-xl bg-acuity-primary-soft flex items-center justify-center mb-4 mx-auto">
                    <svg className="h-5 w-5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-xs text-acuity-text-sec leading-relaxed">{f.desc}</p>
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
              "Ripple caught a pattern my therapist and I had been trying to identify for months. It spotted it in 3 weeks.",
            name: "Marcus T.",
            role: "Designer",
          },
          {
            quote:
              "It's the one thing I actually keep up between sessions. I just talk, and the week is there when I need it.",
            name: "Jamie L.",
            role: "Teacher",
          },
        ]}
      />

      {/* ───── PRICING ───── */}
      <PricingSection
        headline="One plan for the days between sessions."
        subheadline="One plan. Everything included. Cancel anytime."
        utmCampaign={UTM}
      />

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <CTABanner
        headline="Bring the whole week to your next session, not just the last day."
        utmCampaign={UTM}
      />

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
