"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  LandingNav,
  Footer,
  HeroHeadline,
  Reveal,
  PulsingCTA,
  SocialProofBar,
  TrustStrip,
  FAQSection,
  useCtaHref,
} from "@/components/landing-shared";
import { type PersonaPage } from "@/lib/persona-pages";
import {
  TestimonialCarousel,
  buildTestimonialsWithLeader,
} from "@/components/testimonial-carousel";
import { TryItNowButtonDark } from "@/components/try-it-now-button";

// Lazy-load ParallaxOrbs — GPU-heavy, not needed for first paint
const ParallaxOrbs = dynamic(
  () => import("@/components/landing-shared").then((m) => {
    const Comp = m.ParallaxOrbs;
    return { default: Comp };
  }),
  { ssr: false }
);

export function StaticPersonaPage({ page, slug }: { page: PersonaPage; slug: string }) {
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

      <section className="relative pt-36 pb-16 sm:pt-44 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal><HeroHeadline text={page.headline} /></Reveal>
          <Reveal delay={1}><p className="mt-6 text-lg text-[#B0A898] leading-relaxed max-w-2xl mx-auto">{page.subheadline}</p></Reveal>
          <Reveal delay={2}>
            <div className="mt-8 flex flex-col items-center gap-3">
              <div className="flex flex-row items-center gap-3">
                <PulsingCTA href={ctaHref}>Start Free Trial</PulsingCTA>
                <TryItNowButtonDark />
              </div>
              <p className="text-xs text-[#B0A898]">No credit card. Quick setup.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <SocialProofBar />
      <TestimonialCarousel testimonials={buildTestimonialsWithLeader(page.testimonial)} />

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

      <FAQSection />

      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-2xl bg-[#1E1C1A] border border-white/10 p-12 sm:p-16 text-center relative overflow-hidden">
            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl tracking-tight mb-6">{page.ctaHeadline}</h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href={ctaHref} className="group relative rounded-full p-[2px] transition active:scale-95 hover:scale-[1.02] overflow-hidden">
                  <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                  <span className="relative flex items-center justify-center rounded-full bg-[#7C5CFC] px-7 py-3.5 text-sm font-bold text-white">Start Free Trial</span>
                </a>
                <TryItNowButtonDark />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}

function SimpleHowItWorks() {
  return (
    <section id="how-it-works" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <Reveal><h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">How it works</h2></Reveal>
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            { step: "01", title: "Record", desc: "Open Acuity at night. Hit record. Talk freely. No prompts, no structure, no judgment." },
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
