"use client";

/**
 * Ripple marketing home, 2026-10 redesign (Keenan, 2026-10-21: "completely
 * different UI/UX", "highly engaging", brand across the Ripple and BWK
 * audiences so it isn't only about "her"). Approved from the canvas mockup
 * "Ripple Homepage Redesign".
 *
 * Fixed light palette (does not follow the app's dark/light toggle): the
 * ad funnels it hands off to are light too.
 *
 * Primary CTA → /start. With the funnel_test_only flag on, /start already
 * forwards to /start-test (lib/funnel-split.ts), so this page never needs
 * to know which funnel is winning.
 *
 * Analytics: hero CTA + store badges keep the funnel_hero_* event names
 * from the previous hero so before/after numbers compare directly;
 * funnel_hero_demo_picked is new (which plate visitors tap).
 */
import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import { CookieSettingsLink } from "@/components/cookie-consent";
import { LEARN_LINKS } from "@/lib/seo";
import { trackOnboardingEvent } from "@/lib/track-onboarding";

import { DEMO_PLATES, HOME_FAQS, HOME_REVIEWS, TICKER_ITEMS } from "./content";
import s from "./home-v2.module.css";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity&utm_source=site&utm_medium=home&utm_campaign=play_badge";
const START_URL = "/start";
const LOGIN_URL = "https://app.goripple.io/auth/signin";

export type HomePricing = {
  annual: string;
  monthly: string;
  annualPerMonth: string;
  savingsPct: string;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const EYEBROW = "text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#B9472A]";
const H2 = "m-0 font-display text-[36px] font-extrabold leading-[1.05] tracking-[-0.035em] min-[900px]:text-[56px]";
const WRAP = "mx-auto w-full max-w-[1200px] px-5 min-[900px]:px-10";

function Arrow({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function MicIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function Stars({ color = "#E0952B" }: { color?: string }) {
  return (
    <span role="img" aria-label="Five stars" style={{ color, letterSpacing: 2 }}>
      ★★★★★
    </span>
  );
}

function StoreBadges({ height, where }: { height: number; where: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackOnboardingEvent(where === "hero" ? "funnel_hero_app_store_clicked" : "funnel_home_app_store_clicked")}
        className={cx(s.lift, "block rounded-[10px]")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/apple-app-store.svg" alt="Download on the App Store" width={120} height={40} style={{ height, width: "auto" }} />
      </a>
      <a
        href={PLAY_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackOnboardingEvent(where === "hero" ? "funnel_hero_play_store_clicked" : "funnel_home_play_store_clicked")}
        className={cx(s.lift, "block rounded-[10px]")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/google-play.svg" alt="Get it on Google Play" width={135} height={40} style={{ height, width: "auto" }} />
      </a>
    </div>
  );
}

const WAVE_DELAYS = [-0.1, -0.5, -0.3, -0.8, -0.2, -0.6, -0.9, -0.4, -0.7, -0.15, -0.55, -0.35, -0.75, -0.25, -0.65, -0.45, -0.85, -0.05, -0.6, -0.3, -0.95, -0.5, -0.2];

/** The "what is on your plate?" demo: plays itself until the visitor taps a plate. */
function Demo() {
  const [plate, setPlate] = useState(0);
  const [turn, setTurn] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      setPlate((p) => (p + 1) % DEMO_PLATES.length);
      setTurn((n) => n + 1);
    }, 5500);
    return () => clearInterval(t);
  }, [auto]);

  const cur = DEMO_PLATES[plate];
  const words = cur.said.split(" ");
  const base = words.length * 35 + 150;

  return (
    <div className={cx(s.pop, "relative z-[2] flex flex-col gap-[18px] rounded-[28px] border border-[#EEE7DE] bg-white p-5 shadow-[0_40px_90px_rgba(60,40,20,0.16)] min-[900px]:p-7")} style={{ animationDelay: "200ms" }}>
      <div className="flex flex-col gap-3">
        <div className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">Try it: what is on your plate?</div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 min-[900px]:mx-0 min-[900px]:flex-wrap min-[900px]:overflow-visible min-[900px]:px-0">
          {DEMO_PLATES.map((p, i) => {
            const active = i === plate;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPlate(i);
                  setTurn((n) => n + 1);
                  setAuto(false);
                  trackOnboardingEvent("funnel_hero_demo_picked", { value: p.id });
                }}
                className={cx(
                  "h-11 shrink-0 whitespace-nowrap rounded-full border px-4 font-display text-[14px] font-bold transition-colors min-[900px]:h-10",
                  active ? "border-[#1B1815] bg-[#1B1815] text-white" : "border-[#E2D9CE] bg-white text-[#3F3A35] hover:border-[#1B1815]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {auto && (
          <div key={`t${turn}`} className="h-[3px] overflow-hidden rounded-full bg-[#F3EEE8]">
            <div className={cx(s.timer, "h-[3px] bg-[#F27A55]")} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3.5 rounded-[20px] bg-[#FBF8F4] p-4 min-[900px]:p-[18px]">
        <div className="flex items-center gap-3.5">
          <div className="relative h-11 w-11 shrink-0">
            <span className={s.ring} />
            <span className={s.ring} style={{ animationDelay: "0.8s" }} />
            <span className={s.ring} style={{ animationDelay: "1.6s" }} />
            <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[#F27A55]">
              <MicIcon />
            </div>
          </div>
          <svg aria-hidden="true" viewBox="0 0 230 30" className="h-[30px] min-w-0 flex-1" preserveAspectRatio="xMinYMid meet">
            <g fill="#F27A55">
              {WAVE_DELAYS.map((d, i) => (
                <rect key={i} className={s.bar} x={i * 10} y="2" width="5" height="26" rx="2.5" style={{ animationDelay: `${d}s` }} />
              ))}
            </g>
          </svg>
          <span className="text-[13px] font-bold text-[#57514B]">0:42</span>
        </div>
        <p key={`w${turn}`} className="m-0 text-[16px] font-medium leading-[1.5] text-[#1B1815] min-[900px]:text-[17px]">
          {words.map((w, i) => (
            <span key={i}>
              <span className={s.word} style={{ animationDelay: `${i * 35}ms` }}>
                {i === 0 ? `“${w}` : i === words.length - 1 ? `${w}”` : w}
              </span>{" "}
            </span>
          ))}
        </p>
      </div>

      <div className="flex items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#B9472A]">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        Ripple caught
      </div>

      <div key={`r${turn}`} className="grid grid-cols-2 gap-3" aria-live="polite">
        <div className={cx(s.pop, "col-span-2 flex flex-col gap-2.5 rounded-2xl border border-[#EEE7DE] px-4 py-3.5")} style={{ animationDelay: `${base}ms` }}>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">To-do</div>
          {cur.tasks.map((t, i) => (
            <div key={t} className={cx(s.pop, "flex items-center gap-2.5 text-[15px] font-semibold")} style={{ animationDelay: `${base + 120 + i * 140}ms` }}>
              <span className="h-[18px] w-[18px] shrink-0 rounded-md border-2 border-[#D8CDBF]" />
              {t}
            </div>
          ))}
        </div>
        <div className={cx(s.pop, "flex flex-col gap-1.5 rounded-2xl bg-[#FDE3D8] px-4 py-3.5")} style={{ animationDelay: `${base + 450}ms` }}>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#8F3519]">Mood</div>
          <div className="text-[15px] font-bold">{cur.mood}</div>
        </div>
        <div className={cx(s.pop, "flex flex-col gap-1.5 rounded-2xl bg-[#D9F0E6] px-4 py-3.5")} style={{ animationDelay: `${base + 600}ms` }}>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#1D6B51]">Habit</div>
          <div className="text-[15px] font-bold">{cur.habit}</div>
        </div>
        <div className={cx(s.pop, "col-span-2 flex flex-col gap-1.5 rounded-2xl bg-[#6D5EF0] px-4 py-3.5 text-white")} style={{ animationDelay: `${base + 750}ms` }}>
          <div className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#E1DCFF]">Keeps coming up</div>
          <div className="text-[15px] font-bold leading-[1.45]">{cur.pattern}</div>
        </div>
      </div>
      <div className="text-[12px] font-semibold text-[#57514B]">Example debrief</div>
    </div>
  );
}

const TICKER_COLORS: [string, string][] = [
  ["#F27A55", "#1B1815"],
  ["#FFFFFF", "#1B1815"],
  ["#6D5EF0", "#FFFFFF"],
  ["#F2B544", "#1B1815"],
  ["#2E9C78", "#FFFFFF"],
  ["#2A2420", "#FFFFFF"],
];

const PAINS: { quote: string; bg: string; fg: string; tilt: "L" | "R"; icon: ReactNode; shadow: string }[] = [
  {
    quote: "“I’m carrying everyone’s list in my head.”",
    bg: "#F27A55", fg: "#1B1815", tilt: "L", shadow: "rgba(242,122,85,0.3)",
    icon: <path d="M4 6h16M4 12h16M4 18h10" />,
  },
  {
    quote: "“I make the plan. Then I don’t follow it.”",
    bg: "#6D5EF0", fg: "#FFFFFF", tilt: "R", shadow: "rgba(109,94,240,0.3)",
    icon: <><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" /></>,
  },
  {
    quote: "“Busy all day, and none of it feels like progress.”",
    bg: "#F2B544", fg: "#1B1815", tilt: "L", shadow: "rgba(242,181,68,0.3)",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  },
  {
    quote: "“Same stress, same week, on repeat.”",
    bg: "#1B1815", fg: "#FFFFFF", tilt: "R", shadow: "rgba(27,24,21,0.25)",
    icon: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  },
];

const HABITS = [
  { name: "Train", on: [1, 1, 0, 1, 1, 0, 1] },
  { name: "Walk", on: [1, 0, 0, 1, 1, 1, 1] },
  { name: "Read", on: [0, 1, 1, 0, 1, 0, 1] },
];

const MATRIX = [
  { name: "Family", pct: 82, color: "#F27A55" },
  { name: "Work", pct: 78, color: "#6D5EF0" },
  { name: "Growth", pct: 73, color: "#2E9C78" },
  { name: "Health", pct: 54, color: "#F2B544" },
];

const REVIEW_STYLE = [
  { card: "border border-[#EEE7DE] bg-white", tilt: s.tiltL, star: "#E0952B", cap: "text-[#57514B]", av: "bg-[#F27A55] text-[#1B1815]" },
  { card: "bg-[#1B1815] text-white", tilt: "", star: "#F2B544", cap: "text-[#CFC7BE]", av: "bg-[#6D5EF0] text-white" },
  { card: "border border-[#EEE7DE] bg-white", tilt: s.tiltR, star: "#E0952B", cap: "text-[#57514B]", av: "bg-[#2E9C78] text-white" },
];

export function HomeV2({ pricing }: { pricing: HomePricing }) {
  const [yearly, setYearly] = useState(true);
  const [open, setOpen] = useState(0);
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const startClick = (where: string) => () =>
    trackOnboardingEvent(where === "hero" ? "funnel_hero_quiz_clicked" : "funnel_home_start_clicked", { value: where });

  const features = [
    "Unlimited debriefs, voice or typed",
    "Your to-do list, habits and mood",
    "Patterns and Life Matrix",
    "Your weekly report every Sunday",
    "iPhone, Android and web",
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FBF8F4] font-display text-[#1B1815]">
      {/* NAV */}
      <header className="sticky z-[60] border-b border-[#EEE7DE] bg-[rgba(251,248,244,0.9)] backdrop-blur-[14px]" style={{ top: "var(--install-banner-h, 0px)" }}>
        <div className={cx(WRAP, "flex h-16 items-center justify-between min-[900px]:h-[72px]")}>
          <a href="/" className="flex items-center gap-2.5 text-[#1B1815] no-underline">
            <Image src="/ripple-mark-coral-t.png" alt="" width={32} height={32} priority />
            <span className="text-[21px] font-extrabold tracking-[-0.02em]">Ripple</span>
          </a>
          <nav aria-label="Main" className="hidden items-center gap-8 min-[900px]:flex">
            {[
              ["How it works", "#how"],
              ["What you get", "#what"],
              ["Pricing", "#pricing"],
              ["FAQ", "#faq"],
              ["Blog", "/blog"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="text-[15px] font-semibold text-[#3F3A35] no-underline hover:text-[#1B1815]">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3 min-[900px]:gap-[18px]">
            <a href={LOGIN_URL} className="inline-flex h-11 items-center px-1 text-[15px] font-semibold text-[#1B1815] no-underline">
              Log in
            </a>
            <a href={START_URL} onClick={startClick("nav")} className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-[#1B1815] px-5 text-[15px] font-bold text-white no-underline">
              Start free week
            </a>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative pb-16 pt-10 min-[900px]:pb-24 min-[900px]:pt-20">
        <div aria-hidden="true" className="absolute right-[-160px] top-[-120px] h-[380px] w-[380px] rounded-full bg-[#FDE6DC] min-[900px]:right-[-180px] min-[900px]:top-[-140px] min-[900px]:h-[760px] min-[900px]:w-[760px]" />
        <div aria-hidden="true" className="absolute bottom-[-60px] right-[360px] hidden h-[220px] w-[220px] rounded-full bg-[#ECE9FE] min-[900px]:block" />
        <svg className={cx(s.spin, "pointer-events-none absolute right-[-290px] top-[-250px]")} aria-hidden="true" width="980" height="980" viewBox="0 0 980 980">
          <circle cx="490" cy="490" r="300" fill="none" stroke="#F27A55" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 14" />
          <circle cx="490" cy="490" r="400" fill="none" stroke="#F27A55" strokeOpacity="0.16" strokeWidth="2" strokeDasharray="2 18" />
          <circle cx="490" cy="490" r="480" fill="none" stroke="#6D5EF0" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="40 30" />
        </svg>

        <div className={cx(WRAP, "relative grid grid-cols-1 items-center gap-10 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[900px]:gap-[72px]")}>
          <div className="flex flex-col gap-6 min-[900px]:gap-7">
            <div className={cx(s.pop, "inline-flex items-center gap-2.5 self-start rounded-full border border-[#EEE7DE] bg-white px-3.5 py-2 shadow-[0_6px_18px_rgba(60,40,20,0.06)]")}>
              <Stars />
              <span className="text-[14px] font-semibold text-[#57514B]">on the App Store</span>
            </div>
            <h1 className={cx(s.pop, "m-0 text-[44px] font-extrabold leading-[1.05] tracking-[-0.04em] min-[900px]:text-[80px]")} style={{ animationDelay: "80ms" }}>
              Say it out loud.
              <br />
              Ripple sorts your{" "}
              <span className={s.rot} style={{ color: "#B9472A" }}>
                <span className="sr-only">to-dos, habits, mood, patterns and week.</span>
                <span className={s.rotIn} aria-hidden="true">
                  <span>to-dos.</span>
                  <span>habits.</span>
                  <span>mood.</span>
                  <span>patterns.</span>
                  <span>week.</span>
                  <span>to-dos.</span>
                </span>
              </span>
            </h1>
            <p className={cx(s.pop, "m-0 max-w-[540px] text-[17px] leading-[1.55] text-[#4A443E] min-[900px]:text-[20px]")} style={{ animationDelay: "160ms" }}>
              Talk through whatever is in your head. Ripple turns it into your to-do list, tracks your habits and mood, and shows you what keeps coming up, so you can actually change it.
            </p>
            <div className={cx(s.pop, "flex flex-wrap items-center gap-5")} style={{ animationDelay: "240ms" }}>
              <a href={START_URL} onClick={startClick("hero")} className={cx(s.cta, "inline-flex h-[60px] w-full items-center justify-center gap-2.5 rounded-full bg-[#B9472A] px-8 text-[18px] font-extrabold text-white no-underline min-[520px]:w-auto min-[900px]:h-[62px]")}>
                Start your free week <Arrow />
              </a>
              <a href="#how" className="hidden text-[16px] font-bold text-[#1B1815] min-[520px]:inline">
                See how it works
              </a>
            </div>
            <div className={s.pop} style={{ animationDelay: "280ms" }}>
              <StoreBadges height={50} where="hero" />
            </div>
            <div className={cx(s.pop, "flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-bold text-[#57514B]")} style={{ animationDelay: "320ms" }}>
              <span>7 days free</span>
              <span>Nothing charged today</span>
              <span>iPhone, Android and web</span>
            </div>
          </div>

          <div className="relative">
            <Demo />
          </div>
        </div>
      </section>

      {/* TICKER */}
      <section aria-label="Things people tell Ripple" className="-mx-5 -rotate-[1.2deg] overflow-hidden bg-[#1B1815] py-4 min-[900px]:py-[22px]">
        <div className={cx(s.marquee, "gap-3.5")}>
          {TICKER_ITEMS.concat(TICKER_ITEMS).map((t, i) => {
            const [bg, fg] = TICKER_COLORS[i % TICKER_COLORS.length];
            return (
              <span key={i} aria-hidden={i >= TICKER_ITEMS.length} className="inline-flex items-center whitespace-nowrap rounded-full px-[18px] py-2.5 text-[15px] font-extrabold min-[900px]:text-[16px]" style={{ background: bg, color: fg }}>
                {t}
              </span>
            );
          })}
        </div>
      </section>

      {/* PAIN */}
      <section className="py-20 min-[900px]:pb-28 min-[900px]:pt-[120px]">
        <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-14")}>
          <div className={cx(s.reveal, "flex max-w-[780px] flex-col gap-4")}>
            <div className={EYEBROW}>Sound familiar?</div>
            <h2 className={H2}>Too much in your head. Nowhere to put it.</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 min-[600px]:grid-cols-2 min-[1000px]:grid-cols-4 min-[1000px]:gap-[18px]">
            {PAINS.map((p) => (
              <div key={p.quote} className={s.reveal}>
                <div
                  className={cx(p.tilt === "L" ? s.tiltL : s.tiltR, "flex min-h-[180px] flex-col justify-between gap-6 rounded-[26px] p-[30px] min-[1000px]:min-h-[220px]")}
                  style={{ background: p.bg, boxShadow: `0 20px 40px ${p.shadow}` }}
                >
                  <svg aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={p.bg === "#1B1815" ? "#F27A55" : p.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p.icon}</svg>
                  <p className="m-0 text-[21px] font-extrabold leading-[1.3] min-[900px]:text-[22px]" style={{ color: p.fg }}>{p.quote}</p>
                </div>
              </div>
            ))}
          </div>
          <p className={cx(s.reveal, "m-0 max-w-[800px] text-[19px] leading-[1.5] text-[#3F3A35] min-[900px]:text-[24px]")}>
            You’re not lazy and you’re not behind. You’re running without a system.{" "}
            <strong className={cx(s.mark, "text-[#1B1815]")}>Ripple is where it all goes, so you can get on with doing it.</strong>
          </p>
        </div>
      </section>

      {/* HOW */}
      <section id="how" className="scroll-mt-24 border-y border-[#EEE7DE] bg-white py-20 min-[900px]:py-28">
        <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-16")}>
          <div className={cx(s.reveal, "flex max-w-[760px] flex-col gap-4")}>
            <div className={EYEBROW}>How it works</div>
            <h2 className={H2}>You talk. Ripple does the rest.</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
            <div className={cx(s.reveal, s.lift, "flex flex-col gap-5 rounded-[28px] bg-[#FFF4EF] p-7 min-[900px]:p-8")}>
              <div className="relative h-[72px] w-[72px]">
                <span className={s.ring} />
                <span className={s.ring} style={{ animationDelay: "1.2s" }} />
                <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#F27A55]"><MicIcon size={30} /></div>
              </div>
              <span className="text-[14px] font-extrabold tracking-[0.1em] text-[#B9472A]">STEP 1</span>
              <h3 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] min-[900px]:text-[28px]">Say what’s on your mind</h3>
              <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E]">Whenever it suits you: in the car, on a walk, between meetings. No typing, no prompts, no blank page. Type instead if you prefer.</p>
            </div>
            <div className={cx(s.reveal, s.lift, "flex flex-col gap-5 rounded-[28px] bg-[#F2F0FF] p-7 min-[900px]:p-8")}>
              <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-[#6D5EF0]">
                <svg className={s.spin} aria-hidden="true" width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></svg>
              </div>
              <span className="text-[14px] font-extrabold tracking-[0.1em] text-[#4A3DC4]">STEP 2</span>
              <h3 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] min-[900px]:text-[28px]">Ripple sorts it</h3>
              <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E]">Your to-dos land on your list with the dates you mentioned. Habits get checked off. Your mood gets noted. Nothing falls through the cracks.</p>
            </div>
            <div className={cx(s.reveal, s.lift, "flex flex-col gap-5 rounded-[28px] bg-[#EAF7F1] p-7 min-[900px]:p-8")}>
              <div className="flex h-[72px] w-[72px] items-end justify-center gap-1.5 rounded-[22px] bg-[#2E9C78] pb-[18px]">
                <span className="h-[18px] w-2 rounded bg-white" />
                <span className="h-7 w-2 rounded bg-white" />
                <span className="h-9 w-2 rounded bg-white" />
              </div>
              <span className="text-[14px] font-extrabold tracking-[0.1em] text-[#1D6B51]">STEP 3</span>
              <h3 className="m-0 text-[26px] font-extrabold tracking-[-0.02em] min-[900px]:text-[28px]">See what’s really going on</h3>
              <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E]">Every Sunday you get a report: what moved, what slipped, and what keeps coming up. Then you decide what to change.</p>
            </div>
          </div>
        </div>
      </section>

      {/* WHAT YOU GET */}
      <section id="what" className="scroll-mt-24 py-20 min-[900px]:py-28">
        <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-12")}>
          <div className={cx(s.reveal, "flex max-w-[760px] flex-col gap-4")}>
            <div className={EYEBROW}>What you get</div>
            <h2 className={H2}>Everything you say, put to work.</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
            <div className={cx(s.reveal, s.lift, "flex flex-col gap-6 rounded-[28px] border border-[#EEE7DE] bg-white p-6 min-[900px]:col-span-2 min-[900px]:p-8")}>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">Your to-do list, from your voice</h3>
                <p className="m-0 text-[16px] leading-[1.55] text-[#4A443E]">Mention it once and it’s on the list, with the day you said it was due.</p>
              </div>
              <div className="flex flex-col overflow-hidden rounded-[18px] border border-[#EEE7DE]">
                <div className="flex items-center gap-3 border-b border-[#EEE7DE] px-[18px] py-[15px]">
                  <span className={cx(s.dot, "h-5 w-5 shrink-0 rounded-[7px] bg-[#2E9C78]")} />
                  <span className="flex-1 text-[15px] font-semibold text-[#6B645D] line-through">Call the plumber</span>
                  <span className="text-[13px] font-extrabold text-[#1D6B51]">Done</span>
                </div>
                {[
                  ["Send the Henderson quote", "Thursday", "bg-[#FDE3D8] text-[#8F3519]"],
                  ["Sign the school form", "Friday", "bg-[#FDE3D8] text-[#8F3519]"],
                  ["Book your checkup", "Mentioned 4 times", "bg-[#ECE9FE] text-[#4A3DC4]"],
                ].map(([task, tag, tagCls], i, arr) => (
                  <div key={task} className={cx("flex items-center gap-3 px-[18px] py-[15px]", i < arr.length - 1 && "border-b border-[#EEE7DE]")}>
                    <span className="h-5 w-5 shrink-0 rounded-[7px] border-2 border-[#D8CDBF]" />
                    <span className="flex-1 text-[15px] font-semibold">{task}</span>
                    <span className={cx("whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-extrabold", tagCls)}>{tag}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={cx(s.reveal, s.lift, "flex flex-col gap-6 rounded-[28px] bg-[#2E9C78] p-6 text-white min-[900px]:p-8")}>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">Habits that track themselves</h3>
                <p className="m-0 text-[16px] leading-[1.55] text-[#E3F6EE]">Say you trained, walked or read, and it’s checked off. Skip it and Ripple notices.</p>
              </div>
              <div className="flex flex-col gap-3.5" role="img" aria-label="Example habit week: train 5 of 7 days, walk 5 of 7, read 4 of 7">
                {HABITS.map((h, r) => (
                  <div key={h.name} className="flex items-center justify-between gap-2">
                    <span className="text-[15px] font-extrabold">{h.name}</span>
                    <span className="flex gap-1.5">
                      {h.on.map((on, c) => (
                        <span key={c} className="h-5 w-5 rounded-full bg-[#22775C]">
                          <span className={cx(s.dot, "h-5 w-5 rounded-full")} style={{ background: on ? "#FFFFFF" : "#22775C", animationDelay: `${(r * 7 + c) * 90}ms` }} />
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={cx(s.reveal, s.lift, "flex flex-col gap-6 rounded-[28px] border border-[#EEE7DE] bg-white p-6 min-[900px]:p-8")}>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">Your mood, over time</h3>
                <p className="m-0 text-[16px] leading-[1.55] text-[#4A443E]">Ripple reads how you sound, so you can see your good weeks and your heavy ones.</p>
              </div>
              <svg role="img" aria-label="Example mood line rising over four weeks" width="100%" height="120" viewBox="0 0 300 120" preserveAspectRatio="none">
                <line x1="0" y1="110" x2="300" y2="110" stroke="#EEE7DE" strokeWidth="2" />
                <path d="M0 78 C30 68 50 44 80 52 S130 95 160 80 S220 34 250 38 S285 26 300 20 L300 110 L0 110 Z" fill="#FDE3D8" fillOpacity="0.6" />
                <path className={s.draw} d="M0 78 C30 68 50 44 80 52 S130 95 160 80 S220 34 250 38 S285 26 300 20" fill="none" stroke="#F27A55" strokeWidth="5" strokeLinecap="round" />
              </svg>
            </div>

            <div className={cx(s.reveal, s.lift, "flex flex-col gap-6 rounded-[28px] bg-[#6D5EF0] p-6 text-white min-[900px]:p-8")}>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">What keeps coming up</h3>
                <p className="m-0 text-[16px] leading-[1.55] text-[#E6E2FF]">The themes you circle back to, week after week, in your own words.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={cx(s.floatA, "rounded-full bg-white px-4 py-2.5 text-[15px] font-extrabold text-[#1B1815]")}>Work · 38</span>
                <span className={cx(s.floatB, "rounded-full bg-[#F2B544] px-4 py-2.5 text-[15px] font-extrabold text-[#1B1815]")}>Family · 27</span>
                <span className={cx(s.floatA, "rounded-full bg-[#F27A55] px-4 py-2.5 text-[15px] font-extrabold text-[#1B1815]")} style={{ animationDelay: "-2s" }}>Health · 22</span>
                <span className={cx(s.floatB, "rounded-full bg-white px-4 py-2.5 text-[15px] font-extrabold text-[#1B1815]")} style={{ animationDelay: "-4s" }}>Money · 16</span>
              </div>
            </div>

            <div className={cx(s.reveal, s.lift, "flex flex-col gap-6 rounded-[28px] border border-[#EEE7DE] bg-white p-6 min-[900px]:p-8")}>
              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">Life Matrix</h3>
                <p className="m-0 text-[16px] leading-[1.55] text-[#4A443E]">The main areas of your life, scored and tracked, so you see what’s thriving and what’s slipping.</p>
              </div>
              <div className="flex flex-col gap-3">
                {MATRIX.map((m, i) => (
                  <div key={m.name} className="flex items-center gap-2.5">
                    <span className="w-16 text-[13px] font-extrabold">{m.name}</span>
                    <span className="h-3 flex-1 rounded-full bg-[#F3EEE8]" role="img" aria-label={`${m.name}: ${m.pct} out of 100`}>
                      <span className={cx(s.grow, "h-3 rounded-full")} style={{ width: `${m.pct}%`, background: m.color, animationDelay: `${i * 150}ms` }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WEEKLY REPORT */}
      <section className="relative overflow-hidden bg-[#1B1815] py-20 text-white min-[900px]:py-[120px]">
        <div aria-hidden="true" className="absolute bottom-[-260px] left-[-200px] h-[620px] w-[620px] rounded-full bg-[#2A2420]" />
        <div className={cx(WRAP, "relative grid grid-cols-1 items-center gap-12 min-[900px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] min-[900px]:gap-[72px]")}>
          <div className={cx(s.reveal, "flex flex-col gap-[22px]")}>
            <div className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#F7A386]">Every Sunday</div>
            <h2 className={cx(H2, "text-white")}>
              Your week, written up <span className="text-[#F27A55]">for you.</span>
            </h2>
            <p className="m-0 text-[17px] leading-[1.6] text-[#CFC7BE] min-[900px]:text-[19px]">What happened, what moved, what slipped, and the one thing worth doing next. The throughline you would never have time to piece together yourself.</p>
            <a href={START_URL} onClick={startClick("report")} className={cx(s.cta, "inline-flex h-14 items-center self-start rounded-full bg-[#F27A55] px-7 text-[17px] font-extrabold text-[#1B1815] no-underline")}>
              Get your first report
            </a>
          </div>
          <div className={cx(s.reveal, "flex rotate-[1.5deg] flex-col gap-[22px] rounded-[30px] border border-[#3A342E] bg-[#26221E] p-6 shadow-[0_40px_80px_rgba(0,0,0,0.35)] min-[900px]:p-8")}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[22px] font-extrabold">Your week</span>
              <span className="text-[14px] font-semibold text-[#ADA49A]">Example</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1 rounded-[18px] bg-[#F27A55] p-4 text-[#1B1815]"><span className="text-[28px] font-extrabold min-[900px]:text-[32px]">5</span><span className="text-[13px] font-bold">debriefs</span></div>
              <div className="flex flex-col gap-1 rounded-[18px] bg-[#6D5EF0] p-4"><span className="text-[28px] font-extrabold min-[900px]:text-[32px]">11</span><span className="text-[13px] font-bold text-[#E6E2FF]">to-dos done</span></div>
              <div className="flex flex-col gap-1 rounded-[18px] bg-[#2E9C78] p-4"><span className="text-[28px] font-extrabold min-[900px]:text-[32px]">+6</span><span className="text-[13px] font-bold text-[#E3F6EE]">Life Matrix</span></div>
            </div>
            <div className="flex flex-col gap-3.5">
              {[
                ["MOVED", "bg-[#1F3A30] text-[#7FD6B4]", "Training: three sessions, your best week in a month."],
                ["SLIPPED", "bg-[#3E2A22] text-[#F7A386]", "Your own appointments. The checkup got pushed again."],
                ["PATTERN", "bg-[#2E2A4A] text-[#B9B0FF]", "Money comes up every time work gets loud."],
              ].map(([tag, cls, text]) => (
                <div key={tag} className="flex items-start gap-3">
                  <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold", cls)}>{tag}</span>
                  <span className="text-[16px] leading-[1.5] text-[#E8E1D9]">{text}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-[#3A342E] pt-[18px] text-[17px] font-extrabold leading-[1.5]">Next step: book the checkup Monday. You’ve mentioned it four times.</div>
          </div>
        </div>
      </section>

      {/* REVIEWS + TRUST */}
      <section className="py-20 min-[900px]:py-[120px]">
        <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-14")}>
          <div className={cx(s.reveal, "flex max-w-[800px] flex-col gap-4")}>
            <div className={EYEBROW}>In their words</div>
            <h2 className={H2}>“I never noticed until Ripple showed me.”</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
            {HOME_REVIEWS.map((r, i) => {
              const st = REVIEW_STYLE[i % REVIEW_STYLE.length];
              return (
                <figure key={r.name} className={cx(s.reveal, st.tilt, "m-0 flex flex-col justify-between gap-7 rounded-[28px] p-7 shadow-[0_20px_40px_rgba(60,40,20,0.07)] min-[900px]:p-8", st.card)}>
                  <blockquote className="m-0 flex flex-col gap-4">
                    <Stars color={st.star} />
                    <p className="m-0 text-[19px] font-bold leading-[1.5] min-[900px]:text-[20px]">“{r.quote.replace(/^“|”$/g, "")}”</p>
                  </blockquote>
                  <figcaption className={cx("flex items-center gap-2.5 text-[14px] font-extrabold", st.cap)}>
                    <span aria-hidden="true" className={cx("flex h-9 w-9 items-center justify-center rounded-full", st.av)}>{r.name[0]}</span>
                    {r.name}
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <div className={cx(s.reveal, "grid grid-cols-2 gap-6 min-[1000px]:grid-cols-4")}>
            {[
              ["Private by default", "Your debriefs live in your own account.", "bg-[#FDE3D8]", "#8F3519", <><rect key="a" x="4" y="11" width="16" height="10" rx="2" /><path key="b" d="M8 11V7a4 4 0 0 1 8 0v4" /></>],
              ["Delete anything", "Any debrief, or your whole account, any time.", "bg-[#ECE9FE]", "#4A3DC4", <path key="a" d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />],
              ["On your side", "No lectures. Not therapy, and never pretends to be.", "bg-[#D9F0E6]", "#1D6B51", <path key="a" d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />],
              ["Everywhere you are", "iPhone, Android and the web, all in sync.", "bg-[#FCEFD2]", "#8A5A00", <><rect key="a" x="7" y="2" width="10" height="20" rx="2" /><path key="b" d="M11 18h2" /></>],
            ].map(([title, body, bg, stroke, icon]) => (
              <div key={title as string} className="flex flex-col gap-3 min-[600px]:flex-row min-[600px]:items-start min-[600px]:gap-3.5">
                <span className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]", bg as string)}>
                  <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke as string} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                </span>
                <div className="flex flex-col gap-1">
                  <strong className="text-[16px]">{title}</strong>
                  <span className="text-[14px] leading-[1.5] text-[#57514B]">{body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="relative scroll-mt-24 overflow-hidden bg-[#FFF4EF] py-20 min-[900px]:py-[120px]">
        <svg className={cx(s.spin, "pointer-events-none absolute left-1/2 top-1/2 -ml-[450px] -mt-[450px]")} aria-hidden="true" width="900" height="900" viewBox="0 0 900 900">
          <circle cx="450" cy="450" r="330" fill="none" stroke="#F27A55" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="3 16" />
          <circle cx="450" cy="450" r="430" fill="none" stroke="#F27A55" strokeOpacity="0.14" strokeWidth="2" strokeDasharray="30 24" />
        </svg>
        <div className={cx(WRAP, "relative flex flex-col items-center gap-9")}>
          <div className={cx(s.reveal, "flex flex-col items-center gap-4 text-center")}>
            <div className={EYEBROW}>Pricing</div>
            <h2 className={H2}>One plan. Everything in.</h2>
          </div>
          <div role="group" aria-label="Billing period" className="inline-flex rounded-full bg-white p-[5px] shadow-[0_6px_18px_rgba(60,40,20,0.08)]">
            {[
              [true, `Yearly · save ${pricing.savingsPct}`],
              [false, "Monthly"],
            ].map(([val, label]) => (
              <button
                key={label as string}
                type="button"
                aria-pressed={yearly === val}
                onClick={() => setYearly(val as boolean)}
                className={cx("h-11 rounded-full px-5 font-display text-[15px] font-extrabold transition-colors", yearly === val ? "bg-[#1B1815] text-white" : "bg-transparent text-[#3F3A35]")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className={cx(s.reveal, "relative flex w-full max-w-[540px] flex-col gap-7 rounded-[32px] bg-white p-7 shadow-[0_40px_90px_rgba(185,71,42,0.18)] min-[900px]:p-11")}>
            <span className="absolute right-8 top-[-16px] rotate-[4deg] rounded-full bg-[#6D5EF0] px-3.5 py-2 text-[13px] font-extrabold text-white">7 days free</span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span key={String(yearly)} className={cx(s.pop, "text-[56px] font-extrabold tracking-[-0.04em] min-[900px]:text-[68px]")}>{yearly ? pricing.annual : pricing.monthly}</span>
                <span className="text-[18px] font-bold text-[#57514B]">{yearly ? "/ year" : "/ month"}</span>
              </div>
              <span className="text-[15px] font-semibold text-[#57514B]">
                {yearly ? `That’s ${pricing.annualPerMonth} a month, billed yearly.` : "Billed monthly. Switch to yearly any time."}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-3 text-[16px] font-bold">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D9F0E6]">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D6B51" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <a href={START_URL} onClick={startClick("pricing")} className={cx(s.cta, "flex h-[60px] items-center justify-center rounded-full bg-[#B9472A] text-[18px] font-extrabold text-white no-underline min-[900px]:h-[62px]")}>
              Start your free week
            </a>
            <p className="m-0 text-center text-[14px] leading-[1.6] text-[#57514B]">Nothing charged today. We remind you on day 4, and you can cancel any time before day 7 and pay nothing.</p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-24 py-20 min-[900px]:py-[120px]">
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 min-[900px]:gap-10 min-[900px]:px-10">
          <h2 className={cx(H2, s.reveal)}>Questions</h2>
          <div className="flex flex-col gap-3">
            {HOME_FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className={cx("rounded-[22px] transition-colors", isOpen ? "bg-[#1B1815] text-white" : "border border-[#EEE7DE] bg-white")}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    className={cx("flex min-h-[60px] w-full items-center justify-between gap-4 bg-transparent px-5 py-5 text-left font-display text-[17px] font-extrabold min-[900px]:px-7 min-[900px]:py-6 min-[900px]:text-[19px]", isOpen ? "text-white" : "text-[#1B1815]")}
                  >
                    {f.q}
                    <span aria-hidden="true" className={cx("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[22px]", isOpen ? "bg-[#F27A55] text-[#1B1815]" : "bg-[#F3EEE8] text-[#B9472A]")}>
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <p id={`faq-${i}`} className={cx(s.pop, "m-0 px-5 pb-6 text-[16px] leading-[1.6] text-[#CFC7BE] min-[900px]:pl-7 min-[900px]:pr-16 min-[900px]:text-[17px]")}>
                      {f.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="start" className="px-3 pb-20 min-[900px]:px-0 min-[900px]:pb-[120px]">
        <div className="mx-auto w-full max-w-[1200px] min-[900px]:px-10">
          <div className={cx(s.reveal, "relative flex flex-col items-center gap-6 overflow-hidden rounded-[30px] bg-[#F27A55] px-5 py-16 text-center min-[900px]:rounded-[40px] min-[900px]:px-10 min-[900px]:py-[104px]")}>
            <span className={s.bigring} />
            <span className={s.bigring} style={{ animationDelay: "1.5s" }} />
            <span className={s.bigring} style={{ animationDelay: "3s" }} />
            <h2 className="relative m-0 font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] text-[#1B1815] min-[900px]:text-[68px]">Put it down somewhere.</h2>
            <p className="relative m-0 max-w-[560px] text-[17px] font-semibold leading-[1.5] text-[#2B211C] min-[900px]:text-[21px]">Say what’s on your mind. Ripple keeps track of the rest.</p>
            <a href={START_URL} onClick={startClick("final")} className="relative inline-flex h-[60px] w-full items-center justify-center gap-2.5 rounded-full bg-[#1B1815] px-9 text-[18px] font-extrabold text-white no-underline shadow-[0_16px_40px_rgba(27,24,21,0.3)] transition-transform hover:-translate-y-0.5 min-[520px]:w-auto min-[900px]:h-16 min-[900px]:text-[19px]">
              Start your free week <Arrow />
            </a>
            <div className="relative">
              <StoreBadges height={54} where="final" />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#EEE7DE] pb-28 pt-10 min-[900px]:pb-14">
        <div className={cx(WRAP, "flex flex-wrap items-center justify-between gap-5")}>
          <div className="flex items-center gap-2.5">
            <Image src="/ripple-mark-coral-t.png" alt="" width={26} height={26} />
            <span className="text-[17px] font-extrabold">Ripple</span>
            <span className="text-[14px] font-semibold text-[#57514B]">Your AI life optimizer.</span>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
            {[
              ["Blog", "/blog"],
              ["Support", "/support"],
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
            ].map(([label, href]) => (
              <a key={label} href={href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#57514B] no-underline hover:text-[#1B1815]">
                {label}
              </a>
            ))}
          </nav>
          <span className="text-[13px] text-[#57514B]">
            © 2026 Ripple · <CookieSettingsLink className="hover:text-[#1B1815]" />
          </span>
        </div>
        <nav aria-label="Learn" className={cx(WRAP, "mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[#EEE7DE] pt-4")}>
          <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#57514B]">Learn</span>
          {LEARN_LINKS.map(([label, href]) => (
            <a key={href} href={href} className="inline-flex min-h-11 items-center text-[14px] font-semibold text-[#57514B] no-underline hover:text-[#1B1815]">
              {label}
            </a>
          ))}
        </nav>
      </footer>

      {/* Phone-only pinned CTA, appears once the hero button scrolls away */}
      <div
        aria-hidden={!showBar}
        className={cx(
          "fixed inset-x-3 bottom-3 z-[70] flex items-center gap-2.5 rounded-full bg-[#1B1815] py-2.5 pl-[18px] pr-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.25)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.3,1.2)] min-[900px]:hidden",
          showBar ? "translate-y-0" : "translate-y-[140%]",
        )}
      >
        <span className="flex-1 text-[13px] font-bold text-[#E8E1D9]">7 days free · nothing charged today</span>
        <a href={START_URL} tabIndex={showBar ? 0 : -1} onClick={startClick("sticky")} className="inline-flex h-11 items-center rounded-full bg-[#F27A55] px-[18px] text-[15px] font-extrabold text-[#1B1815] no-underline">
          Start free
        </a>
      </div>
    </div>
  );
}
