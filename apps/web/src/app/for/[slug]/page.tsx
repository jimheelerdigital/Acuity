"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LandingNav,
  Footer,
  ParallaxOrbs,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  HowItWorksSection,
  TestimonialsSection,
  StatsSection,
  useCtaHref,
  type Testimonial,
  type Stat,
} from "@/components/landing-shared";
import { getPersonaBySlug, type PersonaPage } from "@/lib/persona-pages";
import { FoundingMemberBanner } from "@/components/founding-member-banner";

/** Shape of a DB-driven landing page from AdLab */
interface DynamicLandingPage {
  slug: string;
  heroHeadline: string;
  heroSubheadline: string;
  painPoints: string[];
  valuePropHeadline: string;
  valueProps: string[];
  testimonialQuote: string | null;
  testimonialName: string | null;
  closingHeadline: string | null;
  ctaText: string;
  metaTitle: string;
  metaDescription: string;
}

export default function PersonaLandingPage({ params }: { params: { slug: string } }) {
  const staticPage = getPersonaBySlug(params.slug);
  const [dynamicPage, setDynamicPage] = useState<DynamicLandingPage | null>(null);
  const [notFound, setNotFound] = useState(false);

  const ctaHref = `/auth/signup?ref=${params.slug}&utm_source=meta&utm_medium=paid&utm_campaign=${params.slug}`;

  useEffect(() => {
    try {
      const { setAttributionCookie } = require("@/lib/attribution");
      setAttributionCookie({ landingPath: `/for/${params.slug}` });
    } catch {}
  }, [params.slug]);

  // If no static page, fetch from DB
  useEffect(() => {
    if (staticPage) return;
    fetch(`/api/landing-page/${params.slug}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data?.landingPage) setDynamicPage(data.landingPage);
      })
      .catch(() => setNotFound(true));
  }, [params.slug, staticPage]);

  // Static persona page
  if (staticPage) {
    return <StaticPersonaPage page={staticPage} slug={params.slug} />;
  }

  // Dynamic landing page from DB
  if (dynamicPage) {
    return <DynamicLandingPageView page={dynamicPage} slug={params.slug} ctaHref={ctaHref} />;
  }

  // Not found
  if (notFound) {
    return (
      <div className="min-h-screen bg-[#181614] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Page not found</h1>
          <Link href="/" className="text-[#7C5CFC] hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="min-h-screen bg-[#181614] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-[#7C5CFC] border-t-transparent animate-spin" />
    </div>
  );
}

/** The original static persona landing page (unchanged behavior) */
function StaticPersonaPage({ page, slug }: { page: PersonaPage; slug: string }) {
  const ctaHref = useCtaHref();

  return (
    <div className="min-h-screen bg-[#181614] text-white pb-24 sm:pb-0 overflow-x-hidden">
      <LandingNav />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": [
              { "@type": "WebPage", name: page.title, description: page.metaDescription, url: `https://getacuity.io/for/${slug}` },
            ],
          }),
        }}
      />

      {/* Hero */}
      <section className="relative pt-36 pb-16 sm:pt-44 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal><HeroHeadline text={page.headline} /></Reveal>
          <Reveal delay={1}><p className="mt-6 text-lg text-[#B0A898] leading-relaxed max-w-2xl mx-auto">{page.subheadline}</p></Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <PulsingCTA href={ctaHref}>Start Free Trial</PulsingCTA>
              <a href="#how-it-works" className="rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-[#B0A898] transition hover:border-white/20 hover:bg-white/5 active:scale-95">See how it works</a>
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />

      {/* Pain Points */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {page.painPoints.map((point, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="h-full rounded-xl border border-white/10 bg-[#1E1C1A] p-8 transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
                  <div className="h-10 w-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center mb-5">
                    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                  </div>
                  <p className="text-sm leading-relaxed text-[#B0A898]">{point}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">{page.solutionHeadline}</h2>
            <p className="text-lg text-[#B0A898] leading-relaxed">{page.solutionBody}</p>
          </Reveal>
        </div>
      </section>

      <SimpleHowItWorks />
      <TrustStrip />

      {/* Features */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal><h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">Built for you</h2></Reveal>
          <div className="grid gap-6 sm:grid-cols-3">
            {page.features.map((f, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#1E1C1A] p-6 transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
                  <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-[#B0A898] leading-relaxed">{f.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <div className="rounded-xl border border-[#7C5CFC]/20 bg-[#1E1C1A] p-8 sm:p-10">
              <blockquote className="text-base sm:text-lg text-[#B0A898] leading-relaxed italic mb-6">&ldquo;{page.testimonial.quote}&rdquo;</blockquote>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C5CFC]/20 text-sm font-bold text-[#7C5CFC]">{page.testimonial.name[0]}</div>
                <div>
                  <div className="text-sm font-semibold text-white">{page.testimonial.name}</div>
                  <div className="text-xs text-[#B0A898]">{page.testimonial.detail}</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <FAQSection />

      {/* Final CTA */}
      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-2xl bg-[#1E1C1A] border border-white/10 p-12 sm:p-16 text-center relative overflow-hidden">
            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl tracking-tight mb-6">{page.ctaHeadline}</h2>
              <a href={ctaHref} className="rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] active:scale-95">Start Free Trial</a>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Dynamic landing page from AdLab experiment — FULL REDESIGN
   Matches homepage design system exactly.
   ═══════════════════════════════════════════════════ */

/** Static testimonials that work for any angle */
const STATIC_TESTIMONIALS: Testimonial[] = [
  {
    quote: "The weekly reports are unreal. It\u2019s like having a therapist and a project manager rolled into one AI.",
    name: "Marcus T.",
    role: "Product manager",
  },
  {
    quote: "I\u2019ve tried every journaling app. This is the first one that stuck because I just talk. No typing, no prompts, no effort.",
    name: "Jamie L.",
    role: "Freelance designer",
  },
];

/** Social proof stats */
const SOCIAL_PROOF_STATS: Stat[] = [
  { value: 4.9, suffix: " \u2605", label: "App Store rating" },
  { value: 12, suffix: "+", label: "Countries" },
  { value: 94, suffix: "%", label: "Still journaling after week one" },
];

function DynamicLandingPageView({ page, slug, ctaHref }: { page: DynamicLandingPage; slug: string; ctaHref: string }) {
  // Build testimonials array: DB testimonial first, then 2 static ones
  const testimonials: Testimonial[] = [];
  if (page.testimonialQuote && page.testimonialName) {
    testimonials.push({
      quote: page.testimonialQuote,
      name: page.testimonialName,
      role: "Acuity member",
    });
  }
  testimonials.push(...STATIC_TESTIMONIALS);

  return (
    <div className="min-h-screen bg-[#181614] text-[#F5EDE4] overflow-x-hidden">
      {/* 1. Founding Member Banner */}
      <FoundingMemberBanner />

      {/* 2. Nav */}
      <LandingNav />

      {/* 3. Hero Section */}
      <section className="relative pt-36 pb-16 sm:pt-44 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text={page.heroHeadline} />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#B0A898] leading-relaxed max-w-2xl mx-auto">
              {page.heroSubheadline}
            </p>
          </Reveal>
          <Reveal delay={2}>
            <div className="mt-8">
              <PulsingCTA href={ctaHref}>
                Start Free Trial — 30 Days Free
              </PulsingCTA>
              <p className="mt-3 text-xs text-[#B0A898]">
                No credit card. 90 seconds to set up.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 4. Pain Points — "Sound familiar?" */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="text-center text-sm font-semibold text-[#E8DDD0] uppercase tracking-widest mb-10">
              Sound familiar?
            </p>
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2">
            {page.painPoints.map((point, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-[#1E1C1A] p-6 transition-all duration-300 hover:border-white/20 hover:-translate-y-0.5">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7C5CFC]/10">
                    <svg className="h-4 w-4 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed text-[#B0A898]">{point}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* 5. What is Acuity? — static product explainer */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl text-white">
                One minute of talking. A week of clarity.
              </h2>
              <p className="mt-6 text-lg text-[#B0A898] leading-relaxed max-w-3xl mx-auto">
                Acuity is an AI voice journal. Talk about your day for one minute — any time, no prompts, no typing.
                AI extracts your tasks, tracks your goals, detects patterns in your life, and every Sunday delivers
                a 400-word report that tells the story of your week.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* 6. How It Works — reuse homepage 3-step section with phone mockups */}
      <HowItWorksSection
        steps={[
          { label: "Step 1", title: "Record", description: "Open Acuity at night. Hit record. Speak freely for 60 seconds about your day, your worries, your wins — whatever comes to mind." },
          { label: "Step 2", title: "Extract", description: "By morning, your tasks are on a list, your goals are tracked, and your mood is scored. You didn\u2019t type a word." },
          { label: "Step 3", title: "Reflect", description: "Get a weekly narrative report showing patterns in your life, so you can course-correct before the next week starts." },
        ]}
        extractTasks={[
          { text: "Send proposal to client" },
          { text: "Buy groceries" },
          { text: "Call mom" },
        ]}
        extractGoal="Ship the beta this week"
        extractMood="Energized but slightly anxious"
        reflectPattern="Best mood on days you exercised. Worst on days with meetings after 6pm."
        reflectActions={["Block mornings for deep work", "No meetings after 5pm", "Exercise before noon"]}
      />

      {/* 7. Value Props — 2x2 grid */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl text-white mb-14">
              {page.valuePropHeadline}
            </h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-2">
            {page.valueProps.map((prop, i) => {
              // Bold the first few words as a title
              const words = prop.split(" ");
              const titleEnd = Math.min(words.length, 4);
              const title = words.slice(0, titleEnd).join(" ");
              const rest = words.slice(titleEnd).join(" ");
              return (
                <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                  <div className="rounded-xl border border-white/10 bg-[#1E1C1A] p-6 transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7C5CFC]/20">
                        <svg className="h-3.5 w-3.5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-sm text-[#B0A898] leading-relaxed">
                        <span className="font-semibold text-white">{title}</span>
                        {rest ? ` ${rest}` : ""}
                      </p>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* 8. Testimonials — 3 cards */}
      <TestimonialsSection testimonials={testimonials} headline="People are loving it" />

      {/* 9. Social Proof Bar with animated counters */}
      <StatsSection stats={SOCIAL_PROOF_STATS} />

      {/* 10. Final CTA Section */}
      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-[#1E1C1A] p-12 sm:p-16 text-center relative overflow-hidden">
            {/* Subtle gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#7C5CFC]/5 via-transparent to-[#7C5CFC]/5 pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl tracking-tight text-white mb-6">
                {page.closingHeadline || "Your week doesn\u2019t have to disappear."}
              </h2>
              <a
                href={ctaHref}
                className="inline-block rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] hover:-translate-y-0.5 active:scale-95"
              >
                Start Free Trial — 30 Days Free
              </a>
              <p className="mt-3 text-sm text-[#B0A898]">
                No credit card. Cancel anytime.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      {/* 11. Footer */}
      <Footer />
    </div>
  );
}

/** Simple "How it works" section — text-only, used by static persona pages */
function SimpleHowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <Reveal><h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">How it works</h2></Reveal>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            { step: "01", title: "Record", desc: "Open Acuity at night. Hit record. Talk freely for 60 seconds. No prompts, no structure, no judgment." },
            { step: "02", title: "AI Extracts", desc: "By morning, your tasks are on a list, your goals are tracked, and your mood is scored. You didn\u2019t type a word." },
            { step: "03", title: "You See Results", desc: "Your summary card appears instantly. Every Sunday, get a weekly narrative report about your life." },
          ].map((item, i) => (
            <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
              <div className="text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] font-bold text-sm mb-4">{item.step}</div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-[#B0A898] leading-relaxed">{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
