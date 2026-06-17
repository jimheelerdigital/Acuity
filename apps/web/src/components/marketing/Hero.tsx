/**
 * Marketing hero — gradient headline, step-flow dual phone layout.
 * Step 1 (Record) on the left with animated orb + waveform,
 * Step 2 (Your dashboard) on the right showing the Home screen.
 * A connecting arrow between them reinforces the input→output flow.
 */
import { makeAcuityTokens } from "@acuity/shared";

import { GradientText } from "@/components/acuity";
import { Reveal } from "@/components/landing-shared";

import { PhoneFrame } from "./PhoneFrame";
import { HomeDashboard } from "./screens/home";
import { RecordingScreen } from "./screens/recording";

export function Hero() {
  const tDark = makeAcuityTokens({ dark: true, accent: "coral" });

  return (
    <section id="top" className="relative overflow-hidden bg-acuity-hero-grad">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-10 px-7 pb-[90px] pt-[72px] min-[900px]:grid-cols-[1.06fr_0.94fr]">
        {/* copy */}
        <Reveal>
          <div>
            {/* Real App Store rating (5.0 from 4 reviews, 2026-06-09). */}
            <div
              className="mb-[22px] inline-flex items-center gap-2.5 rounded-full border border-acuity-line-strong py-[7px] pl-2 pr-[14px] shadow-acuity-soft"
              style={{ background: "color-mix(in oklch, var(--acuity-bg), transparent 30%)" }}
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-acuity-grad-mix-soft px-[9px] py-[3px]">
                <Stars />
              </span>
              <span className="font-sans text-[13px] font-semibold text-acuity-text-sec">
                5.0 · on the App Store
              </span>
            </div>

            <h1 className="m-0 mb-[22px] font-display text-[40px] font-extrabold leading-[1.02] tracking-[-1.4px] text-acuity-text text-balance min-[900px]:text-[60px] min-[900px]:tracking-[-2px]">
              One minute a day.
              <br />
              <GradientText variant="mix">A life of clarity.</GradientText>
            </h1>

            <p className="m-0 mb-8 max-w-[480px] font-sans text-[19px] leading-[1.55] text-acuity-text-sec text-pretty">
              Acuity is the voice journal that listens. Talk through your day — it catches your
              tasks, tracks your goals, and surfaces the patterns you can&rsquo;t see on your own.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/start"
                className="inline-flex items-center gap-2.5 rounded-acuity-pill border-[0.5px] border-white/25 bg-acuity-grad-primary px-[26px] py-[15px] font-sans text-[16px] font-bold tracking-[-0.2px] text-white shadow-acuity-glow-primary transition-transform hover:-translate-y-0.5"
              >
                Start free trial
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
              <a
                href="#how"
                className="inline-flex items-center gap-2.5 rounded-acuity-pill border-[0.5px] border-acuity-line-strong px-[26px] py-[15px] font-sans text-[16px] font-bold tracking-[-0.2px] text-acuity-text shadow-acuity-soft transition-transform hover:-translate-y-0.5"
                style={{ background: "color-mix(in oklch, var(--acuity-bg), transparent 30%)" }}
              >
                See how it works
              </a>
            </div>
            <div className="mt-[18px] font-sans text-[14px] text-acuity-text-ter">
              No credit card · 7-day free trial · iPhone
            </div>
          </div>
        </Reveal>

        {/* step-flow phones */}
        <Reveal delay={1}>
          <div className="relative flex flex-col items-center gap-6">
            {/* Phones + connector */}
            <div className="relative flex items-end justify-center gap-4 min-[900px]:gap-5">
              {/* Step 1 — Recording phone */}
              <div className="acuity-float hidden min-[900px]:block" style={{ animationDuration: "6.2s", animationDelay: "0.6s" }}>
                <PhoneFrame t={tDark} scale={0.50}>
                  <RecordingScreen t={tDark} />
                </PhoneFrame>
              </div>

              {/* Connector arrow — desktop only */}
              <div className="hidden min-[900px]:flex items-center self-center -mx-1">
                <svg width="44" height="24" viewBox="0 0 44 24" fill="none" className="text-acuity-text-ter">
                  <path d="M2 12h32M28 6l8 6-8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
                </svg>
              </div>

              {/* Step 2 — Home dashboard phone */}
              <div className="acuity-float" style={{ animationDuration: "5.6s", animationDelay: "0s" }}>
                <PhoneFrame t={tDark} scale={0.58}>
                  <HomeDashboard t={tDark} />
                </PhoneFrame>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Stars() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={12} height={12} viewBox="0 0 24 24" className="fill-acuity-primary">
          <path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 23l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" transform="scale(0.96) translate(0.5 -0.5)" />
        </svg>
      ))}
    </span>
  );
}
