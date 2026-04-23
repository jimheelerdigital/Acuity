"use client";

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
  StickyCTA,
} from "@/components/landing-shared";
import { getPersonaBySlug } from "@/lib/persona-pages";
import { notFound } from "next/navigation";

export default function PersonaLandingPage({ params }: { params: { slug: string } }) {
  const page = getPersonaBySlug(params.slug);
  if (!page) notFound();

  const UTM = params.slug;
  const WAITLIST = `/auth/signup?utm_campaign=${UTM}`;

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-24 sm:pb-0 overflow-x-hidden">
      <LandingNav />

      {/* Schema.org markup */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebPage",
            name: page.title,
            description: page.metaDescription,
            url: `https://getacuity.io/for/${params.slug}`,
            publisher: {
              "@type": "Organization",
              name: "Acuity",
              url: "https://getacuity.io",
            },
          }),
        }}
      />

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <Reveal>
            <HeroHeadline text={page.headline} />
          </Reveal>
          <Reveal delay={1}>
            <p className="mt-6 text-lg text-[#A0A0B8] leading-relaxed max-w-2xl mx-auto">
              {page.subheadline}
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
        </div>
      </section>

      <SocialProofBar />

      {/* ───── PAIN POINTS ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {page.painPoints.map((point, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="h-full rounded-xl border border-white/10 bg-[#13131F] p-8 transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
                  <div className="h-10 w-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center mb-5">
                    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-sm leading-relaxed text-[#A0A0B8]">{point}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── SOLUTION ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
              {page.solutionHeadline}
            </h2>
            <p className="text-lg text-[#A0A0B8] leading-relaxed">
              {page.solutionBody}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section id="how-it-works" className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">
              How it works
            </h2>
          </Reveal>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                title: "Record",
                desc: "Open Acuity at night. Hit record. Talk freely for 60 seconds. No prompts, no structure, no judgment.",
              },
              {
                step: "02",
                title: "AI Extracts",
                desc: "By morning, your tasks are on a list, your goals are tracked, and your mood is scored. You didn't type a word.",
              },
              {
                step: "03",
                title: "You See Results",
                desc: "Your summary card appears instantly. Every Sunday, get a weekly narrative report about your life.",
              },
            ].map((item, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="text-center">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#7C5CFC]/10 text-[#7C5CFC] font-bold text-sm mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                  <p className="text-sm text-[#A0A0B8] leading-relaxed">{item.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <TrustStrip />

      {/* ───── FEATURES ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-14">
              Built for you
            </h2>
          </Reveal>
          <div className="grid gap-6 sm:grid-cols-3">
            {page.features.map((f, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#13131F] p-6 transition-all duration-300 hover:border-white/20 hover:-translate-y-1">
                  <div className="h-10 w-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center mb-4">
                    <svg className="h-5 w-5 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-[#A0A0B8] leading-relaxed">{f.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── TESTIMONIAL ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <div className="rounded-xl border border-[#7C5CFC]/20 bg-[#13131F] p-8 sm:p-10">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-base sm:text-lg text-[#A0A0B8] leading-relaxed italic mb-6">
                "{page.testimonial.quote}"
              </blockquote>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#7C5CFC]/20 text-sm font-bold text-[#7C5CFC]">
                  {page.testimonial.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{page.testimonial.name}</div>
                  <div className="text-xs text-[#A0A0B8]">{page.testimonial.detail}</div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── PRICING ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-md text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Simple pricing
            </h2>
            <p className="text-[#A0A0B8] text-lg mb-10">
              One plan. Everything included. Cancel anytime.
            </p>
          </Reveal>
          <Reveal delay={1}>
            <div className="rounded-xl border border-white/10 bg-[#13131F] p-8 text-left">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold uppercase tracking-wider text-[#7C5CFC]">Pro</span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
                  30-day free trial
                </span>
              </div>
              <p className="flex items-baseline gap-1 mb-6">
                <span className="text-5xl font-extrabold">$12.99</span>
                <span className="text-[#A0A0B8]">/month</span>
              </p>
              <ul className="space-y-3 text-sm text-[#A0A0B8] mb-8">
                {["Unlimited voice entries", "AI task & goal extraction", "Mood tracking & analytics", "Weekly insight reports", "Life Matrix dashboard", "Data export anytime"].map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={WAITLIST}
                className="block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-95"
              >
                Start Free Trial
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <FAQSection />

      {/* ───── FINAL CTA ───── */}
      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-2xl bg-[#13131F] border border-white/10 p-12 sm:p-16 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-[#7C5CFC]/10 -translate-y-1/3 translate-x-1/4 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-[#7C5CFC]/10 translate-y-1/3 -translate-x-1/4 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl tracking-tight mb-6">
                {page.ctaHeadline}
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href={WAITLIST}
                  className="rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] hover:-translate-y-0.5 active:scale-95"
                >
                  Start Free Trial
                </Link>
                <span className="text-sm text-[#A0A0B8]">
                  Then $12.99/month &middot; No card. 90 seconds to set up.
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
      <StickyCTA utmCampaign={UTM} />
    </div>
  );
}
