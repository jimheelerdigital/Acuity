/**
 * Shared layout for the SEO landing pages (2026-10-21). A server component:
 * everything (FAQ included, via native <details>) renders in the HTML so it
 * is crawlable and works without JavaScript.
 *
 * Visual language mirrors the 2026-10 homepage (components/marketing/
 * home-v2): light #FBF8F4 ground, ink #1B1815, deep coral CTA #B9472A,
 * Manrope display type, 24–28px cards, uppercase coral eyebrows. The nav and
 * footer are copied here rather than imported because HomeV2 is a client
 * component that owns its own analytics.
 *
 * No highlight / marker bars behind text (Keenan, 2026-10-21): emphasis is
 * weight or coral text colour only.
 */
import Image from "next/image";
import { Fragment } from "react";

import { CookieSettingsLink } from "@/components/cookie-consent";
import { HOME_REVIEWS } from "@/components/marketing/home-v2/content";
import s from "@/components/marketing/home-v2/home-v2.module.css";
import { displayAnnual, displayAnnualAsMonthly, displayMonthly, displaySavingsPct } from "@/lib/pricing";

import { RELATED_PAGES, buildJsonLd } from "./meta";
import type { SectionKey, SeoLandingContent } from "./types";
import { TONES, VisualBlock, cx } from "./visuals";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.heelerdigital.acuity";
const START_URL = "/start";
const LOGIN_URL = "https://app.goripple.io/auth/signin";

const EYEBROW = "text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#B9472A]";
const H2 = "m-0 font-display text-[34px] font-extrabold leading-[1.06] tracking-[-0.035em] min-[900px]:text-[52px]";
const WRAP = "mx-auto w-full max-w-[1200px] px-4 min-[900px]:px-10";
const TRIAL_LINE = "7-day free trial · Nothing charged today · Cancel anytime";

const DEFAULT_ORDER: SectionKey[] = ["how", "benefits", "example", "explainer", "compare", "reviews", "pricing", "faq", "related"];

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

function CheckCircle() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#D9F0E6]">
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1D6B51" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </span>
  );
}

export function StoreBadges({ height = 48 }: { height?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className={cx(s.lift, "block rounded-[10px]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/apple-app-store.svg" alt="Download Ripple on the App Store" width={120} height={40} style={{ height, width: "auto" }} />
      </a>
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className={cx(s.lift, "block rounded-[10px]")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badges/google-play.svg" alt="Get Ripple on Google Play" width={135} height={40} style={{ height, width: "auto" }} />
      </a>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky z-[60] border-b border-[#EEE7DE] bg-[rgba(251,248,244,0.9)] backdrop-blur-[14px]" style={{ top: "var(--install-banner-h, 0px)" }}>
      <div className={cx(WRAP, "flex h-16 items-center justify-between gap-3 min-[900px]:h-[72px]")}>
        <a href="/" className="flex min-h-11 items-center gap-2.5 text-[#1B1815] no-underline">
          <Image src="/ripple-mark-coral-t.png" alt="" width={32} height={32} priority />
          <span className="text-[21px] font-extrabold tracking-[-0.02em]">Ripple</span>
        </a>
        <nav aria-label="Main" className="hidden items-center gap-8 min-[900px]:flex">
          {[
            ["How it works", "/#how"],
            ["Pricing", "/#pricing"],
            ["Blog", "/blog"],
          ].map(([label, href]) => (
            <a key={label} href={href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-[#3F3A35] no-underline hover:text-[#1B1815]">
              {label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2 min-[900px]:gap-[18px]">
          <a href={LOGIN_URL} className="inline-flex h-11 items-center px-1 text-[15px] font-semibold text-[#1B1815] no-underline">
            Log in
          </a>
          <a href={START_URL} className="inline-flex h-11 items-center whitespace-nowrap rounded-full bg-[#1B1815] px-4 text-[15px] font-bold text-white no-underline min-[400px]:px-5">
            Start free week
          </a>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#EEE7DE] pb-14 pt-10">
      <div className={cx(WRAP, "flex flex-wrap items-center justify-between gap-5")}>
        <div className="flex flex-wrap items-center gap-2.5">
          <Image src="/ripple-mark-coral-t.png" alt="" width={26} height={26} />
          <span className="text-[17px] font-extrabold">Ripple</span>
          <span className="text-[14px] font-semibold text-[#57514B]">Your AI life optimizer.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
          {[
            ["Home", "/"],
            ["Voice journaling", "/voice-journaling"],
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
    </footer>
  );
}

const HERO_ITEM = {
  todo: { box: "border border-[#EEE7DE] bg-white", label: "text-[#57514B]" },
  mood: { box: "bg-[#FDE3D8]", label: "text-[#8F3519]" },
  habit: { box: "bg-[#D9F0E6]", label: "text-[#1D6B51]" },
  pattern: { box: "bg-[#6D5EF0] text-white", label: "text-white" },
};

function Hero({ c }: { c: SeoLandingContent }) {
  const h = c.hero;
  return (
    <section className="relative overflow-hidden pb-16 pt-6 min-[900px]:pb-24 min-[900px]:pt-10">
      <div aria-hidden="true" className="absolute right-[-160px] top-[-120px] h-[380px] w-[380px] rounded-full bg-[#FDE6DC] min-[900px]:right-[-180px] min-[900px]:top-[-140px] min-[900px]:h-[700px] min-[900px]:w-[700px]" />
      <svg className={cx(s.spin, "pointer-events-none absolute right-[-290px] top-[-250px]")} aria-hidden="true" width="980" height="980" viewBox="0 0 980 980">
        <circle cx="490" cy="490" r="300" fill="none" stroke="#F27A55" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="4 14" />
        <circle cx="490" cy="490" r="400" fill="none" stroke="#F27A55" strokeOpacity="0.16" strokeWidth="2" strokeDasharray="2 18" />
        <circle cx="490" cy="490" r="480" fill="none" stroke="#6D5EF0" strokeOpacity="0.12" strokeWidth="2" strokeDasharray="40 30" />
      </svg>

      <div className={cx(WRAP, "relative flex flex-col gap-6")}>
        <nav aria-label="Breadcrumb" className="text-[14px] font-semibold text-[#57514B]">
          <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
            <li>
              <a href="/" className="inline-flex min-h-11 items-center text-[#57514B] underline-offset-4 hover:underline">
                Home
              </a>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[#1B1815]">
              {c.crumb}
            </li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 items-center gap-10 min-[900px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-[900px]:gap-[64px]">
          <div className="flex min-w-0 flex-col gap-6">
            <div className={cx(s.pop, EYEBROW)}>{h.eyebrow}</div>
            <h1 className={cx(s.pop, "m-0 text-[40px] font-extrabold leading-[1.05] tracking-[-0.04em] min-[900px]:text-[68px]")} style={{ animationDelay: "80ms" }}>
              {h.h1}
              {h.h1Accent && (
                <>
                  {" "}
                  <span className="text-[#B9472A]">{h.h1Accent}</span>
                </>
              )}
            </h1>
            {h.intro.map((p, i) => (
              <p key={i} className={cx(s.pop, "m-0 max-w-[580px] leading-[1.6] text-[#4A443E]", i === 0 ? "text-[18px] min-[900px]:text-[20px]" : "text-[16px] min-[900px]:text-[17px]")} style={{ animationDelay: `${160 + i * 40}ms` }}>
                {p}
              </p>
            ))}
            <div className={cx(s.pop, "flex flex-wrap items-center gap-5")} style={{ animationDelay: "240ms" }}>
              <a href={START_URL} className={cx(s.cta, "inline-flex h-[60px] w-full items-center justify-center gap-2.5 rounded-full bg-[#B9472A] px-8 text-[18px] font-extrabold text-white no-underline min-[520px]:w-auto")}>
                Start your free week <Arrow />
              </a>
              <a href="#how" className="hidden min-h-11 items-center text-[16px] font-bold text-[#1B1815] min-[520px]:inline-flex">
                See how it works
              </a>
            </div>
            <div className={cx(s.pop, "text-[14px] font-bold text-[#57514B]")} style={{ animationDelay: "280ms" }}>
              {TRIAL_LINE}
            </div>
            <div className={s.pop} style={{ animationDelay: "320ms" }}>
              <StoreBadges height={48} />
            </div>
          </div>

          <div className="relative min-w-0">
            <div className={cx(s.floatB, "absolute right-[-6px] top-[-22px] z-[3] hidden rounded-[14px] bg-[#F2B544] px-3.5 py-2.5 text-[14px] font-extrabold shadow-[0_14px_34px_rgba(242,181,68,0.35)] min-[600px]:block")}>
              {h.chips[0]}
            </div>
            <div className={cx(s.pop, "relative z-[2] flex flex-col gap-4 rounded-[28px] border border-[#EEE7DE] bg-white p-5 shadow-[0_40px_90px_rgba(60,40,20,0.16)] min-[900px]:p-7")} style={{ animationDelay: "200ms" }}>
              <div className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">{h.card.label}</div>
              <div className="flex flex-col gap-3 rounded-[20px] bg-[#FBF8F4] p-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0">
                    <span className={s.ring} />
                    <span className={s.ring} style={{ animationDelay: "1.2s" }} />
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#F27A55]">
                      <MicIcon size={16} />
                    </div>
                  </div>
                  <span className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">You said</span>
                </div>
                <p className="m-0 text-[16px] font-medium leading-[1.55] text-[#1B1815]">“{h.card.said}”</p>
              </div>
              <div className="flex items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#B9472A]">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
                Ripple caught
              </div>
              <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
                {h.card.items.map((it, i) => (
                  <div
                    key={it.label + it.value}
                    className={cx(s.pop, "flex flex-col gap-1 rounded-2xl px-4 py-3", HERO_ITEM[it.tone].box, (it.tone === "pattern" || it.tone === "todo") && "min-[420px]:col-span-2")}
                    style={{ animationDelay: `${400 + i * 140}ms` }}
                  >
                    <span className={cx("text-[12px] font-extrabold uppercase tracking-[0.08em]", HERO_ITEM[it.tone].label)}>{it.label}</span>
                    <span className="text-[15px] font-bold leading-[1.45]">{it.value}</span>
                  </div>
                ))}
              </div>
              <div className="text-[12px] font-semibold text-[#57514B]">Example debrief</div>
            </div>
          </div>
        </div>

        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0" aria-label="What Ripple keeps track of">
          {h.chips.slice(1).map((chip, i) => (
            <li key={chip} className={cx("rounded-full px-4 py-2 text-[14px] font-extrabold", ["bg-[#1B1815] text-white", "bg-[#ECE9FE] text-[#4A3DC4]", "bg-[#D9F0E6] text-[#1D6B51]", "bg-[#FDE3D8] text-[#8F3519]"][i % 4])}>
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function How({ c }: { c: SeoLandingContent }) {
  const bgs = ["bg-[#FFF4EF]", "bg-[#F2F0FF]", "bg-[#EAF7F1]"];
  const stepCls = ["text-[#B9472A]", "text-[#4A3DC4]", "text-[#1D6B51]"];
  return (
    <section id="how" className="scroll-mt-24 border-y border-[#EEE7DE] bg-white py-20 min-[900px]:py-28">
      <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-14")}>
        <div className={cx(s.reveal, "flex max-w-[760px] flex-col gap-4")}>
          <div className={EYEBROW}>{c.how.eyebrow}</div>
          <h2 className={H2}>{c.how.title}</h2>
        </div>
        <ol className="m-0 grid list-none grid-cols-1 gap-5 p-0 min-[900px]:grid-cols-3">
          {c.how.steps.map((st, i) => (
            <li key={st.title} className={cx(s.reveal, s.lift, "flex flex-col gap-4 rounded-[28px] p-7 min-[900px]:p-8", bgs[i])}>
              {i === 0 ? (
                <div className="relative h-[64px] w-[64px]">
                  <span className={s.ring} />
                  <div className="relative flex h-[64px] w-[64px] items-center justify-center rounded-full bg-[#F27A55]">
                    <MicIcon size={28} />
                  </div>
                </div>
              ) : i === 1 ? (
                <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[20px] bg-[#6D5EF0]">
                  <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h16M4 12h10M4 18h6" />
                    <path d="M17 15l2 2 3-4" />
                  </svg>
                </div>
              ) : (
                <div className="flex h-[64px] w-[64px] items-end justify-center gap-1.5 rounded-[20px] bg-[#2E9C78] pb-4">
                  <span className="h-[16px] w-2 rounded bg-white" />
                  <span className="h-6 w-2 rounded bg-white" />
                  <span className="h-8 w-2 rounded bg-white" />
                </div>
              )}
              <span className={cx("text-[14px] font-extrabold tracking-[0.1em]", stepCls[i])}>STEP {i + 1}</span>
              <h3 className="m-0 text-[24px] font-extrabold tracking-[-0.02em] min-[900px]:text-[26px]">{st.title}</h3>
              <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E]">{st.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Benefits({ c }: { c: SeoLandingContent }) {
  const b = c.benefits;
  return (
    <section id="what" className="scroll-mt-24 py-20 min-[900px]:py-28">
      <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-12")}>
        <div className={cx(s.reveal, "flex max-w-[780px] flex-col gap-4")}>
          <div className={EYEBROW}>{b.eyebrow}</div>
          <h2 className={H2}>{b.title}</h2>
          {b.intro && <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E] min-[900px]:text-[19px]">{b.intro}</p>}
        </div>
        <div className="grid grid-cols-1 gap-5 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {b.cards.map((card) => {
            const t = TONES[card.tone];
            return (
              <article key={card.title} className={cx(s.reveal, s.lift, "flex min-w-0 flex-col gap-6 rounded-[28px] p-6 min-[900px]:p-8", t.card, card.wide && "min-[700px]:col-span-2")}>
                <div className="flex flex-col gap-2">
                  <h3 className="m-0 text-[22px] font-extrabold tracking-[-0.02em] min-[900px]:text-[24px]">{card.title}</h3>
                  <p className={cx("m-0 text-[16px] leading-[1.6]", t.body)}>{card.body}</p>
                </div>
                {card.visual && (
                  <div className="mt-auto">
                    <VisualBlock v={card.visual} dark={t.dark} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Example({ c }: { c: SeoLandingContent }) {
  const e = c.example;
  return (
    <section className="relative overflow-hidden bg-[#1B1815] py-20 text-white min-[900px]:py-28">
      <div aria-hidden="true" className="absolute bottom-[-260px] left-[-200px] h-[620px] w-[620px] rounded-full bg-[#2A2420]" />
      <div className={cx(WRAP, "relative flex flex-col gap-10 min-[900px]:gap-14")}>
        <div className={cx(s.reveal, "flex max-w-[780px] flex-col gap-4")}>
          <div className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-[#F7A386]">{e.eyebrow}</div>
          <h2 className={cx(H2, "text-white")}>{e.title}</h2>
          {e.intro && <p className="m-0 text-[17px] leading-[1.6] text-[#CFC7BE] min-[900px]:text-[19px]">{e.intro}</p>}
        </div>
        <div className={cx("grid grid-cols-1 gap-6", e.examples.length > 1 && "min-[1000px]:grid-cols-2")}>
          {e.examples.map((ex) => (
            <article key={ex.label} className={cx(s.reveal, "flex min-w-0 flex-col gap-5 rounded-[28px] border border-[#3A342E] bg-[#26221E] p-5 min-[900px]:p-7")}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-[20px] font-extrabold">{ex.label}</h3>
                <span className="text-[13px] font-semibold text-[#ADA49A]">Example</span>
              </div>
              <div className="flex flex-col gap-2 rounded-[20px] bg-[#FBF8F4] p-4 text-[#1B1815]">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#B9472A]">What you said</span>
                <p className="m-0 text-[16px] font-medium leading-[1.6]">“{ex.said}”</p>
              </div>
              <div className="flex items-center gap-2.5 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#F7A386]">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M6 13l6 6 6-6" />
                </svg>
                What Ripple caught
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2.5 rounded-2xl bg-white px-4 py-3.5 text-[#1B1815]">
                  <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">To-do</span>
                  {ex.tasks.map((t) => (
                    <div key={t.text} className="flex items-center gap-2.5 text-[15px] font-semibold">
                      <span className="h-[18px] w-[18px] shrink-0 rounded-md border-2 border-[#D8CDBF]" />
                      <span className="min-w-0 flex-1">{t.text}</span>
                      {t.when && <span className="whitespace-nowrap rounded-full bg-[#FDE3D8] px-2.5 py-0.5 text-[12px] font-extrabold text-[#8F3519]">{t.when}</span>}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                  <div className="flex flex-col gap-1 rounded-2xl bg-[#FDE3D8] px-4 py-3 text-[#1B1815]">
                    <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#8F3519]">Mood</span>
                    <span className="text-[15px] font-bold">{ex.mood}</span>
                  </div>
                  {ex.habits && ex.habits.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-2xl bg-[#D9F0E6] px-4 py-3 text-[#1B1815]">
                      <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#1D6B51]">Habits</span>
                      {ex.habits.map((h) => (
                        <span key={h} className="text-[15px] font-bold">{h}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-[#6D5EF0] px-4 py-3 text-white">
                  <span className="text-[12px] font-extrabold uppercase tracking-[0.08em]">Keeps coming up</span>
                  <span className="text-[15px] font-bold leading-[1.45]">{ex.pattern}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Explainer({ c }: { c: SeoLandingContent }) {
  const x = c.explainer;
  if (!x) return null;
  return (
    <section className="py-20 min-[900px]:py-28">
      <div className={cx(WRAP, "grid grid-cols-1 gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1000px]:gap-16")}>
        <div className={cx(s.reveal, "flex flex-col gap-5")}>
          <div className={EYEBROW}>{x.eyebrow}</div>
          <h2 className={H2}>{x.title}</h2>
          {x.paragraphs.map((p, i) => (
            <p key={i} className="m-0 text-[17px] leading-[1.7] text-[#3F3A35] min-[900px]:text-[18px]">
              {p}
            </p>
          ))}
        </div>
        {x.points && (
          <ul className="m-0 flex list-none flex-col gap-4 p-0 min-[1000px]:pt-10">
            {x.points.map((pt, i) => (
              <li key={pt.title} className={cx(s.reveal, "flex gap-4 rounded-[24px] border border-[#EEE7DE] bg-white p-5 min-[900px]:p-6")}>
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-[16px] font-extrabold", ["bg-[#FDE3D8] text-[#8F3519]", "bg-[#ECE9FE] text-[#4A3DC4]", "bg-[#D9F0E6] text-[#1D6B51]", "bg-[#FCEFD2] text-[#8A5A00]"][i % 4])}>
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="m-0 text-[18px] font-extrabold">{pt.title}</h3>
                  <p className="m-0 text-[16px] leading-[1.6] text-[#4A443E]">{pt.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Compare({ c }: { c: SeoLandingContent }) {
  const k = c.compare;
  if (!k) return null;
  return (
    <section className="border-y border-[#EEE7DE] bg-white py-20 min-[900px]:py-28">
      <div className={cx(WRAP, "flex flex-col gap-10")}>
        <div className={cx(s.reveal, "flex max-w-[780px] flex-col gap-4")}>
          <div className={EYEBROW}>{k.eyebrow}</div>
          <h2 className={H2}>{k.title}</h2>
          {k.intro && <p className="m-0 text-[17px] leading-[1.6] text-[#4A443E] min-[900px]:text-[19px]">{k.intro}</p>}
        </div>
        <div className={cx(s.reveal, "overflow-hidden rounded-[28px] border border-[#EEE7DE]")}>
          <div className="hidden grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)] bg-[#FBF8F4] min-[800px]:grid">
            <div className="px-6 py-4 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">&nbsp;</div>
            <div className="px-6 py-4 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">{k.headers[0]}</div>
            <div className="bg-[#1B1815] px-6 py-4 text-[13px] font-extrabold uppercase tracking-[0.08em] text-[#F7A386]">{k.headers[1]}</div>
          </div>
          {k.rows.map((r, i) => (
            <div key={r.label} className={cx("grid grid-cols-1 min-[800px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)]", i > 0 && "border-t border-[#EEE7DE]")}>
              <div className="px-5 pt-5 text-[17px] font-extrabold min-[800px]:px-6 min-[800px]:py-5">{r.label}</div>
              <div className="flex flex-col gap-1 px-5 py-3 text-[16px] leading-[1.55] text-[#4A443E] min-[800px]:px-6 min-[800px]:py-5">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#57514B] min-[800px]:hidden">{k.headers[0]}</span>
                {r.other}
              </div>
              <div className="mx-3 mb-4 flex flex-col gap-1 rounded-[18px] bg-[#1B1815] px-4 py-3 text-[16px] font-semibold leading-[1.55] text-white min-[800px]:m-0 min-[800px]:rounded-none min-[800px]:px-6 min-[800px]:py-5">
                <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#F7A386] min-[800px]:hidden">{k.headers[1]}</span>
                {r.ripple}
              </div>
            </div>
          ))}
        </div>
        {k.note && <p className={cx(s.reveal, "m-0 max-w-[800px] text-[16px] leading-[1.6] text-[#57514B]")}>{k.note}</p>}
      </div>
    </section>
  );
}

const REVIEW_STYLE = [
  { card: "border border-[#EEE7DE] bg-white", tilt: s.tiltL, star: "#E0952B", cap: "text-[#57514B]", av: "bg-[#F27A55] text-[#1B1815]" },
  { card: "bg-[#1B1815] text-white", tilt: "", star: "#F2B544", cap: "text-[#CFC7BE]", av: "bg-[#6D5EF0] text-white" },
  { card: "border border-[#EEE7DE] bg-white", tilt: s.tiltR, star: "#E0952B", cap: "text-[#57514B]", av: "bg-[#2E9C78] text-white" },
];

function Reviews({ c }: { c: SeoLandingContent }) {
  return (
    <section className="py-20 min-[900px]:py-28">
      <div className={cx(WRAP, "flex flex-col gap-10 min-[900px]:gap-14")}>
        <div className={cx(s.reveal, "flex max-w-[800px] flex-col gap-4")}>
          <div className={EYEBROW}>In their words</div>
          <h2 className={H2}>{c.reviewsTitle}</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
          {HOME_REVIEWS.map((r, i) => {
            const st = REVIEW_STYLE[i % REVIEW_STYLE.length];
            return (
              <figure key={r.name} className={cx(s.reveal, st.tilt, "m-0 flex flex-col justify-between gap-7 rounded-[28px] p-7 shadow-[0_20px_40px_rgba(60,40,20,0.07)] min-[900px]:p-8", st.card)}>
                <blockquote className="m-0 flex flex-col gap-4">
                  <Stars color={st.star} />
                  <p className="m-0 text-[19px] font-bold leading-[1.5]">“{r.quote.replace(/^“|”$/g, "")}”</p>
                </blockquote>
                <figcaption className={cx("flex items-center gap-2.5 text-[14px] font-extrabold", st.cap)}>
                  <span aria-hidden="true" className={cx("flex h-9 w-9 items-center justify-center rounded-full", st.av)}>
                    {r.name[0]}
                  </span>
                  {r.name}
                </figcaption>
              </figure>
            );
          })}
        </div>
        <div className="inline-flex items-center gap-2.5 self-start rounded-full border border-[#EEE7DE] bg-white px-4 py-2.5">
          <Stars />
          <span className="text-[14px] font-semibold text-[#57514B]">on the App Store</span>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const features = [
    "Unlimited debriefs, voice or typed",
    "Your to-do list, habits and mood",
    "Patterns and Life Matrix",
    "Your weekly report every Sunday",
    "iPhone, Android and web",
  ];
  return (
    <section id="pricing" className="relative scroll-mt-24 overflow-hidden bg-[#FFF4EF] py-20 min-[900px]:py-28">
      <svg className={cx(s.spin, "pointer-events-none absolute left-1/2 top-1/2 -ml-[450px] -mt-[450px]")} aria-hidden="true" width="900" height="900" viewBox="0 0 900 900">
        <circle cx="450" cy="450" r="330" fill="none" stroke="#F27A55" strokeOpacity="0.22" strokeWidth="2" strokeDasharray="3 16" />
        <circle cx="450" cy="450" r="430" fill="none" stroke="#F27A55" strokeOpacity="0.14" strokeWidth="2" strokeDasharray="30 24" />
      </svg>
      <div className={cx(WRAP, "relative flex flex-col items-center gap-9")}>
        <div className={cx(s.reveal, "flex flex-col items-center gap-4 text-center")}>
          <div className={EYEBROW}>Pricing</div>
          <h2 className={H2}>One plan. Everything in.</h2>
        </div>
        <div className={cx(s.reveal, "relative flex w-full max-w-[560px] flex-col gap-7 rounded-[32px] bg-white p-6 shadow-[0_40px_90px_rgba(185,71,42,0.18)] min-[900px]:p-10")}>
          <span className="absolute right-6 top-[-16px] rotate-[4deg] rounded-full bg-[#6D5EF0] px-3.5 py-2 text-[13px] font-extrabold text-white">7 days free</span>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-[20px] border-2 border-[#1B1815] p-4">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#B9472A]">Yearly · save {displaySavingsPct()}</span>
              <span className="text-[36px] font-extrabold tracking-[-0.04em]">{displayAnnual()}</span>
              <span className="text-[14px] font-semibold text-[#57514B]">That’s {displayAnnualAsMonthly()} a month, billed yearly.</span>
            </div>
            <div className="flex flex-col gap-1 rounded-[20px] border border-[#EEE7DE] p-4">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.08em] text-[#57514B]">Monthly</span>
              <span className="text-[36px] font-extrabold tracking-[-0.04em]">{displayMonthly()}</span>
              <span className="text-[14px] font-semibold text-[#57514B]">Billed monthly. Switch any time.</span>
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {features.map((f) => (
              <li key={f} className="flex items-center gap-3 text-[16px] font-bold">
                <CheckCircle />
                {f}
              </li>
            ))}
          </ul>
          <a href={START_URL} className={cx(s.cta, "flex h-[60px] items-center justify-center gap-2.5 rounded-full bg-[#B9472A] text-[18px] font-extrabold text-white no-underline")}>
            Start your free week <Arrow />
          </a>
          <p className="m-0 text-center text-[14px] font-semibold leading-[1.6] text-[#57514B]">{TRIAL_LINE}</p>
          <p className="m-0 text-center text-[14px] leading-[1.6] text-[#57514B]">We remind you on day 4. Cancel any time before day 7 and you pay nothing.</p>
        </div>
      </div>
    </section>
  );
}

function Faq({ c }: { c: SeoLandingContent }) {
  return (
    <section id="faq" className="scroll-mt-24 py-20 min-[900px]:py-28">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 min-[900px]:gap-10 min-[900px]:px-10">
        <div className={cx(s.reveal, "flex flex-col gap-4")}>
          <div className={EYEBROW}>FAQ</div>
          <h2 className={H2}>Questions people ask</h2>
        </div>
        <div className="flex flex-col gap-3">
          {c.faqs.map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-[22px] border border-[#EEE7DE] bg-white open:border-[#1B1815] open:bg-[#1B1815] open:text-white">
              <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 text-[17px] font-extrabold min-[900px]:px-7 min-[900px]:text-[19px] [&::-webkit-details-marker]:hidden">
                <h3 className="m-0 text-[inherit] font-extrabold">{f.q}</h3>
                <span aria-hidden="true" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#F3EEE8] text-[22px] text-[#B9472A] transition-transform group-open:rotate-45 group-open:bg-[#F27A55] group-open:text-[#1B1815]">
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-6 text-[16px] leading-[1.65] text-[#CFC7BE] min-[900px]:pl-7 min-[900px]:pr-16 min-[900px]:text-[17px]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Related({ c }: { c: SeoLandingContent }) {
  const items = RELATED_PAGES.filter((p) => p.slug !== c.slug);
  return (
    <section className="border-t border-[#EEE7DE] bg-white py-20 min-[900px]:py-24">
      <div className={cx(WRAP, "flex flex-col gap-8")}>
        <div className="flex flex-col gap-3">
          <div className={EYEBROW}>Related</div>
          <h2 className="m-0 text-[28px] font-extrabold tracking-[-0.03em] min-[900px]:text-[36px]">Keep reading</h2>
        </div>
        <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3">
          {items.map((p) => (
            <li key={p.href}>
              <a href={p.href} className={cx(s.lift, "flex h-full min-h-11 flex-col gap-2 rounded-[24px] border border-[#EEE7DE] bg-[#FBF8F4] p-6 text-[#1B1815] no-underline")}>
                <span className="flex items-center justify-between gap-3 text-[19px] font-extrabold">
                  {p.title}
                  <span className="text-[#B9472A]">
                    <Arrow />
                  </span>
                </span>
                <span className="text-[15px] leading-[1.55] text-[#57514B]">{p.blurb}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta({ c }: { c: SeoLandingContent }) {
  return (
    <section className="px-3 py-20 min-[900px]:px-0 min-[900px]:py-[110px]">
      <div className="mx-auto w-full max-w-[1200px] min-[900px]:px-10">
        <div className={cx(s.reveal, "relative flex flex-col items-center gap-6 overflow-hidden rounded-[30px] bg-[#F27A55] px-5 py-16 text-center min-[900px]:rounded-[40px] min-[900px]:px-10 min-[900px]:py-[96px]")}>
          <span className={s.bigring} />
          <span className={s.bigring} style={{ animationDelay: "1.5s" }} />
          <span className={s.bigring} style={{ animationDelay: "3s" }} />
          <h2 className="relative m-0 max-w-[900px] font-display text-[36px] font-extrabold leading-[1.04] tracking-[-0.04em] text-[#1B1815] min-[900px]:text-[60px]">{c.finalCta.title}</h2>
          <p className="relative m-0 max-w-[600px] text-[17px] font-semibold leading-[1.5] text-[#2B211C] min-[900px]:text-[20px]">{c.finalCta.body}</p>
          <a href={START_URL} className="relative inline-flex h-[60px] w-full items-center justify-center gap-2.5 rounded-full bg-[#1B1815] px-9 text-[18px] font-extrabold text-white no-underline shadow-[0_16px_40px_rgba(27,24,21,0.3)] transition-transform hover:-translate-y-0.5 min-[520px]:w-auto">
            Start your free week <Arrow />
          </a>
          <p className="relative m-0 text-[14px] font-bold text-[#2B211C]">{TRIAL_LINE}</p>
          <div className="relative">
            <StoreBadges height={50} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function SeoLanding({ content }: { content: SeoLandingContent }) {
  const order = content.order ?? DEFAULT_ORDER;
  const sections: Record<SectionKey, () => JSX.Element | null> = {
    how: () => <How c={content} />,
    benefits: () => <Benefits c={content} />,
    example: () => <Example c={content} />,
    explainer: () => <Explainer c={content} />,
    compare: () => <Compare c={content} />,
    reviews: () => <Reviews c={content} />,
    pricing: () => <Pricing />,
    faq: () => <Faq c={content} />,
    related: () => <Related c={content} />,
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FBF8F4] font-display text-[#1B1815]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(content)) }} />
      <Nav />
      <main>
        <Hero c={content} />
        {order.map((k) => (
          <Fragment key={k}>{sections[k]()}</Fragment>
        ))}
        <FinalCta c={content} />
      </main>
      <Footer />
    </div>
  );
}
