"use client";

import { useEffect, useState, useRef } from "react";
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
  ExtractPhone,
  useCtaHref,
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

  if (staticPage) return <StaticPersonaPage page={staticPage} slug={params.slug} />;
  if (dynamicPage) return <DynamicLandingPageView page={dynamicPage} slug={params.slug} ctaHref={ctaHref} />;
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
  return (
    <div className="min-h-screen bg-[#181614] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-[#7C5CFC] border-t-transparent animate-spin" />
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Static persona page (unchanged)
   ═══════════════════════════════════════════════════ */

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

      {/* Testimonial carousel — trust block */}
      <TestimonialCarousel testimonials={buildStaticTestimonials(page.testimonial)} />

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
   DYNAMIC LANDING PAGE — FULL REDESIGN
   ═══════════════════════════════════════════════════ */

/** All 5 testimonials for the carousel */
interface CarouselTestimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
  bgColor: string;
  imageSrc?: string;
}

/** Gender-split fallback headshot pools */
const FALLBACK_FEMALE = [
  "/testimonials/rachel-w.png",
  "/testimonials/nina-s.png",
  "/testimonials/maya-p.png",
  "/testimonials/emma-r.png",
  "/testimonials/lisa-t.png",
  "/testimonials/aisha-n.png",
  "/testimonials/sofia-g.png",
  "/testimonials/sarah-k.png",
];
const FALLBACK_MALE = [
  "/testimonials/alex-m.png",
  "/testimonials/tom-h.png",
  "/testimonials/james-c.png",
  "/testimonials/chris-b.png",
  "/testimonials/daniel-j.png",
  "/testimonials/mike-d.png",
  "/testimonials/ryan-f.png",
  "/testimonials/kevin-l.png",
];
/** Common female first names for gender detection */
const FEMALE_NAMES = new Set([
  "sarah", "jamie", "priya", "emma", "nina", "maya", "lisa", "aisha", "sofia",
  "rachel", "jessica", "jennifer", "amanda", "ashley", "stephanie", "nicole",
  "elizabeth", "heather", "megan", "emily", "anna", "maria", "laura", "kate",
  "katherine", "olivia", "ava", "sophia", "isabella", "mia", "charlotte",
  "amelia", "harper", "evelyn", "abigail", "ella", "lily", "grace", "chloe",
  "natalie", "hannah", "zoe", "riley", "leah", "audrey", "savannah", "claire",
  "samantha", "victoria", "madison", "diana", "andrea", "carmen", "rosa",
  "fatima", "anika", "devi", "pooja", "neha", "riya", "ananya", "shreya",
  "mei", "yuki", "hana", "lin", "wei", "jing", "suki", "kim", "ji", "yuna",
]);

const STATIC_CAROUSEL_TESTIMONIALS: CarouselTestimonial[] = [
  {
    quote: "The weekly reports are unreal. It\u2019s like having a therapist and a project manager rolled into one AI.",
    name: "Marcus T.",
    role: "Product manager",
    initials: "MT",
    bgColor: "bg-sky-600",
    imageSrc: "/testimonials/marcus-t.png",
  },
  {
    quote: "I\u2019ve tried every journaling app. This is the first one that stuck because I just talk.",
    name: "Jamie L.",
    role: "Designer",
    initials: "JL",
    bgColor: "bg-rose-500",
    imageSrc: "/testimonials/jamie-l.png",
  },
  {
    quote: "I mentioned \u2018morning routine\u2019 12 times in two weeks but never built one. Seeing that in my report changed everything.",
    name: "Priya R.",
    role: "Consultant",
    initials: "PR",
    bgColor: "bg-emerald-600",
    imageSrc: "/testimonials/priya-r.png",
  },
  {
    quote: "My partner noticed the difference before I did. I\u2019m actually present when I get home now.",
    name: "David K.",
    role: "Engineer",
    initials: "DK",
    bgColor: "bg-amber-600",
    imageSrc: "/testimonials/david-k.png",
  },
];

/** Pick a deterministic gender-appropriate fallback headshot */
function pickFallbackHeadshot(name: string): string {
  const firstName = name.split(" ")[0].toLowerCase();
  const pool = FEMALE_NAMES.has(firstName) ? FALLBACK_FEMALE : FALLBACK_MALE;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
}

/** Build carousel testimonials from a static persona page's single testimonial + shared static ones */
function buildStaticTestimonials(testimonial: { quote: string; name: string; detail: string }): CarouselTestimonial[] {
  const parts = testimonial.name.split(" ");
  const initials = parts.length >= 2
    ? (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase()
    : testimonial.name.slice(0, 2).toUpperCase();
  return [
    { quote: testimonial.quote, name: testimonial.name, role: testimonial.detail, initials, bgColor: "bg-[#7C5CFC]", imageSrc: pickFallbackHeadshot(testimonial.name) },
    ...STATIC_CAROUSEL_TESTIMONIALS,
  ];
}

function DynamicLandingPageView({ page, slug, ctaHref }: { page: DynamicLandingPage; slug: string; ctaHref: string }) {
  // Build testimonial list: DB testimonial first, then static ones
  const allTestimonials: CarouselTestimonial[] = [];
  if (page.testimonialQuote && page.testimonialName) {
    const name = page.testimonialName;
    const parts = name.split(" ");
    const initials = parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
    allTestimonials.push({
      quote: page.testimonialQuote,
      name,
      role: "Acuity member",
      initials,
      bgColor: "bg-[#7C5CFC]",
      imageSrc: pickFallbackHeadshot(name),
    });
  }
  allTestimonials.push(...STATIC_CAROUSEL_TESTIMONIALS);

  return (
    <div className="min-h-screen bg-[#181614] text-[#F5EDE4] overflow-x-hidden">
      {/* 1. Founding Member Banner */}
      <FoundingMemberBanner />

      {/* 2. Nav */}
      <LandingNav />

      {/* 3. Hero — text + phone mockup side by side */}
      <section className="relative pt-32 pb-8 sm:pt-40 sm:pb-12 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
            {/* Text side */}
            <div className="flex-1 text-center lg:text-left">
              <Reveal>
                <SplitHeroHeadline text={page.heroHeadline} />
              </Reveal>
              <Reveal delay={1}>
                <p className="mt-5 text-base sm:text-lg text-[#F5EDE4] leading-relaxed max-w-xl mx-auto lg:mx-0">
                  {page.heroSubheadline}
                  {page.heroSubheadline.length < 120 && (
                    <> Acuity is a 60-second AI voice journal that extracts your tasks, tracks your goals, scores your mood, spots the patterns you can't see, and every Sunday delivers a report that tells the story of your week.</>
                  )}
                </p>
              </Reveal>
              <Reveal delay={2}>
                <div className="mt-6">
                  <PulsingCTA href={ctaHref}>
                    Start Free Trial — 30 Days Free
                  </PulsingCTA>
                  <p className="mt-2.5 text-xs text-[#B0A898]">
                    No credit card. 90 seconds to set up.
                  </p>
                </div>
              </Reveal>
            </div>
            {/* Phone mockup — shows Today's Debrief */}
            <div className="flex-shrink-0 flex justify-center mt-10 lg:mt-0">
              <Reveal delay={2}>
                <div className="animate-hero-float">
                  <ExtractPhone
                    tasks={[
                      { text: "Follow up on proposal", checked: true },
                      { text: "Book dentist appointment" },
                      { text: "Call Mom this weekend" },
                    ]}
                    goal="Be more present at home"
                    mood="Calm but tired"
                  />
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Social Proof Bar — inline, matching homepage */}
      <SocialProofBar />

      {/* 5. Testimonials — directly under social proof, minimal gap */}
      <TestimonialCarousel testimonials={allTestimonials} />

      {/* 6. Pain Points — "Sound familiar?" — single column, purple left border */}
      <section className="px-6 py-14 sm:py-18">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <p className="text-center text-xs font-semibold text-[#E8DDD0] uppercase tracking-widest mb-5">
              Sound familiar?
            </p>
          </Reveal>
          <div className="space-y-2.5">
            {page.painPoints.map((point, i) => (
              <SlideIn key={i} direction="left" delay={i * 200}>
                <div className="rounded-lg border border-white/10 bg-[#1E1C1A] border-l-[3px] border-l-[#7C5CFC] py-3.5 px-5">
                  <p className="text-base leading-relaxed text-[#F5EDE4]">{point}</p>
                </div>
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* 7. How It Works — compact 3-step */}
      <HowItWorksSection
        steps={[
          { label: "Step 1", title: "Record", description: "Hit record. Speak freely for 60 seconds about your day — whatever comes to mind." },
          { label: "Step 2", title: "Extract", description: "Within minutes, your tasks are on a list, your goals are tracked, and your mood is scored." },
          { label: "Step 3", title: "Reflect", description: "Every Sunday, get a weekly narrative report showing patterns in your life." },
        ]}
        extractTasks={[{ text: "Send proposal" }, { text: "Buy groceries" }, { text: "Call mom" }]}
        extractGoal="Ship the beta this week"
        extractMood="Energized but anxious"
        reflectPattern="Best mood on days you exercised."
        reflectActions={["Block mornings for deep work", "No meetings after 5pm", "Exercise before noon"]}
      />

      {/* 8. Value Props — 2x2 grid */}
      <section className="px-6 py-14 sm:py-18">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl text-white mb-10">
              {page.valuePropHeadline}
            </h2>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {page.valueProps.map((prop, i) => {
              const words = prop.split(" ");
              const titleEnd = Math.min(words.length, 4);
              const title = words.slice(0, titleEnd).join(" ");
              const rest = words.slice(titleEnd).join(" ");
              return (
                <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                  <div className="rounded-xl border border-white/10 bg-[#1E1C1A] p-5 transition-all duration-300 hover:border-white/20">
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

      {/* 9. Final CTA */}
      <section className="px-6 py-14 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#1E1C1A] p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#7C5CFC]/5 via-transparent to-[#7C5CFC]/5 pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl font-bold sm:text-3xl tracking-tight text-white mb-5">
                {page.closingHeadline || "Your week doesn\u2019t have to disappear."}
              </h2>
              <a
                href={ctaHref}
                className="inline-block rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white transition hover:bg-[#6B4FE0] hover:-translate-y-0.5 active:scale-95"
              >
                Start Free Trial — 30 Days Free
              </a>
              <p className="mt-2.5 text-sm text-[#B0A898]">
                No credit card. Cancel anytime.
              </p>
              <p className="mt-4 text-xs text-[#B0A898]/60">
                <span className="text-amber-400">4.9 ★</span> on the App Store
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

/* ═══════════════════════════════════════════════════
   Testimonial carousel — auto-scrolls on desktop,
   vertical stack on mobile
   ═══════════════════════════════════════════════════ */

function TestimonialCarousel({ testimonials }: { testimonials: CarouselTestimonial[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 640) return;

    let offset = 0;
    let animId: number;
    // ~260px card + 12px gap = 272px per card. One card per 4s at 60fps = 272/(4*60) ≈ 1.13px/frame
    const speed = 1.13;

    function step() {
      if (!paused) {
        offset += speed;
        const singleSetWidth = testimonials.length * 272;
        if (offset >= singleSetWidth) offset -= singleSetWidth;
        if (track) track.style.transform = `translateX(-${offset}px)`;
      }
      animId = requestAnimationFrame(step);
    }
    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [paused, testimonials.length]);

  const doubled = [...testimonials, ...testimonials];

  return (
    <section className="pt-6 pb-10 sm:pt-8 sm:pb-12 overflow-hidden">
      {/* Desktop: horizontal scrolling carousel — 3 cards visible */}
      <div
        className="hidden sm:block"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="relative">
          <div
            ref={trackRef}
            className="flex gap-3 will-change-transform"
            style={{ width: "max-content" }}
          >
            {doubled.map((t, i) => (
              <TestimonialCard key={`${t.name}-${i}`} testimonial={t} />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile: horizontal peek (1.5 cards visible) */}
      <div className="sm:hidden flex gap-3 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory">
        {testimonials.map((t) => (
          <TestimonialCard key={t.name} testimonial={t} />
        ))}
      </div>
    </section>
  );
}

function TestimonialCard({ testimonial: t }: { testimonial: CarouselTestimonial }) {
  return (
    <div className="w-[230px] sm:w-[260px] shrink-0 snap-start rounded-lg border border-white/10 bg-[#1E1C1A] p-3.5 sm:p-4">
      <div className="flex items-center gap-0.5 mb-2">
        {[...Array(5)].map((_, i) => (
          <svg key={i} className="h-3 w-3 text-[#7C5CFC]" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <blockquote className="text-xs text-[#B0A898] leading-relaxed mb-3">
        &ldquo;{t.quote}&rdquo;
      </blockquote>
      <div className="flex items-center gap-2">
        {t.imageSrc ? (
          <img src={t.imageSrc} alt={t.name} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className={`flex h-7 w-7 items-center justify-center rounded-full ${t.bgColor} text-[9px] font-bold text-white`}>
            {t.initials}
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-white">{t.name}</div>
          <div className="text-[10px] text-[#B0A898]/60">{t.role}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * SplitHeroHeadline — splits headline on sentence-ending punctuation (.?!)
 * First sentence: white. Second sentence: Acuity purple.
 * If no split point, last 3 words become purple.
 * Uses word-by-word fade-in animation matching the homepage HeroHeadline.
 */
function SplitHeroHeadline({ text }: { text: string }) {
  // Split on the first sentence-ending punctuation followed by a space
  const splitMatch = text.match(/^(.+?[.?!])\s+(.+)$/);
  let whitePart: string;
  let purplePart: string;

  if (splitMatch) {
    whitePart = splitMatch[1];
    purplePart = splitMatch[2];
  } else {
    // No natural split — make the last 3 words purple
    const words = text.split(" ");
    if (words.length > 3) {
      whitePart = words.slice(0, -3).join(" ");
      purplePart = words.slice(-3).join(" ");
    } else {
      whitePart = text;
      purplePart = "";
    }
  }

  const allWords = text.split(" ");
  const whiteWordCount = whitePart.split(" ").length;
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          allWords.forEach((_, i) => {
            setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * 80);
          });
        } else {
          setVisibleCount(0);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [allWords.length]);

  return (
    <h1
      ref={ref}
      className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl leading-[1.08]"
    >
      {allWords.map((word, i) => (
        <span
          key={i}
          className={`inline-block mr-[0.3em] transition-all duration-500 ${
            i < whiteWordCount ? "text-white" : "text-[#7C5CFC]"
          }`}
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateY(0)" : "translateY(20px)",
            transitionDelay: `${i * 60}ms`,
          }}
        >
          {word}
        </span>
      ))}
    </h1>
  );
}

/**
 * SlideIn — directional scroll-reveal using IntersectionObserver + inline styles.
 * Re-triggers every time element scrolls into view. Respects prefers-reduced-motion.
 */
function SlideIn({
  children,
  direction = "left",
  delay = 0,
}: {
  children: React.ReactNode;
  direction?: "left" | "right" | "up";
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const startTransform =
      direction === "left" ? "translateX(-30px)" :
      direction === "right" ? "translateX(30px)" :
      "translateY(20px)";

    el.style.opacity = "0";
    el.style.transform = startTransform;
    el.style.transition = `opacity 0.5s ease-out ${delay}ms, transform 0.5s ease-out ${delay}ms`;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translate(0)";
        } else {
          el.style.opacity = "0";
          el.style.transform = startTransform;
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [direction, delay]);

  return <div ref={ref}>{children}</div>;
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
