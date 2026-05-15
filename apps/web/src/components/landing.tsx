"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { FoundingMemberBanner } from "@/components/founding-member-banner";
import { SOCIAL_PROOF, STATS_STRIP } from "@/lib/social-proof";
import { APP_STORE_URL, AppStoreBadge } from "@/components/landing-shared";

/* ═══════════════════════════════════════════
   "Who it's for" dropdown for landing nav
   ═══════════════════════════════════════════ */

const WHO_FEATURED = [
  { href: "/for/therapy", title: "Therapy", description: "What if you had a therapist who listened every single day?" },
  { href: "/for/decoded", title: "Life decoded", description: "Reveal the subconscious patterns running your life" },
  { href: "/for/sleep", title: "Sleep", description: "Give your racing thoughts somewhere to go" },
  { href: "/for/weekly-report", title: "Weekly report & Life Matrix", description: "Your week, written by AI. Your life, mapped." },
  { href: "/for/founders", title: "Founders & executives", description: "The 60-second debrief for high performers" },
];

const WHO_MENTAL = [
  { href: "/for/anxiety", label: "Anxiety" },
  { href: "/for/adhd", label: "ADHD" },
  { href: "/for/burnout", label: "Burnout" },
  { href: "/for/grief", label: "Grief" },
  { href: "/for/overthinkers", label: "Overthinkers" },
  { href: "/for/chronic-pain", label: "Chronic Pain" },
];

const WHO_LIFESTYLE = [
  { href: "/for/remote-workers", label: "Remote Workers" },
  { href: "/for/new-parents", label: "New Parents" },
  { href: "/for/students", label: "Students" },
  { href: "/for/couples", label: "Couples" },
  { href: "/for/introverts", label: "Introverts" },
  { href: "/for/career-change", label: "Career Change" },
  { href: "/for/athletes", label: "Athletes" },
];

const WHO_PROS = [
  { href: "/for/entrepreneurs", label: "Entrepreneurs" },
  { href: "/for/managers", label: "Managers" },
  { href: "/for/freelancers", label: "Freelancers" },
  { href: "/for/creatives", label: "Creatives" },
  { href: "/for/nurses", label: "Nurses" },
  { href: "/for/teachers", label: "Teachers" },
  { href: "/for/therapists", label: "Therapists" },
];

function WhoItsForDropdown() {
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
        className="flex items-center gap-1 transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-100/500 after:transition-all hover:after:w-full"
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
        className={`absolute left-0 top-full mt-2 w-[640px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.06] bg-[#1E1C1A] shadow-2xl transition-all duration-200 origin-top ${
          open
            ? "opacity-100 scale-y-100 translate-y-0"
            : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="flex">
          {/* Featured column */}
          <div className="w-[280px] border-r border-white/[0.04] py-3">
            <div className="px-4 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC]">Featured</span>
            </div>
            {WHO_FEATURED.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className="block px-4 py-2.5 transition-all duration-150 border-l-2 border-transparent hover:border-violet-500 hover:bg-white/5"
              >
                <div className="text-sm font-medium text-white">{item.title}</div>
                <div className="text-xs text-[#A0A0B8] mt-0.5 leading-snug">{item.description}</div>
              </Link>
            ))}
          </div>

          {/* Categories columns */}
          <div className="flex-1 py-3 px-4">
            <div className="grid grid-cols-3 gap-x-4">
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Mental Health</span>
                {WHO_MENTAL.map((item) => (
                  <Link key={item.href} href={item.href} onClick={close} className="block py-1.5 text-sm text-[#A0A0B8] transition hover:text-white">
                    {item.label}
                  </Link>
                ))}
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Lifestyle</span>
                {WHO_LIFESTYLE.map((item) => (
                  <Link key={item.href} href={item.href} onClick={close} className="block py-1.5 text-sm text-[#A0A0B8] transition hover:text-white">
                    {item.label}
                  </Link>
                ))}
              </div>
              <div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#7C5CFC] block mb-2">Professionals</span>
                {WHO_PROS.map((item) => (
                  <Link key={item.href} href={item.href} onClick={close} className="block py-1.5 text-sm text-[#A0A0B8] transition hover:text-white">
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

/* Reveal component and useReveal hook removed — replaced by .animate-on-scroll CSS class + single useEffect observer */

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
        } else {
          setStarted(false);
          setCount(0);
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
        } else {
          setStarted(false);
          setDisplayed("");
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
        <span className="inline-block w-[3px] h-[1em] bg-violet-100/500 ml-0.5 animate-pulse align-middle" />
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
        } else {
          setVisible(false);
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
        } else {
          setVisibleCount(0);
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
          className="flex items-center gap-2 text-xs text-inherit transition-all duration-500"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateX(0)" : "translateX(20px)",
          }}
        >
          <div
            className={`h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center transition-colors duration-300 ${
              task.checked
                ? "border-emerald-500 bg-emerald-100/500"
                : "border-zinc-400/40"
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
   Animated cost comparison
   ═══════════════════════════════════════════ */

const costLines = [
  { fraction: "1/8th", label: "the cost of a single therapy session", pct: 12.5 },
  { fraction: "1/26th", label: "the cost of a life coach", pct: 3.8 },
  {
    fraction: "The only option",
    label: "that requires zero effort and produces structured output",
    pct: 100,
    highlight: true,
  },
];

function CostComparison() {
  const [visibleIdx, setVisibleIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          costLines.forEach((_, i) => {
            setTimeout(() => setVisibleIdx(i), i * 600);
          });
        } else {
          setVisibleIdx(-1);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="space-y-5">
      {costLines.map((line, i) => (
        <div
          key={i}
          className="transition-all duration-700"
          style={{
            opacity: i <= visibleIdx ? 1 : 0,
            transform: i <= visibleIdx ? "translateY(0)" : "translateY(20px)",
          }}
        >
          <div className="flex items-baseline gap-2 mb-2">
            <span
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                line.highlight ? "text-white" : "text-white"
              }`}
            >
              {line.fraction}
            </span>
            <span className="text-lg text-[#A0A0B8]">{line.label}</span>
          </div>
          {!line.highlight && (
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-1000 ease-out"
                style={{
                  width: i <= visibleIdx ? `${line.pct}%` : "0%",
                  transitionDelay: `${200}ms`,
                }}
              />
            </div>
          )}
          {line.highlight && (
            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-1500 ease-out"
                style={{
                  width: i <= visibleIdx ? "100%" : "0%",
                  transitionDelay: `${200}ms`,
                }}
              />
            </div>
          )}
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
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden hidden sm:block">
      {/* Floating orbs that respond to mouse — hidden on mobile for performance */}
      <div
        className="absolute top-20 left-[15%] h-[400px] w-[400px] rounded-full bg-violet-600/10 blur-[100px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 15}px, ${mouse.y * 15}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute top-40 right-[10%] h-[350px] w-[350px] rounded-full bg-indigo-500/10 blur-[100px] animate-blob-drift-2"
        style={{
          transform: `translate(${mouse.x * -20}px, ${mouse.y * -20}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
      <div
        className="absolute bottom-0 left-[40%] h-[300px] w-[300px] rounded-full bg-purple-500/[0.08] blur-[100px] animate-blob-drift"
        style={{
          transform: `translate(${mouse.x * 10}px, ${mouse.y * -10}px)`,
          transition: "transform 0.3s ease-out",
        }}
      />
    </div>
  );
}

/* ═══════════════════════════════════════════
   Animated Life Matrix — clean area-by-area
   ═══════════════════════════════════════════ */

const MATRIX_AREAS = [
  { label: "Health", color: "#14B8A6", target: 78 },
  { label: "Wealth", color: "#F59E0B", target: 62 },
  { label: "Relationships", color: "#F43F5E", target: 88 },
  { label: "Spirituality", color: "#A855F7", target: 45 },
  { label: "Career", color: "#3B82F6", target: 92 },
  { label: "Growth", color: "#22C55E", target: 71 },
];

/* Radar matrix — nodes positioned at their score distance from center */
/* ── Life Matrix Radar ── */

const CX = 250;
const CY = 250;
const MAX_R = 170;
const GRID_LEVELS = 4;

function rPt(i: number, r: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
}

const AREA_INSIGHTS: Record<string, string> = {
  Health: "Trending up — you mentioned exercise in 4 of your last 5 debriefs",
  Wealth: "Stable — financial stress appears less often than last month",
  Relationships: "Your strongest area — deep connections drive your energy",
  Spirituality: "Blind spot — only mentioned twice in the last 3 weeks",
  Career: "Peak performer — your top-scoring area at 92",
  Growth: "Accelerating — you set 3 new goals this month",
};

function LifeMatrixRadar() {
  const [litCount, setLitCount] = useState(0);
  const [activeIdx, setActiveIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const tRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          started.current = true;
          runCycle();
        } else {
          started.current = false;
          tRef.current.forEach(clearTimeout);
          tRef.current = [];
          setLitCount(0);
          setActiveIdx(-1);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => { obs.disconnect(); tRef.current.forEach(clearTimeout); };
  }, []);

  function runCycle() {
    tRef.current.forEach(clearTimeout);
    tRef.current = [];
    setLitCount(0);
    setActiveIdx(-1);

    for (let i = 0; i < 6; i++) {
      tRef.current.push(setTimeout(() => {
        setLitCount(i + 1);
        setActiveIdx(i);
      }, i * 700));
    }
    // Clear active highlight after all revealed
    tRef.current.push(setTimeout(() => setActiveIdx(-1), 6 * 700 + 500));
    // Hold then reset
    tRef.current.push(setTimeout(() => {
      setLitCount(0);
      setActiveIdx(-1);
      tRef.current.push(setTimeout(() => runCycle(), 600));
    }, 6 * 700 + 5000));
  }

  // Polygon
  const polyStr = MATRIX_AREAS.map((a, i) => {
    const r = i < litCount ? (a.target / 100) * MAX_R : 0;
    const p = rPt(i, r);
    return `${p.x},${p.y}`;
  }).join(" ");

  // Active insight
  const activeArea = activeIdx >= 0 ? MATRIX_AREAS[activeIdx] : null;

  return (
    <div ref={ref} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col lg:flex-row items-center gap-8">
        {/* Radar */}
        <div className="relative shrink-0">
          <svg viewBox="0 0 500 500" className="w-[340px] h-[340px] sm:w-[420px] sm:h-[420px]">
            {/* Grid */}
            {Array.from({ length: GRID_LEVELS }).map((_, lvl) => {
              const r = ((lvl + 1) / GRID_LEVELS) * MAX_R;
              const pts = Array.from({ length: 6 }).map((_, j) => {
                const p = rPt(j, r);
                return `${p.x},${p.y}`;
              }).join(" ");
              return <polygon key={lvl} points={pts} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />;
            })}

            {/* Spokes */}
            {MATRIX_AREAS.map((_, i) => {
              const p = rPt(i, MAX_R);
              return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />;
            })}

            {/* Data polygon */}
            {litCount > 0 && (
              <polygon
                points={polyStr}
                fill="#7C3AED"
                fillOpacity="0.1"
                stroke="#7C3AED"
                strokeWidth="2"
                strokeLinejoin="round"
                className="transition-all duration-700 ease-out"
              />
            )}

            {/* Center */}
            <circle cx={CX} cy={CY} r="4" fill="rgba(255,255,255,0.15)" />

            {/* Nodes */}
            {MATRIX_AREAS.map((area, i) => {
              const isLit = i < litCount;
              const isActive = activeIdx === i;
              const scoreR = (area.target / 100) * MAX_R;
              const nodeP = isLit ? rPt(i, scoreR) : { x: CX, y: CY };
              const labelP = rPt(i, MAX_R + 30);

              return (
                <g key={area.label}>
                  {/* Active pulse */}
                  {isActive && (
                    <>
                      <circle cx={nodeP.x} cy={nodeP.y} r="22" fill="none" stroke={area.color} strokeWidth="2.5" className="animate-pulse-ring" />
                      <circle cx={nodeP.x} cy={nodeP.y} r="15" fill={area.color} opacity="0.15" />
                    </>
                  )}
                  {/* Revealed glow */}
                  {isLit && !isActive && (
                    <circle cx={nodeP.x} cy={nodeP.y} r="12" fill={area.color} opacity="0.08" />
                  )}
                  {/* Node */}
                  <circle
                    cx={nodeP.x}
                    cy={nodeP.y}
                    r={isLit ? "8" : "0"}
                    fill={isLit ? area.color : "rgba(255,255,255,0.1)"}
                    stroke="white"
                    strokeWidth="3"
                    className="transition-all duration-700 ease-out"
                    style={isLit ? { filter: `drop-shadow(0 0 4px ${area.color}60)` } : {}}
                  />
                  {/* Label */}
                  <text
                    x={labelP.x}
                    y={labelP.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="14"
                    fontWeight={isLit ? "700" : "400"}
                    fill={isLit ? "#FFFFFF" : "rgba(255,255,255,0.2)"}
                    className="transition-all duration-500"
                  >
                    {area.label}
                  </text>
                  {/* Score */}
                  {isLit && (
                    <text
                      x={labelP.x}
                      y={labelP.y + 18}
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="800"
                      fill={area.color}
                    >
                      {area.target}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Insight panel — shows context for active/last area */}
        <div className="flex-1 min-w-0 max-w-xs">
          {activeArea ? (
            <div
              className="rounded-xl border-l-4 bg-[#1E1C1A] p-5 shadow-sm transition-all duration-500 animate-fade-in"
              style={{ borderColor: activeArea.color }}
              key={activeArea.label}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: activeArea.color }} />
                <span className="text-sm font-bold text-white">{activeArea.label}</span>
                <span className="text-sm font-bold" style={{ color: activeArea.color }}>
                  {activeArea.target}/100
                </span>
              </div>
              <p className="text-sm text-[#A0A0B8] leading-relaxed">
                {AREA_INSIGHTS[activeArea.label]}
              </p>
            </div>
          ) : litCount === 6 ? (
            <div className="space-y-2">
              {MATRIX_AREAS.map((area) => (
                <div key={area.label} className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: area.color }} />
                  <span className="text-sm font-medium text-[#A0A0B8] w-28">{area.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ backgroundColor: area.color, width: `${area.target}%` }} />
                  </div>
                  <span className="text-sm font-bold w-8 text-right" style={{ color: area.color }}>{area.target}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#A0A0B8]/60 italic">
              Mapping your life areas...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const matrixFeatures = [
  {
    title: "Week 1 — Surface level",
    desc: "Acuity learns your recurring tasks, basic mood patterns, and top-of-mind goals.",
  },
  {
    title: "Month 1 — Connections form",
    desc: "It spots that poor sleep predicts low productivity, or that exercise boosts your mood score by 40%.",
  },
  {
    title: "Month 3+ — Deep guidance",
    desc: "Personalized coaching: when to push, when to rest, which goals are stalling, and what habits actually move the needle.",
  },
];

/* GrowthChart removed — replaced by emotional moments section */

/* ═══════════════════════════════════════════
   Feature icon SVGs (replace emojis)
   ═══════════════════════════════════════════ */

function FeatureIcon({ iconKey }: { iconKey: string }) {
  const shared = "h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110";

  switch (iconKey) {
    case "mic":
      return (
        <div className={`${shared} bg-violet-100`}>
          <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        </div>
      );
    case "tasks":
      return (
        <div className={`${shared} bg-blue-100`}>
          <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case "target":
      return (
        <div className={`${shared} bg-emerald-100`}>
          <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </div>
      );
    case "heart":
      return (
        <div className={`${shared} bg-rose-100`}>
          <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
        </div>
      );
    case "chart":
      return (
        <div className={`${shared} bg-amber-100`}>
          <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
      );
    case "map":
      return (
        <div className={`${shared} bg-indigo-100`}>
          <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════ */

function trackInitiateCheckout() {
  if (typeof window !== "undefined" && window.fbq) {
    window.fbq("track", "InitiateCheckout");
  }
  // PostHog CTA click tracking for acquisition funnel
  try {
    const { getClientAttribution } = require("@/lib/attribution");
    const attr = getClientAttribution();
    const posthog = require("posthog-js").default;
    if (posthog?.capture) {
      posthog.capture("start_trial_cta_clicked", {
        sourcePage: window.location.pathname,
        utm_source: attr?.utm_source ?? null,
        utm_medium: attr?.utm_medium ?? null,
        utm_campaign: attr?.utm_campaign ?? null,
        utm_content: attr?.utm_content ?? null,
        ctaPosition: "above-fold",
      });
    }
  } catch {
    // PostHog may not be loaded — degrade silently
  }
}

export function LandingPage() {
  const [tickerPaused, setTickerPaused] = useState(false);

  // Set first-touch attribution cookie on landing
  useEffect(() => {
    try {
      const { setAttributionCookie } = require("@/lib/attribution");
      setAttributionCookie();
    } catch {
      // attribution module may not be available
    }
  }, []);

  // Hero phone entrance — runs once on mount, NOT scroll-triggered
  useEffect(() => {
    console.log('[hero-phone] useEffect fired');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const phones = document.querySelectorAll('[data-hero-phone]');
    phones.forEach((el) => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateY(20px) scale(0.97)';
      h.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
    });
    const timer = setTimeout(() => {
      phones.forEach((el, i) => {
        const h = el as HTMLElement;
        setTimeout(() => {
          h.style.opacity = '1';
          h.style.transform = 'translateY(0) scale(1)';
        }, i * 200);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // Scroll-triggered animations — pure inline styles, zero CSS classes, nothing to purge
  useEffect(() => {
    console.log('[scroll-animate] useEffect fired');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    console.log('[scroll-animate] prefers-reduced-motion:', reducedMotion);
    if (reducedMotion) return;

    // Inject float keyframe via JS so it can't be purged
    const style = document.createElement('style');
    style.textContent = `
      @keyframes gentle-float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-6px); }
      }
    `;
    document.head.appendChild(style);

    // --- Fade-up elements ---
    const fadeEls = document.querySelectorAll('[data-animate]');
    fadeEls.forEach((el) => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateY(24px)';
      h.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
      const delay = h.getAttribute('data-delay');
      if (delay) h.style.transitionDelay = delay + 'ms';
    });

    // --- Slide-left elements ---
    const slideLeftEls = document.querySelectorAll('[data-slide-left]');
    slideLeftEls.forEach((el) => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateX(-40px)';
      h.style.transition = 'opacity 0.7s ease-out, transform 0.7s ease-out';
    });

    // --- Slide-right elements ---
    const slideRightEls = document.querySelectorAll('[data-slide-right]');
    slideRightEls.forEach((el) => {
      const h = el as HTMLElement;
      h.style.opacity = '0';
      h.style.transform = 'translateX(40px)';
      h.style.transition = 'opacity 0.7s ease-out, transform 0.7s ease-out';
    });

    // Single observer for all animated elements
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const t = e.target as HTMLElement;
        if (e.isIntersecting) {
          t.style.opacity = '1';
          t.style.transform = 'translateX(0) translateY(0)';
          // If this is a mockup, add float animation after it appears
          if (t.hasAttribute('data-float-after')) {
            setTimeout(() => {
              t.style.transition = 'none';
              t.style.animation = 'gentle-float 3s ease-in-out infinite';
            }, 800);
          }
        } else {
          t.style.animation = 'none';
          t.style.opacity = '0';
          if (t.hasAttribute('data-slide-left')) {
            t.style.transform = 'translateX(-40px)';
          } else if (t.hasAttribute('data-slide-right')) {
            t.style.transform = 'translateX(40px)';
          } else {
            t.style.transform = 'translateY(24px)';
          }
          t.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
          const delay = t.getAttribute('data-delay');
          if (delay) t.style.transitionDelay = delay + 'ms';
        }
      });
    }, { threshold: 0.1 });

    fadeEls.forEach((el) => obs.observe(el));
    slideLeftEls.forEach((el) => obs.observe(el));
    slideRightEls.forEach((el) => obs.observe(el));

    return () => { obs.disconnect(); style.remove(); };
  }, []);

  return (
    <div className="min-h-screen bg-[#181614] text-white pb-24 sm:pb-0 overflow-x-hidden">
      {/* ───── BANNER + NAVBAR (both fixed) ───── */}
      <div className="fixed top-0 inset-x-0 z-50">
        <FoundingMemberBanner />
        <nav className="bg-[#181614] sm:bg-[#181614]/80 sm:backdrop-blur-md border-b border-white/[0.04]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:py-5">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <Image src="/AcuityLogoDark.png" alt="Acuity logo" width={24} height={24} className="shrink-0" />
              <span className="text-lg font-bold tracking-tight">Acuity</span>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-sm text-[#A0A0B8]">
              <a
                href="#"
                className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-100/500 after:transition-all hover:after:w-full"
              >
                Home
              </a>
              <WhoItsForDropdown />
              <a
                href="#how-it-works"
                className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-100/500 after:transition-all hover:after:w-full"
              >
                How it Works
              </a>
              <a
                href="#pricing"
                className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-100/500 after:transition-all hover:after:w-full"
              >
                Pricing
              </a>
              <Link
                href="/blog"
                className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-100/500 after:transition-all hover:after:w-full"
              >
                Articles
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/auth/signin"
              className="text-sm font-medium text-[#A0A0B8] transition hover:text-white"
            >
              Sign in
            </Link>
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackInitiateCheckout}
              className="rounded-full bg-[#7C5CFC] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#6B4FE0] hover:shadow-lg hover:shadow-[#7C5CFC]/40 active:scale-95"
            >
              Download App
            </a>
          </div>
        </div>
      </nav>
      </div>

      {/* ───── HERO ───── */}
      <section className="relative pt-36 pb-0 sm:pt-44 sm:pb-0 lg:pb-10 overflow-hidden">
        <ParallaxOrbs />

        {/* Mobile ambient glow — lightweight CSS-only, no mouse tracking */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden sm:hidden">
          <div className="absolute top-16 left-1/2 -translate-x-1/2 h-[300px] w-[300px] rounded-full bg-violet-600/15 blur-[80px] animate-pulse-slow" />
          <div className="absolute top-32 left-[20%] h-[200px] w-[200px] rounded-full bg-indigo-500/10 blur-[80px] animate-blob-drift" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:gap-10">
            {/* Left content — center on mobile, left on desktop */}
            <div className="flex-1 max-w-2xl text-center lg:text-left mx-auto lg:mx-0">
                <h1 className="font-black tracking-tight">
                  <span className="block text-white whitespace-nowrap text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem] leading-[1.1] mb-2 sm:mb-3">One minute a day.</span>
                  <span className="block bg-gradient-to-r from-[#B8A5FF] to-[#7C5CFC] bg-clip-text text-transparent whitespace-nowrap text-4xl sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem] leading-[1.2] pb-1">A life of clarity.</span>
                </h1>

                <p className="mt-8 text-base text-[#C0C0D0] leading-relaxed max-w-lg mx-auto lg:mx-0">
                  Acuity is the AI voice journal that turns your daily debrief into action. Talk any time of day — it catches your tasks, tracks the goals you keep circling, and surfaces the patterns you can&rsquo;t see on your own.
                </p>

              {/* CTA — mobile version (inline in hero, not just sticky bar) */}
                <div className="mt-8 flex flex-col items-center gap-3 lg:hidden">
                  <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={trackInitiateCheckout}
                    className="group relative rounded-full p-[2px] transition active:scale-95 overflow-hidden"
                  >
                    <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                    <span className="relative block rounded-full bg-[#7C5CFC] px-7 py-3.5 text-sm font-semibold text-white">
                      Start Free Trial
                    </span>
                  </a>
                  <AppStoreBadge className="mt-1" />
                  <p className="text-xs text-[#A0A0B8]">
                    No card. 90 seconds to set up.
                  </p>
                </div>

              {/* CTA — desktop version */}
                <div className="mt-10 hidden lg:flex flex-row items-start gap-3">
                  <a
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={trackInitiateCheckout}
                    className="group relative rounded-full p-[2px] transition active:scale-95 overflow-hidden"
                  >
                    <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                    <span className="relative block rounded-full bg-[#7C5CFC] px-7 py-3.5 text-sm font-semibold text-white transition group-hover:bg-[#6B4FE0]">
                      Start Free Trial
                    </span>
                  </a>
                  <a
                    href="#how-it-works"
                    className="rounded-xl border border-white/[0.06] px-7 py-3.5 text-sm font-semibold text-[#A0A0B8] transition hover:border-white/30 hover:bg-white/10 active:scale-95"
                  >
                    See how it works
                  </a>
                </div>
                <div className="mt-4 hidden lg:block">
                  <AppStoreBadge />
                </div>
                <p className="mt-3 text-xs text-[#A0A0B8] hidden lg:block">
                  No card. 90 seconds to set up.
                </p>
            </div>

            {/* Right side: Enhanced animated phone mockups — desktop only */}
            <div className="flex-1 mt-10 lg:mt-0 hidden lg:flex justify-center lg:justify-end">
              <div className="relative w-[320px] h-[540px] sm:w-[360px] sm:h-[600px] lg:w-[400px] lg:h-[660px] xl:w-[440px] xl:h-[720px]">
                {/* Ambient glow behind phones */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] lg:w-[400px] lg:h-[400px] rounded-full bg-[#7C5CFC]/15 blur-[80px] animate-pulse-slow" />

                {/* Phone 1 (back) — Weekly Report — LIGHT MODE */}
                <div data-hero-phone className="absolute right-0 top-6 w-[200px] sm:w-[230px] lg:w-[260px] xl:w-[280px] h-[400px] sm:h-[450px] lg:h-[500px] xl:h-[540px] rounded-[2rem] bg-white p-2 shadow-2xl shadow-black/30 hero-float" style={{ animationDelay: "0.5s", "--phone-rotate": "3deg" } as React.CSSProperties}>
                  <div className="h-full w-full rounded-[1.5rem] bg-[#FAFAF7] p-4 flex flex-col gap-2.5 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-[#9E9890]">9:41</div>
                      <div className="flex gap-1">
                        <div className="h-1.5 w-3 rounded-full bg-[#D0CBC5]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-[#D0CBC5]" />
                      </div>
                    </div>
                    <div className="text-xs text-[#2a2725] font-semibold">Weekly Report</div>
                    <div className="text-[10px] text-[#9E9890]">Apr 14 – Apr 20</div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                      <div className="text-[10px] text-[#8A8480] mb-2">Mood This Week</div>
                      <div className="h-10">
                        <MoodBars heights={[40, 55, 45, 70, 65, 80, 75]} color="bg-violet-400" />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-[#9E9890]">Mon</span>
                        <span className="text-[8px] text-[#9E9890]">Sun</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-100/50 p-3 shadow-sm">
                      <div className="text-[10px] text-violet-600 mb-1">Pattern Detected</div>
                      <div className="text-[10px] text-[#4A4540] leading-relaxed">Best mood on days you exercised. Worst after meetings past 6 PM.</div>
                    </div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                      <div className="text-[10px] text-[#8A8480] mb-1.5">Goals</div>
                      <div className="space-y-1.5">
                        <div>
                          <div className="flex justify-between text-[10px] text-[#4A4540] mb-0.5">
                            <span>Exercise</span><span className="text-emerald-500">3/5</span>
                          </div>
                          <div className="h-1 rounded-full bg-zinc-200"><div className="h-full w-3/5 rounded-full bg-emerald-100/500" /></div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] text-[#4A4540] mb-0.5">
                            <span>Ship beta</span><span className="text-violet-500">70%</span>
                          </div>
                          <div className="h-1 rounded-full bg-zinc-200"><div className="h-full w-[70%] rounded-full bg-violet-100/500" /></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phone 2 (front) — Today's Debrief — LIGHT MODE */}
                <div data-hero-phone className="absolute left-0 top-0 w-[200px] sm:w-[230px] lg:w-[260px] xl:w-[280px] h-[400px] sm:h-[450px] lg:h-[500px] xl:h-[540px] rounded-[2rem] bg-white p-2 shadow-2xl shadow-black/30 z-10 hero-float" style={{ animationDelay: "0s", "--phone-rotate": "-3deg" } as React.CSSProperties}>
                  <div className="h-full w-full rounded-[1.5rem] bg-[#FAFAF7] p-4 flex flex-col gap-2.5 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-[#9E9890]">9:41</div>
                      <div className="flex gap-1">
                        <div className="h-1.5 w-3 rounded-full bg-[#D0CBC5]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-[#D0CBC5]" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#2a2725] font-semibold">Today&rsquo;s Debrief</div>
                      <div className="flex items-center gap-1 rounded-full bg-emerald-100/50 border border-emerald-200 px-2 py-0.5 text-[9px] text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-100/500 animate-pulse" />7.2
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm text-[#4A4540]">
                      <div className="text-[10px] text-[#8A8480] mb-2">Extracted Tasks</div>
                      <CascadingTasks tasks={[{ text: "Email Q2 report to team", checked: true }, { text: "Call the accountant" }, { text: "Book dentist for Thursday" }]} />
                    </div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                      <div className="text-[10px] text-[#8A8480] mb-1">Theme</div>
                      <div className="text-[10px] text-[#4A4540]">Productive but stretched thin. Mentioned &ldquo;deadline&rdquo; 3x.</div>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-100/50 p-3">
                      <div className="text-[10px] text-violet-600 mb-1">Goal Tracked</div>
                      <div className="text-[10px] text-[#4A4540]">&ldquo;Ship the beta&rdquo; — mentioned 4 of last 5 entries</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ───── MOBILE PHONE PREVIEW (compact, single card) ───── */}
          <div className="mt-8 flex justify-center lg:hidden">
              <div className="relative">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full bg-[#7C5CFC]/15 blur-[60px] animate-pulse-slow" />
                <div data-hero-phone className="relative w-[220px] h-[380px] rounded-[2rem] bg-white p-2 shadow-2xl shadow-black/20 hero-float">
                  <div className="h-full w-full rounded-[1.5rem] bg-[#FAFAF7] p-4 flex flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] text-[#9E9890]">9:41</div>
                      <div className="flex gap-1">
                        <div className="h-1.5 w-3 rounded-full bg-[#D0CBC5]" />
                        <div className="h-1.5 w-1.5 rounded-full bg-[#D0CBC5]" />
                      </div>
                    </div>
                    <div className="text-xs text-[#2a2725] font-semibold">Today&rsquo;s Debrief</div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                      <div className="text-[10px] text-[#8A8480] mb-2">Mood</div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-100/500 animate-pulse" />
                        <span className="text-[10px] text-[#2a2725] font-medium">7.2</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm text-[#4A4540]">
                      <div className="text-[10px] text-[#8A8480] mb-2">Extracted Tasks</div>
                      <CascadingTasks tasks={[{ text: "Email Q2 report", checked: true }, { text: "Call the accountant" }, { text: "Book dentist" }]} />
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-100/50 p-2.5">
                      <div className="text-[10px] text-violet-600 mb-0.5">Goal Tracked</div>
                      <div className="text-[10px] text-[#4A4540]">&ldquo;Ship the beta&rdquo; — 4 of 5 entries</div>
                    </div>
                  </div>
                </div>
              </div>
          </div>

          {/* ───── SOCIAL PROOF (inside hero) ───── */}
          <div className="mt-8 lg:mt-6 px-6">
              <div className="mx-auto max-w-2xl flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-1">
              <span className="text-[#E8DDD0] font-bold text-sm">{SOCIAL_PROOF.rating} ★</span>
            </div>
            <p className="text-sm text-[#A0A0B8]">
              Join {SOCIAL_PROOF.underHeroCount} people already using Acuity
            </p>
              </div>
          </div>
        </div>
      </section>

      {/* ───── STATS TICKER ───── */}
      <section className="py-8 lg:py-10 px-6 border-y border-white/[0.04] bg-[#1E1C1A]/50 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
            {stats.map((stat, i) => (
              <div key={stat.label}>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                  />
                </div>
                <div className="mt-1 text-sm text-[#A0A0B8]">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───── SOCIAL PROOF STRIP ───── */}
      {/* TODO: Replace placeholder avatars with real influencer/user photos */}
      <section className="py-10 px-6 overflow-hidden">
        <div className="mx-auto max-w-2xl text-center">
            <h3 className="text-lg font-semibold text-[#A0A0B8]">
              Used by people who want to understand themselves
            </h3>
          <div className="mt-6 flex justify-center -space-x-3">
            {["S", "M", "P", "A", "J", "R"].map((letter, i) => (
              <div
                key={i}
                className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#181614] bg-[#252220] text-sm font-semibold text-[#A0A0B8] transition-all hover:scale-110 hover:z-10 cursor-default opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'forwards' }}
              >
                {letter}
              </div>
            ))}
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#181614] bg-[#7C5CFC] text-xs font-semibold text-white transition-all hover:scale-110 opacity-0 animate-fade-in-up"
              style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}
            >
              +99
            </div>
          </div>
        </div>

        {/* Scrolling brand ticker — seamless infinite loop */}
        <div
          className="mt-12 relative"
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
        >
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#181614] to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#181614] to-transparent z-10" />
          <div className="overflow-hidden">
            <div
              className="flex gap-12 animate-ticker w-max"
              style={{ animationPlayState: tickerPaused ? "paused" : "running" }}
            >
              {[...tickerItems, ...tickerItems, ...tickerItems].map((item, i) => (
                <span
                  key={i}
                  className="shrink-0 text-sm font-medium text-[#A0A0B8]/60 whitespace-nowrap"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section id="how-it-works" className="px-6 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl">
            <div className="text-center mb-14" data-animate="">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                How it works
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-lg">
                Three steps. Sixty seconds. Zero effort.
              </p>
            </div>

          <div className="space-y-16 sm:space-y-20">
            {/* Step 1: Record */}
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
              <div className="flex-1" data-slide-left>
                  <div className="text-xs font-semibold text-[#E8DDD0] uppercase tracking-wider mb-4">
                    Step 1
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Record</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    Hit record. Speak freely for 60 seconds about your day, your
                    worries, your wins — whatever comes to mind.
                  </p>
              </div>
              <div className="flex-1 flex justify-center" data-slide-right data-float-after>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-white p-2 shadow-xl shadow-black/20">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#8A8480] font-medium mb-auto">
                        Recording
                      </div>
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
                        <div className="text-xl font-bold text-[#2a2725] font-mono">
                          0:47
                        </div>
                        <div className="text-xs text-[#8A8480]">
                          Speak freely...
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>

            {/* Step 2: Extract */}
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row-reverse">
              <div className="flex-1" data-slide-right>
                  <div className="text-xs font-semibold text-[#E8DDD0] uppercase tracking-wider mb-4">
                    Step 2
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Extract</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    By morning, your tasks are on a list, your goals are tracked,
                    and your mood is scored. You didn&rsquo;t type a word.
                  </p>
              </div>
              <div className="flex-1 flex justify-center" data-slide-left data-float-after>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-white p-2 shadow-xl shadow-black/20">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#8A8480] font-medium mb-3">
                        AI Extraction
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm text-[#4A4540]">
                          <div className="text-[10px] text-[#8A8480] uppercase tracking-wider mb-1.5">
                            Tasks
                          </div>
                          <CascadingTasks tasks={[{ text: "Send proposal to client" }, { text: "Buy groceries" }, { text: "Call mom" }]} />
                        </div>
                        <div className="rounded-xl border border-violet-200 bg-violet-100/50 p-3">
                          <div className="text-[10px] text-violet-600 uppercase tracking-wider mb-1">Goal</div>
                          <div className="text-xs text-[#4A4540]">&ldquo;Ship the beta this week&rdquo;</div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-100/50 p-3">
                          <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">Mood</div>
                          <div className="text-xs text-[#4A4540]">Energized but slightly anxious</div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>

            {/* Step 3: Reflect */}
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
              <div className="flex-1" data-slide-left>
                  <div className="text-xs font-semibold text-[#E8DDD0] uppercase tracking-wider mb-4">
                    Step 3
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Reflect</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    Every Sunday morning, a 400-word narrative of your week. What weighed on you, what moved, what you kept coming back to.
                  </p>
              </div>
              <div className="flex-1 flex justify-center" data-slide-right data-float-after>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-white p-2 shadow-xl shadow-black/20">
                    <div className="h-full w-full rounded-[2rem] bg-[#FAFAF7] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#8A8480] font-medium mb-3">
                        Weekly Report
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-[#8A8480] uppercase tracking-wider mb-2">Mood this week</div>
                          <div className="h-10">
                            <MoodBars heights={[50, 60, 45, 75, 70, 85, 80]} color="bg-violet-400" />
                          </div>
                        </div>
                        <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-[#8A8480] uppercase tracking-wider mb-1">Pattern</div>
                          <div className="text-xs text-[#4A4540]">Best mood on days you exercised. Worst on days with meetings after 6pm.</div>
                        </div>
                        <div className="rounded-xl border border-[#DDD8D2] bg-white p-3 shadow-sm">
                          <div className="text-[10px] text-[#8A8480] uppercase tracking-wider mb-1">Top 3 Actions</div>
                          <div className="space-y-1 text-xs text-[#4A4540]">
                            <div>1. Block mornings for deep work</div>
                            <div>2. No meetings after 5pm</div>
                            <div>3. Exercise before noon</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── LIFE MATRIX ───── */}
      <section className="relative px-6 py-16 sm:py-20 lg:py-24 overflow-hidden">
        <div className="relative mx-auto max-w-6xl">
          {/* Header */}
            <div className="text-center mb-16" data-animate="">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#E8DDD0] mb-4">
                Life Matrix
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Your mind has patterns.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                  We help you see them.
                </span>
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-base max-w-xl mx-auto">
                Every debrief maps your strengths, surfaces your blind spots,
                and shows you exactly where to focus next.
              </p>
            </div>

          {/* Radar + live insight panel */}
          <div data-animate>
            <LifeMatrixRadar />
            <p className="text-center mt-8 text-sm text-[#A0A0B8]/70 italic">
              You don&rsquo;t have to do anything with this. It builds itself.
            </p>
          </div>
        </div>
      </section>

      {/* ───── MID-PAGE CTA ───── */}
      <section className="px-6 py-16">
          <div className="mx-auto max-w-xl text-center">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackInitiateCheckout}
              className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/10 active:scale-95"
            >
              Start Free Trial
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <p className="mt-3 text-sm text-[#A0A0B8]">
              No card required · Cancel anytime
            </p>
          </div>
      </section>

      {/* ───── EMOTIONAL MOMENTS — removed by Keenan ───── */}

      {/* ───── USE-CASE SCENARIOS ───── */}
      <section className="px-6 py-16 sm:py-20 lg:py-24 bg-[#1E1C1A]/50">
        <div className="mx-auto max-w-5xl">
            <div data-animate>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl mb-4">
              Fits your life. Not the other way around.
            </h2>
            <p className="text-center text-[#A0A0B8] text-lg mb-16 max-w-xl mx-auto">
              People use Acuity at different times, in different places, for different reasons. Here are two.
            </p>
            </div>

          <div className="grid gap-8 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-[#1E1C1A] p-8" data-slide-left>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <svg className="h-4 w-4 text-[#E8DDD0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#E8DDD0]">Morning</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-3">James, 34 — over morning coffee</h3>
                <p className="text-sm text-[#A0A0B8] leading-relaxed">
                  &ldquo;Yesterday&rsquo;s meeting with the team still bothers me. I think what&rsquo;s really going on is I feel like no one heard my idea. Also need to call the insurance company and finish that proposal...&rdquo;
                </p>
                <div className="mt-4 rounded-lg border border-white/[0.04] bg-[#252220] p-3">
                  <div className="text-[10px] text-violet-400 uppercase tracking-wider mb-1">Acuity extracted</div>
                  <div className="text-xs text-[#A0A0B8] space-y-1">
                    <div>&#x2022; Feeling unheard at work (recurring theme — 4th mention)</div>
                    <div>&#x2022; Call insurance company</div>
                    <div>&#x2022; Finish proposal</div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-[#1E1C1A] p-8" data-slide-right>
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                    <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Evening</span>
                </div>
                <h3 className="text-lg font-bold text-white mb-3">Priya, 29 — winding down after a long day</h3>
                <p className="text-sm text-[#A0A0B8] leading-relaxed">
                  &ldquo;Good day actually. Got through the presentation and it went better than I expected. I&rsquo;m proud of myself for not overthinking it. Need to remember to book the flights for next month...&rdquo;
                </p>
                <div className="mt-4 rounded-lg border border-white/[0.04] bg-[#252220] p-3">
                  <div className="text-[10px] text-violet-400 uppercase tracking-wider mb-1">Acuity extracted</div>
                  <div className="text-xs text-[#A0A0B8] space-y-1">
                    <div>&#x2022; Mood: confident, relieved (up from anxious yesterday)</div>
                    <div>&#x2022; Book flights for next month</div>
                    <div>&#x2022; Pattern: confidence rises after facing fears</div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      <section className="px-6 py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-6xl">
          <div data-animate>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              What people say after week one
            </h2>
            <p className="mx-auto mt-4 text-center text-[#A0A0B8] text-lg">
              The first weekly report is the moment it clicks.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <figure key={t.name} className="group rounded-2xl border border-white/[0.06] bg-[#1E1C1A] p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1" data-animate data-delay={i * 100}>
                <div className="flex items-center gap-1 mb-4">
                  <span className="text-[#E8DDD0] font-bold text-xs">{SOCIAL_PROOF.rating} ★</span>
                </div>
                <blockquote className="text-sm leading-relaxed text-[#A0A0B8]">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#252220] text-sm font-bold text-[#A0A0B8] transition-colors group-hover:bg-[#7C5CFC]/20 group-hover:text-[#7C5CFC]">
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-[#A0A0B8]/60">{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ───── TRUST STRIP ───── */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {["Audio deleted within 24hrs", "No card required", "Cancel anytime", "30-day free trial"].map((item, i) => (
              <div className="flex items-center gap-2 text-sm text-[#A0A0B8]">
                <svg className="h-4 w-4 text-emerald-400 shrink-0 animate-check-pulse" style={{ animationDelay: `${i * 0.5}s` }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                {item}
              </div>
          ))}
        </div>
      </section>

      {/* ───── PRICING ───── */}
      <section id="pricing" className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-md text-center">
            <div data-animate>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Simple pricing
            </h2>
            <p className="mt-4 text-[#A0A0B8] text-lg">
              One plan. Everything included. Cancel anytime.
            </p>
            </div>

            <div className="mt-12 relative group" data-animate="">
              {/* Shimmer border effect */}
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-[#E8DDD0]/60 via-[#E8DDD0]/30 to-[#E8DDD0]/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer blur-[1px]" />

              <div className="relative rounded-2xl border border-[#E8DDD0]/20 bg-[#1E1C1A] p-8 text-left shadow-sm animate-pricing-glow">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#E8DDD0]">
                  Pro
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">
                    $12.99
                  </span>
                  <span className="text-[#A0A0B8]">/month</span>
                </p>
                <p className="mt-2 text-sm text-[#A0A0B8]">
                  No card. 90 seconds to set up.
                </p>

                <ul className="mt-8 space-y-3 text-sm text-[#A0A0B8]">
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

                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackInitiateCheckout}
                  className="group relative mt-8 block w-full rounded-full p-[2px] transition active:scale-95 overflow-hidden"
                >
                  <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                  <span className="relative block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition group-hover:bg-[#6B4FE0]">
                    Start Free Trial
                  </span>
                </a>

                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#A0A0B8]">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.71 19.5c-.83-1.15-1.64-2.3-2.76-2.3s-1.51.68-2.83.68c-1.35 0-1.83-.7-3.08-.7s-2.22 1.22-3.08 2.43c-1.21 1.71-.99 4.94.86 7.74.66.99 1.54 2.1 2.69 2.12h.04c1.01 0 1.32-.68 2.74-.69h.04c1.39 0 1.67.68 2.71.67h.04c1.17-.02 2.09-1.24 2.75-2.23.47-.71.65-1.07 1.01-1.87-2.66-1.01-3.09-4.78-.46-6.22-.86-1.07-2.18-1.69-3.43-1.63-1.31.06-2.4.73-3.08.73s-1.95-.69-3.13-.67zM21.88 8.66c-1.69 0-3.37 1.17-4.48 3.2 3.72.18 6.56 2.62 6.56 5.23 0 .33-.05.65-.12.96 2.1-.45 3.56-2.91 3.56-5.45 0-2.45-2.26-3.94-5.52-3.94z" />
                  </svg>
                  Available on iPhone
                </div>
              </div>
            </div>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl text-center" data-animate="">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/5 px-4 py-1.5 text-sm text-[#A0A0B8] mb-6">
              <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              FAQ
            </span>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl mb-4 text-white">
              Frequently asked questions about Acuity
            </h2>
            <p className="text-[#A0A0B8] mb-4 max-w-xl mx-auto">
              Have questions about Acuity and how it turns your daily debrief into action? Our FAQs cover everything you need to get started.
            </p>
        </div>
        <div className="mx-auto max-w-3xl mt-8" data-animate="">
            <div className="rounded-2xl border border-white/[0.06] bg-[#1E1C1A] divide-y divide-white/[0.06]">
              {[
                { q: "What is Acuity and how does it work?", a: "Acuity is a daily shutdown ritual. You talk for 60 seconds about whatever is on your mind — tasks, worries, ideas, things that happened. By morning, your tasks are on a list, your mood is scored, and your goals are tracked. Every Sunday, a 400-word story of your week lands on your phone. You talk. Acuity does the rest." },
                { q: "Is this actually private?", a: "Your audio is deleted within 24 hours of transcription. Transcripts are encrypted at rest. We use OpenAI Whisper for transcription and Anthropic Claude for analysis — under their API terms, your data is processed and returned, never used to train their models. We never sell your data." },
                { q: "Do I have to use it every day?", a: "No. But people who record 4+ times in week one see dramatically better weekly reports. The AI needs a few data points before it can spot patterns. Most people settle into 4\u20135 recordings per week." },
                { q: "What if I don't know what to say?", a: "That's the point. Just talk. Say whatever is on your mind. The messier, the better — Acuity pulls the signal out of the noise. There are no prompts to answer and no format to follow." },
                { q: "Is this just a journaling app?", a: "No. You don't write anything. You talk for 60 seconds. Acuity extracts tasks, tracks goals over time, scores your mood, and writes you a weekly narrative. A journal records what you write down. Acuity catches what you'd otherwise forget." },
                { q: "How is Acuity different from voice notes or other recording apps?", a: "Voice notes store audio. Acuity processes it. Within minutes your recording becomes a task list, a mood score, a goal-tracking update, and a data point that feeds into your weekly report. The recording is the input, not the output." },
                { q: "How much does Acuity cost?", a: "$12.99/month after a 30-day free trial. No credit card required to start. Cancel anytime with one tap." },
                { q: "What AI does Acuity use?", a: "OpenAI Whisper for speech-to-text (accurate even when you mumble). Anthropic Claude for extraction, scoring, and report writing. We name the stack because you should know what's running under the hood." },
                { q: "Can I use Acuity on my phone?", a: "Yes. Acuity works on iPhone and Android. You can also use it on the web at getacuity.io. Your data syncs across devices." },
                { q: "What is the weekly report?", a: "Every Sunday morning, Acuity writes you a 400-word narrative of your week. It covers what you worked on, what kept coming up, how your mood shifted, and what patterns are forming. People tell us it's the most useful part of the app." },
              ].map((faq, i) => (
                <details key={i} className="group">
                  <summary className="flex cursor-pointer items-center justify-between px-6 py-5 text-left">
                    <h3 className="text-base font-semibold text-white pr-4">{faq.q}</h3>
                    <span className="shrink-0 text-[#A0A0B8] transition-transform duration-300 group-open:rotate-45 text-xl leading-none">+</span>
                  </summary>
                  <div className="faq-answer">
                    <div>
                      <div className="px-6 pb-5">
                        <p className="text-sm text-[#A0A0B8] leading-relaxed">{faq.a}</p>
                      </div>
                    </div>
                  </div>
                </details>
              ))}
            </div>
        </div>
      </section>

      {/* ───── CTA BANNER ───── */}
      <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl rounded-3xl bg-[#252220] p-6 sm:p-12 lg:p-16 text-center text-white relative overflow-hidden border border-[#E8DDD0]/10" data-animate="">
            {/* Subtle animated accents */}
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-[#E8DDD0]/10 -translate-y-1/3 translate-x-1/4 blur-3xl animate-blob-drift" />
            <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-violet-600/15 translate-y-1/3 -translate-x-1/4 blur-3xl animate-blob-drift-2" />

            <div className="relative">
              <p className="text-sm font-medium text-[#E8DDD0] mb-4 uppercase tracking-wider">
                No card. 90 seconds to set up.
              </p>
              <h2 className="text-3xl font-bold sm:text-5xl tracking-tight">
                Your first debrief takes
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                  60 seconds.
                </span>
              </h2>
              <p className="mt-5 text-[#A0A0B8] text-lg max-w-md mx-auto">
                Start today. Wake up to extracted tasks, tracked goals, and a
                clearer picture of your life.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a
                  href={APP_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={trackInitiateCheckout}
                  className="group relative rounded-full p-[2px] transition active:scale-95 overflow-hidden"
                >
                  <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
                  <span className="relative block rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#7C5CFC]/10 transition group-hover:bg-[#6B4FE0]">
                    Start Free Trial
                  </span>
                </a>
                <span className="text-sm text-[#A0A0B8]">
                  Then $12.99/month · cancel anytime
                </span>
              </div>
            </div>
          </div>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="border-t border-white/[0.06] px-6 py-16 bg-[#1A1816]">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:gap-12 lg:grid-cols-5">
            {/* Brand column */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2">
                <Image src="/AcuityLogoDark.png" alt="Acuity logo" width={28} height={28} className="shrink-0" />
                <span className="text-xl font-bold tracking-tight">
                  Acuity
                </span>
              </div>
              <p className="mt-3 text-sm text-[#A0A0B8] max-w-xs leading-relaxed">
                Talk for 60 seconds. Wake up to a clearer picture of your life. Your daily shutdown ritual.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <AppStoreBadge />
                <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-sm text-[#A0A0B8] transition hover:text-white hover:underline underline-offset-4">
                  Download on the App Store
                </a>
              </div>
              <p className="mt-6 text-xs text-[#A0A0B8]">
                Need help? <a href="mailto:hello@getacuity.io" className="text-violet-400 hover:text-violet-300 transition">hello@getacuity.io</a>
              </p>
            </div>

            {/* Link columns */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/80 mb-4">Product</h3>
              <ul className="space-y-3 text-sm text-[#A0A0B8]">
                <li><a href="/" className="transition hover:text-white hover:underline underline-offset-4">Home</a></li>
                <li><a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="transition hover:text-white hover:underline underline-offset-4">Download on App Store</a></li>
                <li><a href="/auth/signin" className="transition hover:text-white hover:underline underline-offset-4">Sign In</a></li>
                <li><a href="/#how-it-works" className="transition hover:text-white hover:underline underline-offset-4">How It Works</a></li>
                <li><a href="/#pricing" className="transition hover:text-white hover:underline underline-offset-4">Pricing</a></li>
                <li><a href="/#faq" className="transition hover:text-white hover:underline underline-offset-4">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/80 mb-4">Resources</h3>
              <ul className="space-y-3 text-sm text-[#A0A0B8]">
                <li><a href="/voice-journaling" className="transition hover:text-white hover:underline underline-offset-4">Voice Journaling Guide</a></li>
                <li><a href="/blog" className="transition hover:text-white hover:underline underline-offset-4">Blog</a></li>
                <li><a href="/#weekly-report" className="transition hover:text-white hover:underline underline-offset-4">Weekly Report</a></li>
                <li><a href="/#features" className="transition hover:text-white hover:underline underline-offset-4">Features</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/80 mb-4">Company</h3>
              <ul className="space-y-3 text-sm text-[#A0A0B8]">
                <li><a href="/terms" className="transition hover:text-white hover:underline underline-offset-4">Terms</a></li>
                <li><a href="/privacy" className="transition hover:text-white hover:underline underline-offset-4">Privacy</a></li>
                <li><a href="mailto:hello@getacuity.io" className="transition hover:text-white hover:underline underline-offset-4">Contact</a></li>
                <li><a href="/blog" className="transition hover:text-white hover:underline underline-offset-4">About</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#A0A0B8]">
              &copy; {new Date().getFullYear()} Acuity. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-xs text-[#A0A0B8]">
              <a href="/terms" className="transition hover:text-white">Terms</a>
              <a href="/privacy" className="transition hover:text-white">Privacy</a>
              <a href="mailto:hello@getacuity.io" className="transition hover:text-white">Support</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ───── STICKY MOBILE CTA ───── */}
      <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden">
        <div className="bg-[#181614]/95 backdrop-blur-lg border-t border-white/[0.06] px-4 py-3">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={trackInitiateCheckout}
            className="group relative block w-full rounded-full p-[2px] transition active:scale-[0.98] overflow-hidden"
          >
            <span className="absolute inset-[-100%] animate-cta-shine" style={{ background: 'conic-gradient(from 0deg, transparent 0%, transparent 60%, #ffffff 75%, #B8A5FF 85%, transparent 100%)' }} />
            <span className="relative block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition group-hover:bg-[#6B4FE0]">
              Download on App Store
            </span>
          </a>
          <p className="mt-1.5 text-center text-xs text-[#A0A0B8]">
            Free for 30 days · Available on iPhone
          </p>
        </div>
      </div>
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
    missing: "Not available when you actually need to decompress",
  },
  {
    alt: "Notion/journaling",
    cost: "Free but costs time",
    missing: "Requires effort, nobody reads it back to you",
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

// Imported from shared constants — see lib/social-proof.ts
const stats = STATS_STRIP.map((s) => ({ ...s }));

const tickerItems = [
  "✦ 60-second daily debrief",
  "✦ Tasks pulled from your voice",
  "✦ Goals tracked across entries",
  "✦ Mood scored every entry",
  "✦ Sunday report on your phone",
  "✦ Life Matrix across 6 areas",
  "✦ Works while you sleep",
  "✦ No typing required",
];

const featureData = [
  {
    iconKey: "mic" as const,
    title: "The Daily Debrief",
    desc: "No typing, no prompts. Talk about your day for 60 seconds — whenever suits you. That's it.",
  },
  {
    iconKey: "tasks" as const,
    title: "Your To-Do List, Built While You Sleep",
    desc: "Say \"I need to call the accountant\" while debriefing. By your next check-in, it's on your task list.",
  },
  {
    iconKey: "target" as const,
    title: "Goals That Remember",
    desc: "Mention \"get back to the gym\" in week one and again in week four. Acuity notices and tracks it.",
  },
  {
    iconKey: "heart" as const,
    title: "Your Mood, Scored Daily",
    desc: "See how you actually felt this week, not how you remember feeling. Mood scored from your own words — a mirror for the days that blur together.",
  },
  {
    iconKey: "chart" as const,
    title: "The Sunday Report",
    desc: "Every Sunday morning, a 400-word narrative of your week lands on your phone. Patterns you missed, themes you repeated, and the moments that mattered most.",
  },
  {
    iconKey: "map" as const,
    title: "The Life Matrix",
    desc: "Six areas of your life, scored every week. Career, health, relationships, finances, growth, purpose. See the full picture — what's thriving and what needs your attention.",
  },
];

// TODO: Replace these fake testimonials with real user testimonials
const testimonials = [
  {
    name: "Sarah K.",
    role: "Product Manager",
    quote:
      "I used to let tasks pile up in my head until 2 AM. Now I debrief into Acuity in 60 seconds and actually sleep.",
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
  "Unlimited daily debriefs",
  "Tasks & goals extracted automatically",
  "Mood scored from your own words",
  "Weekly report every Sunday",
  "Life Matrix across 6 areas",
  "Export your data anytime",
];
