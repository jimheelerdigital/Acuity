"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { FoundingMemberBanner } from "@/components/founding-member-banner";
import { SOCIAL_PROOF } from "@/lib/social-proof";

/* ═══════════════════════════════════════════
   Scroll-reveal hook & component
   ═══════════════════════════════════════════ */

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("visible");
          obs.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      className={`reveal ${delay ? `reveal-delay-${delay}` : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Animated counter
   ═══════════════════════════════════════════ */

export function AnimatedCounter({
  target,
  suffix = "",
  prefix = "",
  duration = 2000,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    const startTime = performance.now();
    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [started, target, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Hero word-by-word fade in
   ═══════════════════════════════════════════ */

export function HeroHeadline({ text }: { text: string }) {
  const words = text.split(" ");
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          words.forEach((_, i) => {
            setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * 80);
          });
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [words.length]);

  return (
    <h1
      ref={ref}
      className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl leading-[1.08]"
    >
      {words.map((word, i) => (
        <span
          key={i}
          className="inline-block mr-[0.3em] transition-all duration-500 selection:bg-transparent"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateY(0)" : "translateY(20px)",
            transitionDelay: `${i * 60}ms`,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {word}
        </span>
      ))}
    </h1>
  );
}

/* ═══════════════════════════════════════════
   Parallax floating orbs (dark theme)
   ═══════════════════════════════════════════ */

export function ParallaxOrbs() {
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const handleMove = useCallback((e: MouseEvent) => {
    setMouse({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [handleMove]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute top-20 left-[15%] h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[120px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 15}px, ${mouse.y * 15}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute top-40 right-[10%] h-[350px] w-[350px] rounded-full bg-indigo-500/10 blur-[120px] animate-blob-drift-2"
        style={{
          transform: `translate(${mouse.x * -20}px, ${mouse.y * -20}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute bottom-0 left-[40%] h-[300px] w-[300px] rounded-full bg-purple-500/8 blur-[120px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 10}px, ${mouse.y * -10}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Pulsing CTA button
   ═══════════════════════════════════════════ */

function trackInitiateCheckout() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "InitiateCheckout");
  }
}

export function PulsingCTA({
  href,
  children,
  className = "",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={trackInitiateCheckout}
      className={`relative inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-semibold text-white transition-all duration-300 hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/25 hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#181614] ${className}`}
    >
      <span className="absolute inset-0 rounded-full bg-[#7C5CFC]/30 animate-pulse-ring" />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </Link>
  );
}

/* ═══════════════════════════════════════════
   Landing nav "Who it's for" dropdown
   ═══════════════════════════════════════════ */

const DROPDOWN_FEATURED = [
  {
    href: "/for/therapy",
    title: "The Overthinker",
    description: "Quiet the mental noise. Get it out of your head and into structure.",
  },
  {
    href: "/for/decoded",
    title: "The Curious One",
    description: "Discover the hidden patterns driving your decisions and emotions.",
  },
  {
    href: "/for/sleep",
    title: "The Night Owl",
    description: "Give your racing thoughts somewhere to go.",
  },
  {
    href: "/for/weekly-report",
    title: "The Overachiever",
    description: "Weekly AI reports, goal tracking, and a Life Matrix to stay sharp.",
  },
  {
    href: "/for/founders",
    title: "The Builder",
    description: "The 60-second debrief for founders and high performers.",
  },
];

const DROPDOWN_MENTAL_HEALTH = [
  { href: "/for/anxiety", label: "Anxiety" },
  { href: "/for/adhd", label: "ADHD" },
  { href: "/for/burnout", label: "Burnout" },
  { href: "/for/grief", label: "Grief" },
  { href: "/for/overthinkers", label: "Overthinkers" },
  { href: "/for/chronic-pain", label: "Chronic Pain" },
];

const DROPDOWN_LIFESTYLE = [
  { href: "/for/remote-workers", label: "Remote Workers" },
  { href: "/for/new-parents", label: "New Parents" },
  { href: "/for/students", label: "Students" },
  { href: "/for/couples", label: "Couples" },
  { href: "/for/introverts", label: "Introverts" },
  { href: "/for/career-change", label: "Career Change" },
  { href: "/for/athletes", label: "Athletes" },
];

const DROPDOWN_PROFESSIONALS = [
  { href: "/for/entrepreneurs", label: "Entrepreneurs" },
  { href: "/for/managers", label: "Managers" },
  { href: "/for/freelancers", label: "Freelancers" },
  { href: "/for/creatives", label: "Creatives" },
  { href: "/for/nurses", label: "Nurses" },
  { href: "/for/teachers", label: "Teachers" },
  { href: "/for/therapists", label: "Therapists" },
];

function LandingWhoItsFor() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [open, close]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    if (open) {
      document.addEventListener("mousedown", onClick);
      return () => document.removeEventListener("mousedown", onClick);
    }
  }, [open, close]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setOpen(true);
      }}
      onMouseLeave={() => {
        timeoutRef.current = setTimeout(() => setOpen(false), 150);
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFC] focus-visible:rounded-sm"
      >
        Who it's for
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <div
        className={`absolute left-0 top-full mt-2 w-[640px] rounded-xl border border-white/10 bg-[#1E1C1A] shadow-2xl transition-all duration-200 origin-top ${
          open
            ? "opacity-100 scale-y-100 translate-y-0"
            : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="flex">
          {/* Featured column */}
          <div className="w-[280px] border-r border-white/5 py-3">
            <div className="px-4 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC]">Featured</span>
            </div>
            {DROPDOWN_FEATURED.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block px-4 py-2.5 transition-all duration-150 border-l-2 border-transparent hover:border-violet-500 hover:bg-white/5"
              >
                <div className="text-sm font-medium text-white">{item.title}</div>
                <div className="text-xs text-[#B0A898] mt-0.5 leading-snug">{item.description}</div>
              </Link>
            ))}
          </div>

          {/* Categories columns */}
          <div className="flex-1 py-3 px-4">
            <div className="grid grid-cols-3 gap-x-4">
              {/* Mental Health */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Mental Health</span>
                {DROPDOWN_MENTAL_HEALTH.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className="block py-1.5 text-sm text-[#B0A898] transition hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* Lifestyle */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Lifestyle</span>
                {DROPDOWN_LIFESTYLE.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className="block py-1.5 text-sm text-[#B0A898] transition hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>

              {/* Professionals */}
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Professionals</span>
                {DROPDOWN_PROFESSIONALS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={close}
                    className="block py-1.5 text-sm text-[#B0A898] transition hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Landing nav bar
   ═══════════════════════════════════════════ */

export function LandingNav() {
  return (
    <div className="fixed top-0 inset-x-0 z-50">
      <FoundingMemberBanner />
      <nav className="bg-[#181614]/80 backdrop-blur-md border-b border-white/5">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <Image src="/AcuityLogoDark.png" alt="Acuity logo" width={24} height={24} className="shrink-0" />
            <span className="text-lg font-bold tracking-tight text-white">Acuity</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6 text-sm text-[#B0A898]">
            <LandingWhoItsFor />
            <a
              href="#how-it-works"
              className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
            >
              How it Works
            </a>
            <a
              href="#pricing"
              className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
            >
              Pricing
            </a>
            <Link
              href="/blog"
              className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
            >
              Articles
            </Link>
          </div>
        </div>
        <Link
          href="/auth/signup?utm_campaign=nav"
          className="rounded-full bg-[#7C5CFC] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#6B4FE0] hover:shadow-lg hover:shadow-[#7C5CFC]/20 active:scale-95"
        >
          Start Free Trial
        </Link>
      </div>
    </nav>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Footer
   ═══════════════════════════════════════════ */

export function Footer() {
  return (
    <footer className="border-t border-white/10 px-6 py-12 bg-[#181614]">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <Image src="/AcuityLogoDark.png" alt="Acuity logo" width={24} height={24} className="shrink-0" />
              <span className="text-lg font-bold tracking-tight text-white">Acuity</span>
            </div>
            <p className="mt-2 text-sm text-[#B0A898] max-w-xs">
              Debrief daily. See your life clearly.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Product</h3>
            <ul className="space-y-2 text-sm text-[#B0A898]">
              <li><a href="/" className="transition hover:text-white">Home</a></li>
              <li><a href="/auth/signup" className="transition hover:text-white">Start Free Trial</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Learn</h3>
            <ul className="space-y-2 text-sm text-[#B0A898]">
              <li><a href="/voice-journaling" className="transition hover:text-white">Voice Journaling Guide</a></li>
              <li><a href="/blog" className="transition hover:text-white">Blog</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Company</h3>
            <ul className="space-y-2 text-sm text-[#B0A898]">
              <li><a href="/terms" className="transition hover:text-white">Terms</a></li>
              <li><a href="/privacy" className="transition hover:text-white">Privacy</a></li>
              <li><a href="mailto:hello@getacuity.io" className="transition hover:text-white">Contact</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-[#B0A898]">
            &copy; {new Date().getFullYear()} Acuity. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   Pricing section
   ═══════════════════════════════════════════ */

const pricingFeatures = [
  "Unlimited voice entries",
  "AI task & goal extraction",
  "Mood tracking & analytics",
  "Weekly insight reports",
  "Life Matrix dashboard",
  "Data export anytime",
];

export function PricingSection({
  headline = "Simple pricing",
  subheadline = "One plan. Everything included. Cancel anytime.",
  utmCampaign,
}: {
  headline?: string;
  subheadline?: string;
  utmCampaign: string;
}) {
  const waitlistUrl = `/auth/signup?utm_campaign=${utmCampaign}`;

  return (
    <section id="pricing" className="px-6 py-24 sm:py-32 bg-transparent">
      <div className="mx-auto max-w-md text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {headline}
          </h2>
          <p className="mt-4 text-[#B0A898] text-lg">{subheadline}</p>
        </Reveal>

        <Reveal delay={1}>
          <div className="mt-12 relative group">
            <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer blur-[1px]" />
            <div className="relative rounded-2xl border border-[#E8B88A]/20 bg-[#1E1C1A] p-8 text-left shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#E8B88A]">
                  Pro
                </p>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
                  30-day free trial
                </span>
              </div>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-extrabold text-white">
                  $12.99
                </span>
                <span className="text-[#B0A898]">/month</span>
              </p>
              <p className="mt-2 text-sm text-[#B0A898]">
                30-day free trial &middot; No card. 90 seconds to set up.
              </p>

              <ul className="mt-8 space-y-3 text-sm text-[#B0A898]">
                {pricingFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <svg
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFC]"
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
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={waitlistUrl}
                className="mt-8 block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/20 active:scale-95"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   How It Works section — with phone mockups
   ═══════════════════════════════════════════ */

export interface HowItWorksStep {
  label: string;
  title: string;
  description: string;
}

/* Animated waveform bars inside the Record phone */
function WaveformVisualizer() {
  return (
    <div className="flex items-center justify-center gap-[3px] h-10">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="wave-bar w-[3px] rounded-full bg-red-400"
          style={{ animationDelay: `${i * 0.07}s` }}
        />
      ))}
    </div>
  );
}

/* Cascading task list — items appear one by one */
function CascadingTasks({ tasks }: { tasks: { text: string; checked?: boolean }[] }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          tasks.forEach((_, i) => {
            setTimeout(() => setVisibleCount((c) => c + 1), (i + 1) * 400);
          });
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tasks]);

  return (
    <div ref={ref} className="space-y-2">
      {tasks.map((task, i) => (
        <div
          key={task.text}
          className="flex items-center gap-2 text-xs text-[#B0A898] transition-all duration-500"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateX(0)" : "translateX(20px)",
          }}
        >
          <div
            className={`h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center transition-colors duration-300 ${
              task.checked ? "border-emerald-500 bg-emerald-500" : "border-white/20"
            }`}
          >
            {task.checked && (
              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          {task.text}
        </div>
      ))}
    </div>
  );
}

/* Animated mood bars */
function MoodBars({ heights, color }: { heights: number[]; color: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex items-end gap-1 h-full">
      {heights.map((h, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm mood-bar transition-all duration-1000 ${color}`}
          style={{
            height: visible ? `${h}%` : "4%",
            transitionDelay: `${i * 80}ms`,
          }}
        />
      ))}
    </div>
  );
}

/* Phone mockup for Step 1: Record */
function RecordPhone() {
  return (
    <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#252220] p-2 shadow-xl">
      <div className="h-full w-full rounded-[2rem] bg-[#1E1C1A] p-5 flex flex-col overflow-hidden">
        <div className="text-xs text-[#B0A898] font-medium mb-auto">Recording</div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-20 w-20 rounded-full bg-red-500/20 animate-pulse-ring" />
            <div className="absolute h-24 w-24 rounded-full bg-red-500/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
            <div className="relative h-16 w-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg className="h-7 w-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </div>
          </div>
          <WaveformVisualizer />
          <div className="text-xl font-bold text-white font-mono">0:47</div>
          <div className="text-xs text-[#B0A898]">Speak freely...</div>
        </div>
      </div>
    </div>
  );
}

/* Phone mockup for Step 2: Extract */
interface ExtractPhoneProps {
  tasks: { text: string; checked?: boolean }[];
  goal: string;
  mood: string;
}

function ExtractPhone({ tasks, goal, mood }: ExtractPhoneProps) {
  return (
    <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#252220] p-2 shadow-xl">
      <div className="h-full w-full rounded-[2rem] bg-[#1E1C1A] p-5 flex flex-col overflow-hidden">
        <div className="text-xs text-[#B0A898] font-medium mb-3">AI Extraction</div>
        <div className="space-y-2.5 flex-1">
          <div className="rounded-xl border border-white/10 bg-[#252220] p-3 shadow-sm">
            <div className="text-[10px] text-[#B0A898]/60 uppercase tracking-wider mb-1.5">Tasks</div>
            <CascadingTasks tasks={tasks} />
          </div>
          <div className="rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 p-3">
            <div className="text-[10px] text-violet-600 uppercase tracking-wider mb-1">Goal</div>
            <div className="text-xs text-[#B0A898]">"{goal}"</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Mood</div>
            <div className="text-xs text-[#B0A898]">{mood}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Phone mockup for Step 3: Reflect */
interface ReflectPhoneProps {
  pattern: string;
  actions: string[];
}

function ReflectPhone({ pattern, actions }: ReflectPhoneProps) {
  return (
    <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#252220] p-2 shadow-xl">
      <div className="h-full w-full rounded-[2rem] bg-[#1E1C1A] p-5 flex flex-col overflow-hidden">
        <div className="text-xs text-[#B0A898] font-medium mb-3">Weekly Report</div>
        <div className="space-y-2.5 flex-1">
          <div className="rounded-xl border border-white/10 bg-[#252220] p-3 shadow-sm">
            <div className="text-[10px] text-[#B0A898]/60 uppercase tracking-wider mb-2">Mood this week</div>
            <div className="h-10">
              <MoodBars heights={[50, 60, 45, 75, 70, 85, 80]} color="bg-violet-400" />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#252220] p-3 shadow-sm">
            <div className="text-[10px] text-[#B0A898]/60 uppercase tracking-wider mb-1">Pattern</div>
            <div className="text-xs text-[#B0A898]">{pattern}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#252220] p-3 shadow-sm">
            <div className="text-[10px] text-[#B0A898]/60 uppercase tracking-wider mb-1">Top 3 Actions</div>
            <div className="space-y-1 text-xs text-[#B0A898]">
              {actions.map((a, i) => (
                <div key={i}>{i + 1}. {a}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Full How It Works section with phone mockups */
export interface HowItWorksConfig {
  steps: HowItWorksStep[];
  extractTasks: { text: string; checked?: boolean }[];
  extractGoal: string;
  extractMood: string;
  reflectPattern: string;
  reflectActions: string[];
}

export function HowItWorksSection({ steps, ...phoneProps }: HowItWorksConfig) {
  const {
    extractTasks = [{ text: "Send proposal to client" }, { text: "Buy groceries" }, { text: "Call mom" }],
    extractGoal = "Ship the beta this week",
    extractMood = "Energized but slightly anxious",
    reflectPattern = "Best mood on days you exercised. Worst on days with meetings after 6pm.",
    reflectActions = ["Block mornings for deep work", "No meetings after 5pm", "Exercise before noon"],
  } = phoneProps;

  return (
    <section id="how-it-works" className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              How it works
            </h2>
            <p className="mt-4 text-[#B0A898] text-lg">
              Three steps. Sixty seconds. Zero effort.
            </p>
          </div>
        </Reveal>

        <div className="space-y-16 sm:space-y-20">
          {/* Step 1: Record */}
          <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
            <div className="flex-1">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#252220] px-3 py-1 text-xs font-semibold text-[#B0A898] uppercase tracking-wider mb-4">
                  Step 1
                </div>
                <h3 className="text-3xl font-bold sm:text-4xl">{steps[0]?.title || "Record"}</h3>
                <p className="mt-4 text-lg text-[#B0A898] leading-relaxed max-w-md">
                  {steps[0]?.description || "Hit record. Speak freely for 60 seconds about your day, your worries, your wins — whatever comes to mind."}
                </p>
              </Reveal>
            </div>
            <div className="flex-1 flex justify-center">
              <Reveal delay={1}>
                <RecordPhone />
              </Reveal>
            </div>
          </div>

          {/* Step 2: Extract */}
          <div className="flex flex-col gap-8 lg:items-center lg:flex-row-reverse">
            <div className="flex-1">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#252220] px-3 py-1 text-xs font-semibold text-[#B0A898] uppercase tracking-wider mb-4">
                  Step 2
                </div>
                <h3 className="text-3xl font-bold sm:text-4xl">{steps[1]?.title || "Extract"}</h3>
                <p className="mt-4 text-lg text-[#B0A898] leading-relaxed max-w-md">
                  {steps[1]?.description || "By morning, your tasks are on a list, your goals are tracked, and your mood is scored. You didn\u2019t type a word."}
                </p>
              </Reveal>
            </div>
            <div className="flex-1 flex justify-center">
              <Reveal delay={1}>
                <ExtractPhone tasks={extractTasks} goal={extractGoal} mood={extractMood} />
              </Reveal>
            </div>
          </div>

          {/* Step 3: Reflect */}
          <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
            <div className="flex-1">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#252220] px-3 py-1 text-xs font-semibold text-[#B0A898] uppercase tracking-wider mb-4">
                  Step 3
                </div>
                <h3 className="text-3xl font-bold sm:text-4xl">{steps[2]?.title || "Reflect"}</h3>
                <p className="mt-4 text-lg text-[#B0A898] leading-relaxed max-w-md">
                  {steps[2]?.description || "Get a weekly narrative report showing patterns in your life, so you can course-correct before the next week starts."}
                </p>
              </Reveal>
            </div>
            <div className="flex-1 flex justify-center">
              <Reveal delay={1}>
                <ReflectPhone pattern={reflectPattern} actions={reflectActions} />
              </Reveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Final CTA Banner
   ═══════════════════════════════════════════ */

export function CTABanner({
  headline,
  subheadline,
  buttonText = "Start Free Trial",
  utmCampaign,
}: {
  headline: string;
  subheadline?: string;
  buttonText?: string;
  utmCampaign: string;
}) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <Reveal>
        <div className="mx-auto max-w-4xl rounded-3xl bg-zinc-900 p-12 sm:p-16 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-violet-600/20 -translate-y-1/3 translate-x-1/4 blur-3xl animate-blob-drift" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-indigo-600/20 translate-y-1/3 -translate-x-1/4 blur-3xl animate-blob-drift-2" />

          <div className="relative">
            <p className="text-sm font-medium text-violet-400 mb-4 uppercase tracking-wider">
              Start your 30-day free trial today
            </p>
            <h2 className="text-3xl font-bold sm:text-5xl tracking-tight">
              {headline}
            </h2>
            {subheadline && (
              <p className="mt-5 text-[#B0A898] text-lg max-w-md mx-auto">
                {subheadline}
              </p>
            )}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/auth/signup?utm_campaign=${utmCampaign}`}
                onClick={trackInitiateCheckout}
                className="rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#7C5CFC]/10 transition hover:shadow-xl hover:shadow-[#7C5CFC]/20 hover:-translate-y-0.5 active:scale-95"
              >
                {buttonText}
              </Link>
              <span className="text-sm text-[#B0A898]">
                Then $12.99/month &middot; No card. 90 seconds to set up.
              </span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Testimonial card grid
   ═══════════════════════════════════════════ */

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export function TestimonialsSection({
  testimonials,
  headline = "People are loving it",
}: {
  testimonials: Testimonial[];
  headline?: string;
}) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
            {headline}
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-8 sm:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
              <figure className="group rounded-2xl border border-white/10 bg-[#1E1C1A] p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <div className="flex items-center gap-1 mb-4">
                  <span className="text-amber-400 font-bold text-xs">{SOCIAL_PROOF.rating} ★</span>
                </div>
                <blockquote className="text-sm leading-relaxed text-[#B0A898]">
                  "{t.quote}"
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#252220] text-sm font-bold text-[#B0A898] transition-colors group-hover:bg-[#7C5CFC]/20 group-hover:text-[#7C5CFC]">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{t.name}</div>
                    <div className="text-xs text-[#B0A898]/60">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Comparison table
   ═══════════════════════════════════════════ */

export interface ComparisonRow {
  feature: string;
  values: string[];
}

export function ComparisonTable({
  headers,
  rows,
  note,
}: {
  headers: string[];
  rows: ComparisonRow[];
  note?: string;
}) {
  return (
    <Reveal>
      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#1E1C1A] shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="py-4 px-6 text-left text-[#B0A898] font-medium" />
              {headers.map((h, i) => (
                <th
                  key={h}
                  className={`py-4 px-6 text-left font-semibold ${
                    i === headers.length - 1
                      ? "text-[#7C5CFC] bg-[#7C5CFC]/10"
                      : "text-white"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-b border-white/5">
                <td className="py-4 px-6 font-medium text-[#B0A898]">
                  {row.feature}
                </td>
                {row.values.map((val, i) => (
                  <td
                    key={i}
                    className={`py-4 px-6 ${
                      i === row.values.length - 1
                        ? "text-[#7C5CFC] font-semibold bg-[#7C5CFC]/10"
                        : "text-[#B0A898]"
                    }`}
                  >
                    {val}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && (
        <p className="mt-4 text-center text-sm text-[#B0A898]/60 italic">{note}</p>
      )}
    </Reveal>
  );
}

/* ═══════════════════════════════════════════
   Feature grid (6 cards)
   ═══════════════════════════════════════════ */

export interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}

const iconMap: Record<string, { bg: string; color: string; path: string }> = {
  moon: {
    bg: "bg-indigo-500/10",
    color: "text-indigo-600",
    path: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z",
  },
  brain: {
    bg: "bg-violet-500/10",
    color: "text-violet-600",
    path: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z",
  },
  chart: {
    bg: "bg-amber-500/10",
    color: "text-amber-600",
    path: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  },
  heart: {
    bg: "bg-rose-500/10",
    color: "text-rose-600",
    path: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  },
  mic: {
    bg: "bg-violet-500/10",
    color: "text-violet-600",
    path: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z",
  },
  shield: {
    bg: "bg-emerald-500/10",
    color: "text-emerald-600",
    path: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
  },
  map: {
    bg: "bg-indigo-500/10",
    color: "text-indigo-600",
    path: "M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z",
  },
  target: {
    bg: "bg-emerald-500/10",
    color: "text-emerald-600",
    path: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z",
  },
  tasks: {
    bg: "bg-blue-500/10",
    color: "text-blue-600",
    path: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  doc: {
    bg: "bg-amber-500/10",
    color: "text-amber-600",
    path: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  },
  eye: {
    bg: "bg-teal-500/10",
    color: "text-teal-600",
    path: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z",
  },
  clock: {
    bg: "bg-blue-500/10",
    color: "text-blue-600",
    path: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  bolt: {
    bg: "bg-yellow-500/10",
    color: "text-yellow-600",
    path: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  },
  repeat: {
    bg: "bg-purple-500/10",
    color: "text-purple-600",
    path: "M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3",
  },
  lock: {
    bg: "bg-zinc-500/10",
    color: "text-zinc-600",
    path: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
  },
  star: {
    bg: "bg-amber-500/10",
    color: "text-amber-600",
    path: "M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z",
  },
  users: {
    bg: "bg-rose-500/10",
    color: "text-rose-600",
    path: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z",
  },
};

export function FeatureGrid({ features }: { features: FeatureCard[] }) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => {
            const icon = iconMap[f.icon] || iconMap["brain"];
            return (
              <Reveal
                key={f.title}
                delay={Math.min((i % 3) + 1, 3) as 1 | 2 | 3}
              >
                <div className="group rounded-2xl border border-white/10 bg-[#1E1C1A] p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                  <div
                    className={`h-10 w-10 rounded-xl ${icon.bg} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}
                  >
                    <svg
                      className={`h-5 w-5 ${icon.color}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={icon.path}
                      />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-[#B0A898] leading-relaxed">
                    {f.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Pain points section (3 dark cards)
   ═══════════════════════════════════════════ */

export function PainSection({ points }: { points: string[] }) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3} className="h-full">
              <div className="h-full group rounded-2xl bg-[#1E1C1A] p-8 text-white transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:shadow-zinc-900/20">
                <div className="h-10 w-10 rounded-xl bg-violet-600/20 flex items-center justify-center mb-5">
                  <svg
                    className="h-5 w-5 text-violet-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <p className="text-sm leading-relaxed text-[#B0A898]">
                  {point}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Solution section
   ═══════════════════════════════════════════ */

export function SolutionSection({
  headline,
  body,
}: {
  headline: string;
  body: string;
}) {
  return (
    <section className="px-6 py-24 sm:py-32 bg-[#1E1C1A]">
      <div className="mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
            {headline}
          </h2>
          <p className="mt-6 text-lg text-[#B0A898] leading-relaxed">{body}</p>
        </Reveal>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Urgency badge
   ═══════════════════════════════════════════ */

export function UrgencyBadge({ text }: { text: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC]/10 border border-[#7C5CFC]/30 px-4 py-2 text-sm font-medium text-[#7C5CFC]">
      <span className="h-2 w-2 rounded-full bg-[#7C5CFC] animate-pulse" />
      {text}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Mid-page CTA section
   ═══════════════════════════════════════════ */

export function MidPageCTA({
  headline,
  subheadline,
  utmCampaign,
}: {
  headline: string;
  subheadline?: string;
  utmCampaign: string;
}) {
  return (
    <section className="px-6 py-16">
      <Reveal>
        <div className="mx-auto max-w-xl text-center">
          {headline && (
            <p className="text-lg sm:text-xl font-semibold text-white mb-6">
              {headline}
            </p>
          )}
          <Link
            href={`/auth/signup?utm_campaign=${utmCampaign}`}
            onClick={trackInitiateCheckout}
            className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/10 active:scale-95"
          >
            Start Free Trial
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          {subheadline && (
            <p className="mt-3 text-sm text-[#B0A898]">{subheadline}</p>
          )}
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Animated progress bars (Life Matrix style)
   ═══════════════════════════════════════════ */

export interface MatrixArea {
  label: string;
  score: number;
  color: string;
  insight: string;
}

export function LifeMatrixShowcase({ areas }: { areas: MatrixArea[] }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {areas.map((area, i) => (
        <div
          key={area.label}
          className="group rounded-2xl border border-white/10 bg-[#1E1C1A] p-6 shadow-sm transition-all duration-500 hover:shadow-lg hover:-translate-y-1"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(20px)",
            transitionDelay: `${i * 100}ms`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">{area.label}</h4>
            <span
              className="text-lg font-bold"
              style={{ color: area.color }}
            >
              {visible ? area.score : 0}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden mb-4">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: visible ? `${area.score}%` : "0%",
                backgroundColor: area.color,
                transitionDelay: `${i * 100 + 200}ms`,
              }}
            />
          </div>
          <p className="text-xs text-[#B0A898] leading-relaxed">
            {area.insight}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Before / After section
   ═══════════════════════════════════════════ */

export function BeforeAfterSection({
  before,
  after,
}: {
  before: string[];
  after: string[];
}) {
  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-8 sm:grid-cols-2">
          <Reveal>
            <div className="rounded-2xl bg-[#1E1C1A] p-8">
              <h3 className="text-lg font-bold text-[#B0A898]/60 mb-6 uppercase tracking-wider text-sm">
                Before Acuity
              </h3>
              <ul className="space-y-4">
                {before.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#B0A898]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <div className="rounded-2xl bg-[#7C5CFC]/5 border border-[#7C5CFC]/20 p-8">
              <h3 className="text-lg font-bold text-[#7C5CFC] mb-6 uppercase tracking-wider text-sm">
                After Acuity
              </h3>
              <ul className="space-y-4">
                {after.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-white">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[#7C5CFC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Stats section with animated counters
   ═══════════════════════════════════════════ */

export interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
}

export function StatsSection({ stats }: { stats: Stat[] }) {
  return (
    <section className="py-12 px-6 border-y border-white/5 bg-[#1E1C1A]/50 backdrop-blur">
      <div className="mx-auto max-w-5xl">
        <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(stats.length, 4)} gap-8 text-center`}>
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={Math.min(i + 1, 4) as 1 | 2 | 3 | 4}>
              <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                <AnimatedCounter
                  target={stat.value}
                  suffix={stat.suffix || ""}
                  prefix={stat.prefix || ""}
                />
              </div>
              <div className="mt-1 text-sm text-[#B0A898]">{stat.label}</div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Animated reveal cards (staggered appearance)
   ═══════════════════════════════════════════ */

export function RevealCards({ items }: { items: string[] }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          items.forEach((_, i) => {
            setTimeout(() => setVisibleCount((c) => Math.max(c, i + 1)), i * 200);
          });
          obs.unobserve(el);
        }
      },
      { threshold: 0.2 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [items.length]);

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-2">
      {items.map((item, i) => (
        <div
          key={i}
          className="group rounded-2xl border border-white/10 bg-[#1E1C1A] p-6 shadow-sm transition-all duration-500 hover:shadow-lg hover:-translate-y-1"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-violet-500 shrink-0" />
            <p className="text-sm text-[#B0A898] leading-relaxed">{item}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Report preview card
   ═══════════════════════════════════════════ */

export function ReportPreview({
  title,
  moodArc,
  narrative,
  insightBullets,
}: {
  title: string;
  moodArc: string;
  narrative: string;
  insightBullets: string[];
}) {
  return (
    <Reveal>
      <div className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-[#1E1C1A] p-8 shadow-lg relative overflow-hidden">
        <div className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-2">
          Weekly Report
        </div>
        <h3 className="text-xl font-bold text-white mb-4">{title}</h3>

        <div className="rounded-xl bg-[#252220] p-4 mb-4">
          <div className="text-xs font-semibold text-[#B0A898]/60 uppercase tracking-wider mb-2">
            Mood Arc
          </div>
          <p className="text-sm text-[#B0A898] leading-relaxed">{moodArc}</p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-[#B0A898] italic leading-relaxed">
            "{narrative}"
          </p>
        </div>

        <div className="relative">
          {insightBullets.map((bullet, i) => (
            <div
              key={i}
              className="flex items-start gap-2 mb-2"
              style={{
                filter: i >= 1 ? `blur(${i * 2}px)` : "none",
                opacity: i >= 1 ? 0.5 : 1,
              }}
            >
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-500 shrink-0" />
              <p className="text-sm text-[#B0A898]">{bullet}</p>
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#1E1C1A] to-transparent flex items-end justify-center pb-2">
            <span className="text-xs font-medium text-violet-600">
              Read your full report
            </span>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/* ═══════════════════════════════════════════
   Social proof bar
   ═══════════════════════════════════════════ */

export function SocialProofBar() {
  return (
    <section className="px-6 py-8">
      <Reveal>
        <div className="mx-auto max-w-2xl flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <div className="flex items-center gap-1">
            <span className="text-amber-400 font-bold text-sm">{SOCIAL_PROOF.rating} ★</span>
          </div>
          <p className="text-sm text-[#B0A898]">
            Join {SOCIAL_PROOF.underHeroCount} people already using Acuity
          </p>
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Trust strip
   ═══════════════════════════════════════════ */

export function TrustStrip() {
  const items = [
    "Audio deleted within 24hrs",
    "No card. 90 seconds to set up.",
    "Cancel anytime",
    "30-day free trial",
  ];
  return (
    <section className="px-6 py-8">
      <Reveal>
        <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-[#B0A898]">
              <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              {item}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ═══════════════════════════════════════════
   FAQ section
   ═══════════════════════════════════════════ */

export function FAQSection() {
  const faqs = [
    {
      q: "Is this actually private?",
      a: "Your audio is deleted within 24 hours of transcription. We never sell your data.",
    },
    {
      q: "Do I have to use it every day?",
      a: "No. But users who record 4+ times in week one get dramatically better results.",
    },
    {
      q: "What if I don't know what to say?",
      a: "That's the point. Just talk. The AI figures out the rest.",
    },
    {
      q: "Is this just a journaling app?",
      a: "No. You don't write anything. You talk for 60 seconds and by morning your tasks are extracted, your mood is scored, and every Sunday you get a written story of your week.",
    },
  ];

  return (
    <section className="px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-2xl">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12 text-white">
            Frequently asked questions
          </h2>
        </Reveal>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
              <div className="rounded-xl border border-white/10 bg-[#1E1C1A] p-6">
                <h3 className="text-base font-semibold text-white mb-2">{faq.q}</h3>
                <p className="text-sm text-[#B0A898] leading-relaxed">{faq.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════
   Sticky CTA (mobile only)
   ═══════════════════════════════════════════ */

export function StickyCTA({ utmCampaign }: { utmCampaign: string }) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden">
      <div className="bg-[#181614]/95 backdrop-blur-lg border-t border-white/10 px-4 py-3">
        <Link
          href={`/auth/signup?utm_campaign=${utmCampaign}`}
          onClick={trackInitiateCheckout}
          className="block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98]"
        >
          Start Free Trial
        </Link>
        <p className="mt-1.5 text-center text-xs text-[#B0A898]">
          Early access — limited spots at founding member pricing
        </p>
      </div>
    </div>
  );
}
