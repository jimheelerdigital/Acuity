"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";

/* ═══════════════════════════════════════════
   "Who it's for" dropdown for landing nav
   ═══════════════════════════════════════════ */

const WHO_FEATURED = [
  { href: "/for/therapy", title: "Therapy", description: "What if you had a therapist who listened every night?" },
  { href: "/for/decoded", title: "Life decoded", description: "Reveal the subconscious patterns running your life" },
  { href: "/for/sleep", title: "Sleep", description: "Give your racing thoughts somewhere to go" },
  { href: "/for/weekly-report", title: "Weekly report & Life Matrix", description: "Your week, written by AI. Your life, mapped." },
  { href: "/for/founders", title: "Founders & executives", description: "The 60-second nightly debrief for high performers" },
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
        className="flex items-center gap-1 transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
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
        className={`absolute left-0 top-full mt-2 w-[640px] rounded-xl border border-white/10 bg-[#13131F] shadow-2xl transition-all duration-200 origin-top ${
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
          className="flex items-center gap-2 text-xs text-[#A0A0B8] transition-all duration-500"
          style={{
            opacity: i < visibleCount ? 1 : 0,
            transform: i < visibleCount ? "translateX(0)" : "translateX(20px)",
          }}
        >
          <div
            className={`h-3.5 w-3.5 rounded border shrink-0 flex items-center justify-center transition-colors duration-300 ${
              task.checked
                ? "border-emerald-500 bg-emerald-500"
                : "border-white/20"
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
          obs.unobserve(el);
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
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Floating orbs that respond to mouse */}
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
        if (e.isIntersecting && !started.current) {
          started.current = true;
          runCycle();
          obs.unobserve(el);
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
              className="rounded-xl border-l-4 bg-[#13131F] p-5 shadow-sm transition-all duration-500 animate-fade-in"
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

/* ═══════════════════════════════════════════
   Animated growth chart
   ═══════════════════════════════════════════ */

const GROWTH_LINES = [
  { label: "Health", color: "#14B8A6", points: [32, 35, 38, 42, 40, 48, 52, 55, 60, 58, 65, 72] },
  { label: "Career", color: "#3B82F6", points: [28, 30, 35, 33, 40, 45, 50, 55, 58, 62, 68, 75] },
  { label: "Relationships", color: "#F43F5E", points: [45, 42, 48, 50, 52, 55, 53, 60, 65, 68, 72, 78] },
  { label: "Growth", color: "#22C55E", points: [20, 25, 28, 35, 38, 42, 48, 52, 58, 63, 70, 80] },
  { label: "Wealth", color: "#F59E0B", points: [40, 38, 42, 44, 45, 48, 50, 53, 55, 58, 62, 65] },
  { label: "Spirituality", color: "#A855F7", points: [15, 18, 22, 25, 30, 35, 38, 42, 45, 50, 55, 60] },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function GrowthChart() {
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const frameRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          animate();
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function animate() {
    setProgress(0);
    const start = performance.now();
    const duration = 3000;
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setProgress(eased);
      if (p < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }
    frameRef.current = requestAnimationFrame(tick);
  }

  const w = 800;
  const h = 300;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 40;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const numPoints = 12;

  function toPath(points: number[]): string {
    const visibleCount = Math.floor(progress * numPoints) + 1;
    const partialProgress = (progress * numPoints) % 1;

    return points.slice(0, visibleCount).map((val, i) => {
      const x = padL + (i / (numPoints - 1)) * chartW;
      let y = padT + chartH - (val / 100) * chartH;
      // Partial last point
      if (i === visibleCount - 1 && i > 0 && visibleCount <= numPoints) {
        const prevY = padT + chartH - (points[i - 1] / 100) * chartH;
        y = prevY + (y - prevY) * partialProgress;
      }
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  }

  return (
    <div ref={ref} className="rounded-2xl border border-white/10 bg-[#13131F] p-6 overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 justify-center">
        {GROWTH_LINES.map((line) => (
          <div key={line.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="text-xs text-[#A0A0B8]">{line.label}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
        {/* Y-axis grid lines */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = padT + chartH - (val / 100) * chartH;
          return (
            <g key={val}>
              <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#A0A0B8">
                {val}
              </text>
            </g>
          );
        })}

        {/* X-axis month labels */}
        {MONTHS.map((month, i) => {
          const x = padL + (i / (numPoints - 1)) * chartW;
          return (
            <text key={month} x={x} y={h - 10} textAnchor="middle" fontSize="9" fill="#A0A0B8">
              {month}
            </text>
          );
        })}

        {/* Growth lines */}
        {GROWTH_LINES.map((line) => (
          <path
            key={line.label}
            d={toPath(line.points)}
            fill="none"
            stroke={line.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.8"
          />
        ))}

        {/* Dots at the current leading edge */}
        {progress > 0 && GROWTH_LINES.map((line) => {
          const visibleCount = Math.min(Math.floor(progress * numPoints) + 1, numPoints);
          const idx = visibleCount - 1;
          const x = padL + (idx / (numPoints - 1)) * chartW;
          const y = padT + chartH - (line.points[idx] / 100) * chartH;
          return (
            <circle
              key={line.label}
              cx={x}
              cy={y}
              r="3"
              fill={line.color}
              stroke="white"
              strokeWidth="1.5"
            />
          );
        })}
      </svg>
    </div>
  );
}

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
}

export function LandingPage() {
  const [tickerPaused, setTickerPaused] = useState(false);

  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white pb-24 sm:pb-0 overflow-x-hidden">
      {/* ───── NAVBAR ───── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0A0A0F]/80 backdrop-blur-md border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <img src="/AcuityLogoDark.png" alt="Acuity logo" className="shrink-0" style={{ width: 24, height: 24 }} />
              <span className="text-lg font-bold tracking-tight">Acuity</span>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-sm text-[#A0A0B8]">
              <a
                href="#"
                className="transition hover:text-white relative after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-0 after:bg-violet-500 after:transition-all hover:after:w-full"
              >
                Home
              </a>
              <WhoItsForDropdown />
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
            href="/waitlist?utm_campaign=home"
            onClick={trackInitiateCheckout}
            className="rounded-full bg-[#7C5CFC] px-5 py-2 text-sm font-medium text-white transition hover:bg-[#6B4FE0] hover:shadow-lg hover:shadow-[#7C5CFC]/20 active:scale-95"
          >
            Join the Waitlist
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
              <Reveal>
                <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl leading-[1.05]">
                  You have too much in your head.
                </h1>
              </Reveal>

              <Reveal delay={2}>
                <p className="mt-5 text-base text-[#A0A0B8] leading-relaxed max-w-sm">
                  Acuity is the daily debrief that turns what you&rsquo;re thinking about into what you&rsquo;re doing. Talk for 60 seconds, any time of day — it catches your tasks, tracks the goals you keep circling, and helps you monitor the patterns that keep you stuck.
                </p>
              </Reveal>

              <Reveal delay={3}>
                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/waitlist?utm_campaign=home"
                    onClick={trackInitiateCheckout}
                    className="rounded-full bg-[#7C5CFC] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/10 active:scale-95"
                  >
                    Join the waitlist — first month free
                  </Link>
                  <a
                    href="#how-it-works"
                    className="rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-[#A0A0B8] transition hover:border-white/20 hover:bg-white/5 active:scale-95"
                  >
                    See how it works
                  </a>
                </div>
                <p className="mt-3 text-xs text-[#A0A0B8]">
                  No credit card required
                </p>
              </Reveal>
            </div>

            {/* Right side: Animated phone mockups */}
            <div className="flex-1 mt-12 lg:mt-0 flex justify-center lg:justify-end">
              <div className="relative w-[320px] h-[580px] sm:w-[380px] sm:h-[640px]">
                {/* Phone 1 (back) — floating — light theme matching app */}
                <div className="absolute right-0 top-8 w-[220px] sm:w-[260px] h-[440px] sm:h-[500px] rounded-[2rem] bg-[#1E1E2E] p-2 shadow-2xl rotate-3 animate-float-delay">
                  <div className="h-full w-full rounded-[1.5rem] bg-[#13131F] p-4 flex flex-col gap-3 overflow-hidden">
                    <div className="text-xs text-[#A0A0B8] font-medium">
                      Weekly Report
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                      <div className="text-xs text-[#A0A0B8] mb-2">
                        Mood Trend
                      </div>
                      <div className="h-12">
                        <MoodBars
                          heights={[40, 55, 45, 70, 65, 80, 75]}
                          color="bg-violet-400"
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                      <div className="text-xs text-[#A0A0B8] mb-1">
                        Top Insight
                      </div>
                      <div className="text-xs text-[#A0A0B8]">
                        You mention "sleep" 4x this week. Consider a
                        wind-down routine.
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                      <div className="text-xs text-[#A0A0B8] mb-1">
                        Goals Progress
                      </div>
                      <div className="space-y-2">
                        <div>
                          <div className="flex justify-between text-xs text-[#A0A0B8] mb-1">
                            <span>Exercise</span>
                            <span>3/5</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10">
                            <div className="h-full w-3/5 rounded-full bg-emerald-500 transition-all duration-1000" />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-[#A0A0B8] mb-1">
                            <span>Reading</span>
                            <span>5/7</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/10">
                            <div className="h-full w-5/6 rounded-full bg-violet-500 transition-all duration-1000" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Phone 2 (front) — floating — light theme matching app */}
                <div className="absolute left-0 top-0 w-[220px] sm:w-[260px] h-[440px] sm:h-[500px] rounded-[2rem] bg-[#1E1E2E] p-2 shadow-2xl -rotate-3 z-10 animate-float">
                  <div className="h-full w-full rounded-[1.5rem] bg-[#13131F] p-4 flex flex-col gap-3 overflow-hidden">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#A0A0B8] font-medium">
                        Today's Debrief
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Good mood
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                      <div className="text-xs text-[#A0A0B8] mb-2">
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
                    <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                      <div className="text-xs text-[#A0A0B8] mb-1">
                        Key Theme
                      </div>
                      <div className="text-xs text-[#A0A0B8]">
                        Feeling productive but stretched thin on side projects.
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 p-3">
                      <div className="text-xs text-violet-600 mb-1">
                        Goal Detected
                      </div>
                      <div className="text-xs text-[#A0A0B8]">
                        "Launch MVP by end of month"
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ───── SOCIAL PROOF ───── */}
      <section className="px-6 py-8">
        <Reveal>
          <div className="mx-auto max-w-2xl flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <p className="text-sm text-[#A0A0B8]">
              Join <span className="text-white font-semibold">500+</span> people already on the waitlist
            </p>
          </div>
        </Reveal>
      </section>

      {/* ───── STATS TICKER ───── */}
      <section className="py-12 px-6 border-y border-white/5 bg-[#13131F]/50 backdrop-blur">
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
                <div className="mt-1 text-sm text-[#A0A0B8]">{stat.label}</div>
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
            <h3 className="text-lg font-semibold text-[#A0A0B8]">
              Used by productivity obsessives 👀
            </h3>
          </Reveal>
          <Reveal delay={1}>
            <div className="mt-6 flex justify-center -space-x-3">
              {["S", "M", "P", "A", "J", "R"].map((letter, i) => (
                <div
                  key={i}
                  className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#0A0A0F] bg-[#1E1E2E] text-sm font-semibold text-[#A0A0B8] transition-transform hover:scale-110 hover:z-10 cursor-default"
                >
                  {letter}
                </div>
              ))}
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#0A0A0F] bg-[#7C5CFC] text-xs font-semibold text-white transition-transform hover:scale-110">
                +99
              </div>
            </div>
          </Reveal>
        </div>

        {/* Scrolling brand ticker — seamless infinite loop */}
        <div
          className="mt-12 relative"
          onMouseEnter={() => setTickerPaused(true)}
          onMouseLeave={() => setTickerPaused(false)}
        >
          <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0A0A0F] to-transparent z-10" />
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0A0A0F] to-transparent z-10" />
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
      <section id="how-it-works" className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center mb-14">
              <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
                How it works
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-lg">
                Three steps. Sixty seconds. Zero effort.
              </p>
            </div>
          </Reveal>

          <div className="space-y-16 sm:space-y-20">
            {/* Step 1: Record */}
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#1E1E2E] px-3 py-1 text-xs font-semibold text-[#A0A0B8] uppercase tracking-wider mb-4">
                    Step 1
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Record</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    Hit record. Speak freely for 60 seconds about your day, your
                    worries, your wins — whatever comes to mind.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#1E1E2E] p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#13131F] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#A0A0B8] font-medium mb-auto">
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
                        <div className="text-xl font-bold text-white font-mono">
                          0:47
                        </div>
                        <div className="text-xs text-[#A0A0B8]">
                          Speak freely...
                        </div>
                      </div>
                    </div>
                  </div>
                </Reveal>
              </div>
            </div>

            {/* Step 2: Extract */}
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row-reverse">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#1E1E2E] px-3 py-1 text-xs font-semibold text-[#A0A0B8] uppercase tracking-wider mb-4">
                    Step 2
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Extract</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    By morning, your tasks are on a list, your goals are tracked,
                    and your mood is scored. You didn&rsquo;t type a word.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#1E1E2E] p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#13131F] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#A0A0B8] font-medium mb-3">
                        AI Extraction
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                          <div className="text-[10px] text-[#A0A0B8] uppercase tracking-wider mb-1.5">
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
                        <div className="rounded-xl border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 p-3">
                          <div className="text-[10px] text-violet-600 uppercase tracking-wider mb-1">
                            Goal
                          </div>
                          <div className="text-xs text-[#A0A0B8]">
                            "Ship the beta this week"
                          </div>
                        </div>
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                          <div className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">
                            Mood
                          </div>
                          <div className="text-xs text-[#A0A0B8]">
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
            <div className="flex flex-col gap-8 lg:items-center lg:flex-row">
              <div className="flex-1">
                <Reveal>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[#1E1E2E] px-3 py-1 text-xs font-semibold text-[#A0A0B8] uppercase tracking-wider mb-4">
                    Step 3
                  </div>
                  <h3 className="text-3xl font-bold sm:text-4xl">Reflect</h3>
                  <p className="mt-4 text-lg text-[#A0A0B8] leading-relaxed max-w-md">
                    Every Sunday morning, a 400-word narrative of your week. What weighed on you, what moved, what you kept coming back to.
                  </p>
                </Reveal>
              </div>
              <div className="flex-1 flex justify-center">
                <Reveal delay={1}>
                  <div className="w-[220px] h-[420px] rounded-[2.5rem] bg-[#1E1E2E] p-2 shadow-xl">
                    <div className="h-full w-full rounded-[2rem] bg-[#13131F] p-5 flex flex-col overflow-hidden">
                      <div className="text-xs text-[#A0A0B8] font-medium mb-3">
                        Weekly Report
                      </div>
                      <div className="space-y-2.5 flex-1">
                        <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                          <div className="text-[10px] text-[#A0A0B8] uppercase tracking-wider mb-2">
                            Mood this week
                          </div>
                          <div className="h-10">
                            <MoodBars
                              heights={[50, 60, 45, 75, 70, 85, 80]}
                              color="bg-violet-400"
                            />
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                          <div className="text-[10px] text-[#A0A0B8] uppercase tracking-wider mb-1">
                            Pattern
                          </div>
                          <div className="text-xs text-[#A0A0B8]">
                            Best mood on days you exercised. Worst on days with
                            meetings after 6pm.
                          </div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-[#1E1E2E] p-3 shadow-sm">
                          <div className="text-[10px] text-[#A0A0B8] uppercase tracking-wider mb-1">
                            Top 3 Actions
                          </div>
                          <div className="space-y-1 text-xs text-[#A0A0B8]">
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

      {/* ───── LIFE MATRIX ───── */}
      <section className="relative px-6 py-24 sm:py-32 overflow-hidden">
        <div className="relative mx-auto max-w-5xl">
          {/* Header */}
          <Reveal>
            <div className="text-center mb-16">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#7C5CFC] mb-4">
                Life Matrix
              </p>
              <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Your mind has patterns.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-indigo-500">
                  We decode them.
                </span>
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-base max-w-xl mx-auto">
                Every debrief maps your strengths, surfaces your blind spots,
                and shows you exactly where to focus next.
              </p>
            </div>
          </Reveal>

          {/* Radar + live insight panel */}
          <Reveal delay={1}>
            <LifeMatrixRadar />
          </Reveal>
        </div>
      </section>

      {/* ───── MID-PAGE CTA ───── */}
      <section className="px-6 py-16">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <Link
              href="/waitlist?utm_campaign=home"
              onClick={trackInitiateCheckout}
              className="inline-flex items-center gap-2 rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/10 active:scale-95"
            >
              Join the waitlist — first month free
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <p className="mt-3 text-sm text-[#A0A0B8]">
              No card required · Cancel anytime
            </p>
          </div>
        </Reveal>
      </section>

      {/* ───── TRACK PROGRESS — ANIMATED GROWTH CHART ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <div className="text-center mb-12">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#7C5CFC] mb-4">
                Track Progress
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
                Growth you can see.
                <br />
                <span className="text-[#A0A0B8]">Automatically.</span>
              </h2>
              <p className="mt-4 text-[#A0A0B8] text-base max-w-lg mx-auto">
                Every area of your life trends upward over time. No manual logging — just talk, and watch the lines climb.
              </p>
            </div>
          </Reveal>

          <Reveal delay={1}>
            <GrowthChart />
          </Reveal>
        </div>
      </section>

      {/* ───── TESTIMONIALS ───── */}
      {/* TODO: Replace fake testimonials with real user testimonials */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-5xl">
              What people say after week one
            </h2>
            <p className="mx-auto mt-4 text-center text-[#A0A0B8] text-lg">
              The first weekly report is the moment it clicks.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <figure className="group rounded-2xl border border-white/10 bg-[#13131F] p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
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
                  <blockquote className="text-sm leading-relaxed text-[#A0A0B8]">
                    "{t.quote}"
                  </blockquote>
                  <figcaption className="mt-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1E1E2E] text-sm font-bold text-[#A0A0B8] transition-colors group-hover:bg-[#7C5CFC]/20 group-hover:text-[#7C5CFC]">
                      {t.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-[#A0A0B8]/60">{t.role}</div>
                    </div>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── TRUST STRIP ───── */}
      <section className="px-6 py-8">
        <Reveal>
          <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            {["Audio deleted within 24hrs", "No card required", "Cancel anytime", "First month free"].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-[#A0A0B8]">
                <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                {item}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───── PRICING ───── */}
      <section id="pricing" className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-md text-center">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
              Simple pricing
            </h2>
            <p className="mt-4 text-[#A0A0B8] text-lg">
              One plan. Everything included. Cancel anytime.
            </p>
          </Reveal>

          <Reveal delay={1}>
            <div className="mt-12 relative group">
              {/* Shimmer border effect */}
              <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-violet-400 via-indigo-400 to-violet-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer blur-[1px]" />

              <div className="relative rounded-2xl border border-white/10 bg-[#13131F] p-8 text-left shadow-sm">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#7C5CFC]">
                  Pro
                </p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">
                    $12.99
                  </span>
                  <span className="text-[#A0A0B8]">/month</span>
                </p>
                <p className="mt-2 text-sm text-[#A0A0B8]">
                  Join the waitlist &middot; no credit card required
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

                <Link
                  href="/waitlist?utm_campaign=home"
                  onClick={trackInitiateCheckout}
                  className="mt-8 block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#6B4FE0] hover:shadow-xl hover:shadow-[#7C5CFC]/20 active:scale-95"
                >
                  Join the waitlist — first month free
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── FAQ ───── */}
      <section className="px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <Reveal>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-center mb-12 text-white">
              Frequently asked questions
            </h2>
          </Reveal>
          <div className="space-y-4">
            {[
              { q: "Is this actually private?", a: "Your audio is deleted within 24 hours of transcription. Transcripts are encrypted. We use OpenAI Whisper for transcription and Anthropic Claude for analysis — under their API terms, your data is processed and returned, never used to train their models. We never sell your data." },
              { q: "Do I have to use it every night?", a: "No. But people who record 4+ times in week one see dramatically better weekly reports. The AI needs a few data points before it can spot patterns." },
              { q: "What if I don't know what to say?", a: "That's the point. Just talk. Say whatever is on your mind. The messier, the better — Acuity pulls the signal out of the noise." },
              { q: "Is this just a journaling app?", a: "No. You don't write anything. You talk for 60 seconds. By morning your tasks are on a list, your mood is scored, and every Sunday a 400-word story of your week lands on your phone." },
              { q: "How much does it cost?", a: "$12.99/month after a 14-day free trial. No credit card to start. Cancel anytime with one click." },
              { q: "What AI do you use?", a: "OpenAI Whisper for transcription (best-in-class accuracy, even with mumbling). Anthropic Claude for extraction and reports. We name the stack because we think you should know what's running under the hood." },
            ].map((faq, i) => (
              <Reveal key={i} delay={Math.min(i + 1, 3) as 1 | 2 | 3}>
                <div className="rounded-xl border border-white/10 bg-[#13131F] p-6">
                  <h3 className="text-base font-semibold text-white mb-2">{faq.q}</h3>
                  <p className="text-sm text-[#A0A0B8] leading-relaxed">{faq.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───── CTA BANNER ───── */}
      <section className="px-6 py-24 sm:py-32">
        <Reveal>
          <div className="mx-auto max-w-4xl rounded-3xl bg-zinc-900 p-12 sm:p-16 text-center text-white relative overflow-hidden">
            {/* Subtle animated accents */}
            <div className="absolute top-0 right-0 h-72 w-72 rounded-full bg-violet-600/20 -translate-y-1/3 translate-x-1/4 blur-3xl animate-blob-drift" />
            <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-indigo-600/20 translate-y-1/3 -translate-x-1/4 blur-3xl animate-blob-drift-2" />

            <div className="relative">
              <p className="text-sm font-medium text-violet-400 mb-4 uppercase tracking-wider">
                Join the waitlist · no credit card required
              </p>
              <h2 className="text-3xl font-bold sm:text-5xl tracking-tight">
                Your first debrief takes
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                  60 seconds.
                </span>
              </h2>
              <p className="mt-5 text-[#A0A0B8] text-lg max-w-md mx-auto">
                Start tonight. Wake up to extracted tasks, tracked goals, and a
                clearer picture of your life.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  href="/waitlist?utm_campaign=home"
                  onClick={trackInitiateCheckout}
                  className="rounded-full bg-[#7C5CFC] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#7C5CFC]/10 transition hover:shadow-xl hover:shadow-[#7C5CFC]/20 hover:-translate-y-0.5 active:scale-95"
                >
                  Join the waitlist — first month free
                </Link>
                <span className="text-sm text-[#A0A0B8]">
                  Then $12.99/month · cancel anytime
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ───── FOOTER ───── */}
      <footer className="border-t border-white/10 px-6 py-12 bg-[#0A0A0F]">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="flex items-center gap-2">
                <img src="/AcuityLogoDark.png" alt="Acuity logo" className="shrink-0" style={{ width: 24, height: 24 }} />
                <span className="text-lg font-bold tracking-tight">
                  Acuity
                </span>
              </div>
              <p className="mt-2 text-sm text-[#A0A0B8] max-w-xs">
                Your nightly shutdown ritual.
              </p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-[#A0A0B8]">
                <li><a href="/" className="transition hover:text-white">Home</a></li>
                <li><a href="/waitlist" className="transition hover:text-white">Join Waitlist</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Learn</h3>
              <ul className="space-y-2 text-sm text-[#A0A0B8]">
                <li><a href="/voice-journaling" className="transition hover:text-white">Voice Journaling Guide</a></li>
                <li><a href="/blog" className="transition hover:text-white">Blog</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50 mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-[#A0A0B8]">
                <li><a href="/terms" className="transition hover:text-white">Terms</a></li>
                <li><a href="/privacy" className="transition hover:text-white">Privacy</a></li>
                <li><a href="mailto:hello@getacuity.io" className="transition hover:text-white">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-[#A0A0B8]">
              &copy; {new Date().getFullYear()} Acuity. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* ───── STICKY MOBILE CTA ───── */}
      <div className="fixed bottom-0 inset-x-0 z-40 sm:hidden">
        <div className="bg-[#0A0A0F]/95 backdrop-blur-lg border-t border-white/10 px-4 py-3">
          <Link
            href="/waitlist?utm_campaign=home"
            onClick={trackInitiateCheckout}
            className="block w-full rounded-full bg-[#7C5CFC] py-3.5 text-center text-sm font-semibold text-white transition hover:bg-[#6B4FE0] active:scale-[0.98]"
          >
            Join the waitlist — first month free
          </Link>
          <p className="mt-1.5 text-center text-xs text-[#A0A0B8]">
            Early access — limited spots at founding member pricing
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
    missing: "Not available at 10pm when you need to decompress",
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

const stats = [
  { value: 2847, suffix: "+", prefix: "", label: "Daily debriefs recorded" },
  { value: 12, suffix: "k", prefix: "", label: "Tasks extracted" },
  { value: 98, suffix: "%", prefix: "", label: "Said they sleep better" },
  { value: 60, suffix: "s", prefix: "", label: "Average debrief time" },
];

const tickerItems = [
  "✦ 60-second nightly debrief",
  "✦ Tasks pulled from your voice",
  "✦ Goals tracked across entries",
  "✦ Mood scored every night",
  "✦ Sunday report on your phone",
  "✦ Life Matrix across 6 areas",
  "✦ Works while you sleep",
  "✦ No typing required",
];

const featureData = [
  {
    iconKey: "mic" as const,
    title: "The Nightly Debrief",
    desc: "No typing, no prompts. Talk about your day for 60 seconds before bed. That's it.",
  },
  {
    iconKey: "tasks" as const,
    title: "Your To-Do List, Built While You Sleep",
    desc: "Say \"I need to call the accountant\" at 10 PM. By morning it's on your task list.",
  },
  {
    iconKey: "target" as const,
    title: "Goals That Remember",
    desc: "Mention \"get back to the gym\" in week one and again in week four. Acuity notices and tracks it.",
  },
  {
    iconKey: "heart" as const,
    title: "Your Mood, Scored Nightly",
    desc: "See how you actually felt this week, not how you remember feeling. Mood scored from your own words.",
  },
  {
    iconKey: "chart" as const,
    title: "The Sunday Report",
    desc: "Every Sunday morning, a 400-word narrative of your week lands on your phone. Patterns you missed, themes you repeated, where your energy went.",
  },
  {
    iconKey: "map" as const,
    title: "The Life Matrix",
    desc: "Six areas of your life, scored every week. Career, health, relationships, finances, growth, purpose. See which ones are getting attention and which are starving.",
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
  "Unlimited nightly debriefs",
  "Tasks & goals extracted automatically",
  "Mood scored from your own words",
  "Weekly report every Sunday",
  "Life Matrix across 6 areas",
  "Export your data anytime",
];
