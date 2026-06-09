"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  LandingNav,
  Footer,
  Reveal,
  PulsingCTA,
  SocialProofBar,
  HowItWorksSection,
  ExtractPhone,
} from "@/components/landing-shared";
import {
  TestimonialCarousel,
  STATIC_CAROUSEL_TESTIMONIALS,
  pickFallbackHeadshot,
  type CarouselTestimonial,
} from "@/components/testimonial-carousel";
import type { DynamicLandingPage } from "./page";

// Lazy-load ParallaxOrbs — GPU-heavy blur filters, not needed for first paint
const ParallaxOrbs = dynamic(
  () => import("@/components/landing-shared").then((m) => {
    const Comp = m.ParallaxOrbs;
    return { default: Comp };
  }),
  { ssr: false }
);

export function DynamicLandingPageView({ page, slug, ctaHref }: { page: DynamicLandingPage; slug: string; ctaHref: string }) {
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
      bgColor: "bg-acuity-primary",
      imageSrc: pickFallbackHeadshot(name),
    });
  }
  allTestimonials.push(...STATIC_CAROUSEL_TESTIMONIALS);

  return (
    <div className="min-h-screen bg-acuity-bg text-[#F5EDE4] overflow-x-hidden">
      <LandingNav />

      {/* Hero — text + phone mockup side by side */}
      <section className="relative pt-32 pb-8 sm:pt-40 sm:pb-12 overflow-hidden">
        <ParallaxOrbs />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-12">
            <div className="flex-1 text-center">
              <Reveal>
                <SplitHeroHeadline text={page.heroHeadline} />
              </Reveal>
              <Reveal delay={1}>
                <p className="mt-5 text-base sm:text-lg text-[#F5EDE4] leading-relaxed max-w-xl mx-auto">
                  {page.heroSubheadline}
                  {page.heroSubheadline.length < 120 && (
                    <> Acuity is an AI voice journal — just open the app and talk. It extracts your tasks, tracks your goals, scores your mood, spots the patterns you can&#39;t see, and every Sunday delivers a report that tells the story of your week.</>
                  )}
                </p>
              </Reveal>
              <Reveal delay={2}>
                <div className="mt-6 flex flex-col items-center gap-3">
                  <div className="flex flex-row items-center gap-3">
                    <PulsingCTA href={ctaHref}>
                      Start Free Trial
                    </PulsingCTA>
                  </div>
                  <p className="text-xs text-acuity-text-sec">
                    No credit card. Quick setup.
                  </p>
                </div>
              </Reveal>
            </div>
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

      <SocialProofBar />
      <TestimonialCarousel testimonials={allTestimonials} />

      {/* Pain Points */}
      <section className="px-6 py-14 sm:py-18">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <p className="text-center text-xs font-semibold text-acuity-text-sec uppercase tracking-widest mb-5">
              Sound familiar?
            </p>
          </Reveal>
          <div className="space-y-2.5">
            {page.painPoints.map((point, i) => (
              <SlideIn key={i} direction="left" delay={i * 200}>
                <div className="rounded-lg border border-acuity-line bg-acuity-card-bg border-l-[3px] border-l-acuity-primary py-3.5 px-5">
                  <p className="text-base leading-relaxed text-[#F5EDE4]">{point}</p>
                </div>
              </SlideIn>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <HowItWorksSection
        steps={[
          { label: "Step 1", title: "Record", description: "Hit record. Speak freely about your day — whatever comes to mind." },
          { label: "Step 2", title: "Extract", description: "Within minutes, your tasks are on a list, your goals are tracked, and your mood is scored." },
          { label: "Step 3", title: "Reflect", description: "Every Sunday, get a weekly narrative report showing patterns in your life." },
        ]}
        extractTasks={[{ text: "Send proposal" }, { text: "Buy groceries" }, { text: "Call mom" }]}
        extractGoal="Ship the beta this week"
        extractMood="Energized but anxious"
        reflectPattern="Best mood on days you exercised."
        reflectActions={["Block mornings for deep work", "No meetings after 5pm", "Exercise before noon"]}
      />

      {/* Value Props */}
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
                  <div className="rounded-xl border border-acuity-line bg-acuity-card-bg p-5 transition-all duration-300 hover:border-acuity-line-strong">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-acuity-primary-soft">
                        <svg className="h-3.5 w-3.5 text-acuity-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <p className="text-sm text-acuity-text-sec leading-relaxed">
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

      {/* Final CTA */}
      <section className="px-6 py-14 sm:py-20">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-2xl border border-acuity-line bg-acuity-card-bg p-10 sm:p-14 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-acuity-primary/5 via-transparent to-acuity-primary/5 pointer-events-none" />
            <div className="relative">
              <h2 className="text-2xl font-bold sm:text-3xl tracking-tight text-white mb-5">
                {page.closingHeadline || "Your week doesn\u2019t have to disappear."}
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={ctaHref}
                  className="group relative rounded-full p-[2px] transition active:scale-95 hover:scale-[1.02] overflow-hidden"
                >
                  <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                  <span className="relative flex items-center justify-center rounded-full bg-acuity-primary px-7 py-3.5 text-sm font-bold text-white">Start Free Trial</span>
                </a>
              </div>
              <p className="mt-2.5 text-sm text-acuity-text-sec">
                No credit card. Cancel anytime.
              </p>
              <p className="mt-4 text-xs text-acuity-text-sec/60">
                <span className="text-amber-400">4.9 ★</span> on the App Store
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <Footer />
    </div>
  );
}


function SplitHeroHeadline({ text }: { text: string }) {
  const splitMatch = text.match(/^(.+?[.?!])\s+(.+)$/);
  let whitePart: string;
  let purplePart: string;

  if (splitMatch) {
    whitePart = splitMatch[1];
    purplePart = splitMatch[2];
  } else {
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
  // Start fully visible so SSR renders readable headline — animate on client
  const [visibleCount, setVisibleCount] = useState(allWords.length);
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Reset to 0 then animate in — only on client after hydration
    setVisibleCount(0);
    setAnimated(true);
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          allWords.forEach((_, i) => {
            setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * 80);
          });
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
        <span key={i}>
          {i === whiteWordCount && purplePart && <br />}
          <span
            className={`inline-block mr-[0.3em] ${animated ? "transition-all duration-500" : ""} ${
              i < whiteWordCount ? "text-white" : "text-acuity-primary"
            }`}
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? "translateY(0)" : "translateY(20px)",
              ...(animated ? { transitionDelay: `${i * 60}ms` } : {}),
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </h1>
  );
}

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

    // Only hide + animate after JS hydration — SSR content stays visible
    el.style.opacity = "0";
    el.style.transform = startTransform;
    el.style.transition = `opacity 0.5s ease-out ${delay}ms, transform 0.5s ease-out ${delay}ms`;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.style.opacity = "1";
          el.style.transform = "translate(0)";
        }
        // Don't re-hide on scroll out — content should stay visible once shown
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [direction, delay]);

  return <div ref={ref}>{children}</div>;
}
