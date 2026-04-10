"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

/* ═══════════════════════════════════════════
   Scroll-reveal hook
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

function Reveal({
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

function AnimatedCounter({
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
    let start = 0;
    const startTime = performance.now();
    function step(now: number) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.floor(eased * target);
      setCount(start);
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
   Typewriter effect
   ═══════════════════════════════════════════ */

function Typewriter({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
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
    const timeout = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) clearInterval(iv);
      }, 40);
      return () => clearInterval(iv);
    }, delay);
    return () => clearTimeout(timeout);
  }, [started, text, delay]);

  return (
    <span ref={ref}>
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-[3px] h-[1em] bg-violet-500 ml-0.5 animate-pulse align-middle" />
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════
   Animated mood bars
   ═══════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════
   Live waveform visualizer
   ═══════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════
   Cascading task list (tasks appear one by one)
   ═══════════════════════════════════════════ */

function CascadingTasks({
  tasks,
}: {
  tasks: { text: string; checked?: boolean }[];
}) {
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
          className="flex items-center gap-2 text-xs text-zinc-600 transition-all duration-500"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateX(0)" : "translateX(20px)",
          }}
        >
          <div
            className={`h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center transition-colors duration-300 ${
              task.checked
                ? "border-emerald-500 bg-emerald-500"
                : "border-zinc-300"
            }`}
          >
            {task.checked && (
              <svg
                className="h-2.5 w-2.5 text-white"
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
            )}
          </div>
          {task.text}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   Mouse-tracking parallax orbs
   ═══════════════════════════════════════════ */

function ParallaxOrbs() {
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
      {/* Main gradient wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FAFAF7] via-[#F0EEFF] to-[#E8F4FD]" />

      {/* Floating orbs that respond to mouse */}
      <div
        className="absolute top-20 left-[15%] h-[400px] w-[400px] rounded-full bg-violet-300/20 blur-[100px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 15}px, ${mouse.y * 15}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute top-40 right-[10%] h-[350px] w-[350px] rounded-full bg-blue-300/20 blur-[100px] animate-blob-drift-2"
        style={{
          transform: `translate(${mouse.x * -20}px, ${mouse.y * -20}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute bottom-0 left-[40%] h-[300px] w-[300px] rounded-full bg-pink-200/15 blur-[100px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 10}px, ${mouse.y * -10}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════ */

export function LandingPage() {
  const [tickerPaused, setTickerPaused] = useState(false);

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-zinc-900 overflow-x-hidden">
      {/* ───── NAVBAR ───── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#FAFAF7]/80 backdrop-blur-md border-b border-zinc-200/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl transition-transform duration-300 group-hover:rotate-90">
                ✦
              </span>
              <span className="text-lg font-bold tracking-tight">Acuity</span>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-sm text-zinc-500">
              <a
                href="#"
                className="transition hover:text-zinc-900 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
              >
                Home
              </a>
              <a
                href="#how-it-works"
                className="transition hover:text-zinc-900 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
              >
                How it Works
              </a>
              <a
                href="#pricing"
                className="transition hover:text-zinc-900 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
              >
                Pricing
              </a>
              <a
                href="#"
                className="transition hover:text-zinc-900 relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
              >
                Press
              </a>
            </div>
          </div>
          <Link
            href="/auth/signin"
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 hover:shadow-lg hover:shadow-zinc-900/20 active:scale-95"
          >
            Download App
          </Link>
        </div>
      </nav>

      {/* ───── HERO ───── */}
      <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden">
        <ParallaxOrbs />

        <div className="relative mx-auto max-w-6xl px-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-16">
            {/* Left content */}
            <div className="flex-1 max-w-xl">
              {/* Social proof badge */}
              <Reveal>
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 backdrop-blur px-4 py-1.5 text-sm text-zinc-600 shadow-sm">
                  <span>Loved by early users</span>
                  <span>⭐</span>
                  <span className="text-zinc-300">|</span>
                  <Link
                    href="/auth/signin"
                    className="font-medium text-zinc-900 hover:underline"
                  >
                    Join the waitlist
                  </Link>
                </div>
              </Reveal>

              <Reveal delay={1}>
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.05]">
                  <Typewriter text="Meet Acuity." />
                  <br />
                  <span className="block mt-1">
                    <Typewriter text="Your mind," delay={600} />
                  </span>
                  <span className="block mt-1 text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-400 animate-gradient-shift">
                    <Typewriter text="mapped." delay={1100} />
                  </span>
                </h1>
              </Reveal>

              <Reveal delay={2}>
                <p className="mt-6 text-lg text-zinc-500 leading-relaxed max-w-md">
                  Speak for 60 seconds. AI extracts your tasks, goals, mood, and
                  weekly insights — automatically.
                </p>
              </Reveal>

              <Reveal delay={3}>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/auth/signin"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-700 hover:shadow-xl hover:shadow-zinc-900/20 active:scale-95"
                  >
                    <svg
                      className="h-5 w-5 transition-transform group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    Download on App Store
                  </Link>
                  <Link
                    href="/auth/signin"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-700 hover:shadow-xl hover:shadow-zinc-900/20 active:scale-95"
                  >
                    <svg
                      className="h-5 w-5 transition-transform group-hover:scale-110"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.6l2.651 1.535c.9.521.9 1.196 0 1.717l-2.651 1.535-2.535-2.535 2.535-2.253zM5.864 2.658L16.8 8.991l-2.302 2.302-8.634-8.635z" />
                    </svg>
                    Get it on Google Play
                  </Link>
                </div>
              </Reveal>
            </div>

            {/* Right side: Animated phone mockups */}
            <div className="flex-1 mt-12 lg:mt-0 flex justify-center lg:justify-end">
              <div className="relative w-[320px] h-[580px] sm:w-[380px] sm:h-[640px]">
                {/* Phone 1 (back) — floating — light theme matching app */}
                <div className="absolute right-0 top-8 w-[220px] sm:w-[260px] h-[440px] sm:h-[500px] rounded-[2rem] bg-zinc-200 p-2 shadow-2xl rotate-3 animate-float-delay">
                  <div className="h-full w-full rounded-[1.5rem] bg-[#FAFAF7] p-4 flex flex-col gap-3 overflow-hidden">
                    <div className="text-xs text-zinc-400 font-medium">
                      Weekly Report
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-zinc-400 mb-2">
                        Mood Trend
                      </div>
                      <div className="h-12">
                        <MoodBars
                          heights={[40, 55, 45, 70, 65, 80, 75]}
                          color="bg-violet-400"
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-zinc-400 mb-1">
                        Top Insight
                      </div>
                      <div className="text-xs text-zinc-600">
                        You mention &ldquo;sleep&rdquo; 4x this week. Consider a
                        wind-down routine.
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-zinc-400 mb-1">
                        Goals Progress
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs text-zinc-600 mb-1">
                            <span>Exercise</span>
                            <span>3/5</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-100">
                            <div className="h-full w-3/5 rounded-full bg-emerald-500 transition-all duration-1000" />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-zinc-600 mb-1">
                            <span>Reading</span>
                            <span>5/7</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-zinc-100">
                            <div className="h-full w-5/6 rounded-full bg-violet-500 transition-all duration-1000" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phone 2 (front) — floating — light theme matching app */}
                <div className="absolute left-0 top-0 w-[220px] sm:w-[260px] h-[440px] sm:h-[500px] rounded-[2rem] bg-zinc-200 p-2 shadow-2xl -rotate-3 z-10 animate-float">
                  <div className="h-full w-full rounded-[1.5rem] bg-[#FAFAF7] p-4 flex flex-col gap-3 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-zinc-400 font-medium">
                        Today&apos;s Dump
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Good mood
                      </div>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-zinc-400 mb-2">
                        Extracted Tasks
                      </div>
                      <CascadingTasks
                        tasks={[
                          { text: "Email Q2 report to team", checked: true },
                          { text: "Book dentist appointment" },
                          { text: "Review PR #42" },
                        ]}
                      />
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-zinc-400 mb-1">
                        Key Theme
                      </div>
                      <div className="text-xs text-zinc-600">
                        Feeling productive but stretched thin on side projects.
                      </div>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <div className="text-xs text-violet-600 mb-1">
                        Goal Detected
                      </div>
                      <div className="text-xs text-zinc-600">
                        &ldquo;Launch MVP by end of month&rdquo;
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── COMPARISON ───── */}
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
              Why $19/month is a no-brainer
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="px-5 py-3 font-semibold text-zinc-900">Alternative</th>
                    <th className="px-5 py-3 font-semibold text-zinc-900">Cost</th>
                    <th className="px-5 py-3 font-semibold text-zinc-900">What&apos;s missing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {comparisons.map((row) => (
                    <tr
                      key={row.alt}
                      className="transition-colors duration-200 hover:bg-zinc-50"
                    >
                      <td className="px-5 py-3.5 font-medium text-zinc-800 whitespace-nowrap">
                        {row.alt}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-500 whitespace-nowrap">
                        {row.cost}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-500">
                        {row.missing}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          <Reveal delay={2}>
            <div className="mt-10 flex flex-col items-center gap-3 text-center">
              <p className="text-sm font-bold text-zinc-900">
                1/8th the cost of a single therapy session
              </p>
              <p className="text-sm font-bold text-zinc-900">
                1/26th the cost of a life coach
              </p>
              <p className="text-sm font-bold text-zinc-900">
                The only option that requires zero effort and produces structured output
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── STATS TICKER ───── */}
      <section className="py-12 px-6 border-y border-zinc-200/60 bg-white/50 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {stats.map((stat, i) => (
              <Reveal key={stat.label} delay={i as 0 | 1 | 2 | 3}>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                  />
                </div>
                <div className="mt-1 text-sm text-zinc-500">{stat.label}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── SOCIAL PROOF STRIP ───── */}
      {/* TODO: Replace placeholder avatars with real influencer/user photos */}
      <section className="py-16 px-6 overflow-hidden">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <h3 className="text-lg font-semibold text-zinc-600">
              Used by productivity obsessives 👀
            </h3>
          </Reveal>
          <Reveal delay={1}>
            <div className="mt-6 flex justify-center -space-x-3">
              {["S", "M", "P", "A", "J", "R"].map((letter, i) => (
                <div
                  key={i}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#FAFAF7] bg-zinc-200 text-sm font-semibold text-zinc-500 transition-transform hover:scale-110 hover:z-10 cursor-default"
                >
                  {letter}
                </div>
              ))}
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#FAFAF7] bg-zinc-900 text-xs font-semibold text-white transition-transform hover:scale-110">
                +99
              </div>
            </div>
          </Reveal>
        </div>

        {/* Scrolling brand ticker */}
        <div
          className="mt-12 relative"
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
        >
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#FAFAF7] to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#FAFAF7] to-transparent z-10" />
          <div
            className="flex gap-12 animate-ticker"
            style={{ animationPlayState: tickerPaused ? "paused" : "running" }}
          >
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span
                key={i}
                className="shrink-0 text-sm font-medium text-zinc-400 whitespace-nowrap"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section id="how-it-works" className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center mb-20">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                How it works
              </h2>
              <p className="mt-4 text-zinc-500 text-lg">
                Three steps. Sixty seconds. Zero effort.
              </p>
            </div>
          </Reveal>

          <div className="space-y-32">
            {/* Step 1: Record */}
            <div className="flex flex-col gap-12 lg:items-center lg:flex-row">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                    Step 1
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Record</h3>
                  <p className="mt-4 text-lg text-zinc-500 leading-relaxed max-w-md">
                    Hit record. Speak freely for 60 seconds about your day, your
                    worries, your wins — whatever comes to mind.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[240px] h-[460px] rounded-[2.5rem] bg-zinc-200 p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-zinc-500 font-medium mb-auto">
                        Recording
                      </div>
                      <div className="flex flex-col items-center justify-center flex-1 gap-4">
                        <div className="relative flex items-center justify-center">
                          <div className="absolute h-20 w-20 rounded-full bg-red-500/20 animate-pulse-ring" />
                          <div className="absolute h-24 w-24 rounded-full bg-red-500/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
                          <div className="relative h-16 w-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                            <svg
                              className="h-7 w-7 text-white"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                            </svg>
                          </div>
                        </div>
                        <WaveformVisualizer />
                        <div className="text-xl font-bold text-zinc-900 font-mono">
                          0:47
                        </div>
                        <div className="text-xs text-zinc-500">
                          Speak freely...
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>

            {/* Step 2: Extract */}
            <div className="flex flex-col gap-12 lg:items-center lg:flex-row-reverse">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                    Step 2
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Extract</h3>
                  <p className="mt-4 text-lg text-zinc-500 leading-relaxed max-w-md">
                    AI transcribes and extracts tasks, goals, mood, themes, and
                    insights from your stream of consciousness.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[240px] h-[460px] rounded-[2.5rem] bg-zinc-200 p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-zinc-500 font-medium mb-3">
                        AI Extraction
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1.5">
                            Tasks
                          </div>
                          <CascadingTasks
                            tasks={[
                              { text: "Send proposal to client" },
                              { text: "Buy groceries" },
                              { text: "Call mom" },
                            ]}
                          />
                        </div>
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                          <div className="text-[10px] text-violet-600 uppercase tracking-wider mb-1">
                            Goal
                          </div>
                          <div className="text-xs text-zinc-600">
                            &ldquo;Ship the beta this week&rdquo;
                          </div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                          <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">
                            Mood
                          </div>
                          <div className="text-xs text-zinc-600">
                            Energized but slightly anxious
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>

            {/* Step 3: Reflect */}
            <div className="flex flex-col gap-12 lg:items-center lg:flex-row">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">
                    Step 3
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Reflect</h3>
                  <p className="mt-4 text-lg text-zinc-500 leading-relaxed max-w-md">
                    Get a weekly narrative report showing patterns in your life,
                    so you can course-correct before the next week starts.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[240px] h-[460px] rounded-[2.5rem] bg-zinc-200 p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-zinc-500 font-medium mb-3">
                        Weekly Report
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-2">
                            Mood this week
                          </div>
                          <div className="h-10">
                            <MoodBars
                              heights={[50, 60, 45, 75, 70, 85, 80]}
                              color="bg-violet-400"
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                            Pattern
                          </div>
                          <div className="text-xs text-zinc-600">
                            Best mood on days you exercised. Worst on days with
                            meetings after 6pm.
                          </div>
                        </div>
                        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">
                            Top 3 Actions
                          </div>
                          <div className="space-y-1 text-xs text-zinc-600">
                            <div>1. Block mornings for deep work</div>
                            <div>2. No meetings after 5pm</div>
                            <div>3. Exercise before noon</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FEATURES GRID ───── */}
      <section className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
              Everything you need to stay sharp
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-center text-zinc-500 text-lg">
              One nightly habit that powers your entire week.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                <div className="group rounded-2xl border border-zinc-100 bg-[#FAFAF7] p-6 transition-all duration-300 hover:shadow-lg hover:shadow-violet-500/5 hover:border-violet-200 hover:-translate-y-1 cursor-default">
                  <div className="mb-3 text-3xl transition-transform duration-300 group-hover:scale-110">
                    {f.icon}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-zinc-500">
                    {f.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      {/* TODO: Replace fake testimonials with real user testimonials */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
              People are loving it
            </h2>
            <p className="mx-auto mt-4 text-center text-zinc-500 text-lg">
              Join thousands reclaiming their headspace.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <figure className="group rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, j) => (
                      <svg
                        key={j}
                        className="h-4 w-4 text-amber-400 transition-transform duration-300"
                        style={{ transitionDelay: `${j * 50}ms` }}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <blockquote className="text-sm leading-relaxed text-zinc-600">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-500 transition-colors group-hover:bg-violet-100 group-hover:text-violet-600">
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-zinc-400">{t.role}</div>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── PRICING ───── */}
      <section id="pricing" className="px-6 py-24 sm:py-32 bg-white">
        <div className="mx-auto max-w-md text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Simple pricing
            </h2>
            <p className="mt-4 text-zinc-500 text-lg">
              One plan. Everything included. Cancel anytime.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 relative group">
              {/* Shimmer border effect */}
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer blur-[1px]" />

              <div className="relative rounded-2xl border border-zinc-200 bg-[#FAFAF7] p-8 text-left shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-wider text-violet-600">
                  Pro
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">
                    <AnimatedCounter prefix="$" target={19} duration={1500} />
                  </span>
                  <span className="text-zinc-400">/month</span>
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  7-day free trial &middot; no card required
                </p>

                <ul className="mt-8 space-y-3 text-sm text-zinc-600">
                  {pricingFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
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
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/auth/signin"
                  className="mt-8 block w-full rounded-xl bg-zinc-900 py-3.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-700 hover:shadow-xl hover:shadow-zinc-900/20 active:scale-95"
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── CTA BANNER ───── */}
      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-3xl bg-gradient-to-r from-violet-600 to-indigo-600 p-12 sm:p-16 text-center text-white relative overflow-hidden">
            {/* Animated background circles */}
            <div className="absolute top-0 right-0 h-64 w-64 rounded-full bg-white/10 -translate-y-1/2 translate-x-1/3 animate-blob-drift" />
            <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-white/10 translate-y-1/2 -translate-x-1/3 animate-blob-drift-2" />

            <div className="relative">
              <h2 className="text-3xl font-bold sm:text-4xl">
                Start your nightly brain dump tonight
              </h2>
              <p className="mt-4 text-white/80 text-lg max-w-lg mx-auto">
                60 seconds is all it takes. Your future self will thank you.
              </p>
              <Link
                href="/auth/signin"
                className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-violet-700 shadow-lg transition hover:bg-zinc-100 active:scale-95"
              >
                Start Free Trial
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="border-t border-zinc-200 px-6 py-12 bg-[#FAFAF7]">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">✦</span>
                <span className="text-lg font-bold tracking-tight">
                  Acuity
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400 max-w-xs">
                Your mind, mapped.
              </p>
            </div>

            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="#" className="transition hover:text-zinc-900">
                Terms
              </a>
              <a href="#" className="transition hover:text-zinc-900">
                Privacy
              </a>
              <a href="#" className="transition hover:text-zinc-900">
                Contact
              </a>
            </div>

            <div className="flex items-center gap-4 text-sm text-zinc-500">
              <a href="#" className="transition hover:text-zinc-900">
                Twitter/X
              </a>
              <a href="#" className="transition hover:text-zinc-900">
                Instagram
              </a>
              <a href="#" className="transition hover:text-zinc-900">
                TikTok
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-zinc-200 text-center">
            <p className="text-xs text-zinc-400">
              Built with{" "}
              <span className="font-medium text-zinc-600">Claude</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Data
   ═══════════════════════════════════════════ */

const comparisons = [
  {
    alt: "Therapy",
    cost: "$150–300/session",
    missing: "Once a week, can't track daily patterns",
  },
  {
    alt: "Life coach",
    cost: "$500+/month",
    missing: "Not available at 10pm when you need to decompress",
  },
  {
    alt: "Notion/journaling",
    cost: "Free but costs time",
    missing: "Requires effort, produces no insights",
  },
  {
    alt: "Voice memos",
    cost: "Free",
    missing: "Raw audio, zero structure, nothing extracted",
  },
  {
    alt: "Day One/Reflectly",
    cost: "$3–10/month",
    missing: "Requires writing, no AI extraction, no task management",
  },
];

const stats = [
  { value: 2847, suffix: "+", prefix: "", label: "Brain dumps recorded" },
  { value: 12, suffix: "k", prefix: "", label: "Tasks extracted" },
  { value: 98, suffix: "%", prefix: "", label: "Said they sleep better" },
  { value: 60, suffix: "s", prefix: "", label: "Average dump time" },
];

const tickerItems = [
  "✦ Voice-first journaling",
  "✦ AI task extraction",
  "✦ Goal tracking",
  "✦ Mood analytics",
  "✦ Weekly insight reports",
  "✦ Life Map dashboard",
  "✦ Works while you sleep",
  "✦ 60-second habit",
];

const features = [
  {
    icon: "🎙️",
    title: "Voice-first journaling",
    desc: "No typing, no prompts. Just talk. Record up to 10 minutes of unfiltered thoughts every night.",
  },
  {
    icon: "📋",
    title: "AI task extraction",
    desc: "AI pulls actionable tasks from your ramblings and drops them into a clean to-do list.",
  },
  {
    icon: "🎯",
    title: "Goal tracking",
    desc: "Surface recurring goals across entries and track your progress over time — automatically.",
  },
  {
    icon: "😊",
    title: "Mood analytics",
    desc: "See your emotional arc over days and weeks. Spot trends before they become problems.",
  },
  {
    icon: "📊",
    title: "Weekly insight reports",
    desc: "Every Monday you get a digest: patterns, progress, blockers, and the top 3 actions for the week.",
  },
  {
    icon: "🗺️",
    title: "Life Map",
    desc: "A visual dashboard connecting your goals, moods, and tasks into one coherent picture of your life.",
  },
];

// TODO: Replace these fake testimonials with real user testimonials
const testimonials = [
  {
    name: "Sarah K.",
    role: "Product Manager",
    quote:
      "I used to let tasks pile up in my head until 2 AM. Now I dump everything into Acuity in 60 seconds and actually sleep.",
  },
  {
    name: "Marcus T.",
    role: "Startup Founder",
    quote:
      "The weekly reports are unreal. It's like having a therapist and a project manager rolled into one AI.",
  },
  {
    name: "Priya D.",
    role: "Graduate Student",
    quote:
      "I've tried every journaling app. Acuity is the only one that stuck because it asks nothing of me except my voice.",
  },
];

const pricingFeatures = [
  "Unlimited voice entries",
  "AI task & goal extraction",
  "Mood tracking & analytics",
  "Weekly insight reports",
  "Life Map dashboard",
  "Data export anytime",
];
