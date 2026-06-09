/**
 * "How Acuity works" — 3 numbered cards with gradient icon tiles.
 * Ported from the handoff (`marketing.jsx → HowItWorks`).
 *
 * Step accents are tokenized (primary / secondary / good) instead of the
 * prototype's literal hues, so they stay palette-reactive. Page chrome
 * uses the Tailwind acuity-* tokens (follows data-theme).
 */
import type { CSSProperties, ReactNode } from "react";

import { Reveal } from "@/components/landing-shared";

import { AcuityIcons } from "./screens/chrome";

interface Step {
  n: string;
  icon: "mic" | "sparkle" | "insights";
  title: string;
  body: string;
  iconBg: string;
  blob: string;
}

// TODO(copy): step copy is placeholder from the handoff — confirm with Keenan.
const STEPS: Step[] = [
  {
    n: "01",
    icon: "mic",
    title: "Record your day",
    body: "Tap once and talk for 60 seconds — any time, no prompts, no typing. Just your voice.",
    iconBg: "var(--acuity-grad-primary)",
    blob: "var(--acuity-primary)",
  },
  {
    n: "02",
    icon: "sparkle",
    title: "AI does the sorting",
    body: "Acuity transcribes and pulls out your tasks, goals, themes, and mood automatically.",
    iconBg: "var(--acuity-grad-secondary)",
    blob: "var(--acuity-secondary)",
  },
  {
    n: "03",
    icon: "insights",
    title: "See yourself clearly",
    body: "Every Sunday, a weekly report reveals the patterns quietly forming across your life.",
    iconBg: "linear-gradient(135deg, var(--acuity-good), color-mix(in oklch, var(--acuity-good), #000 14%))",
    blob: "var(--acuity-good)",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="bg-acuity-bg px-7 py-24">
      <div className="mx-auto max-w-[1180px]">
        <Reveal>
          <div className="mb-14 text-center">
            <div className="mb-[18px] font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-acuity-primary">
              How Acuity works
            </div>
            <h2 className="m-0 font-display text-[42px] font-extrabold tracking-[-1.2px] text-acuity-text">
              Three steps. Then it&rsquo;s automatic.
            </h2>
          </div>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i}>
              <Card step={s} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Card({ step }: { step: Step }) {
  const blobStyle: CSSProperties = {
    background: `radial-gradient(circle, color-mix(in oklch, ${step.blob}, transparent 84%) 0%, transparent 70%)`,
  };
  const icon: ReactNode = AcuityIcons[step.icon]({ color: "#fff", size: 26, weight: 1.9 });
  return (
    <div className="relative overflow-hidden rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg px-7 py-8 shadow-acuity-soft">
      <div className="pointer-events-none absolute -right-[30px] -top-[40px] h-[150px] w-[150px] rounded-full" style={blobStyle} />
      <div
        className="mb-[22px] flex h-[52px] w-[52px] items-center justify-center rounded-[16px]"
        style={{ background: step.iconBg, boxShadow: `0 6px 18px color-mix(in oklch, ${step.blob}, transparent 70%)` }}
      >
        {icon}
      </div>
      <div className="mb-2 font-mono text-[13px] font-semibold tracking-[1px] text-acuity-text-ter">{step.n}</div>
      <h3 className="m-0 mb-2.5 font-display text-[22px] font-bold tracking-[-0.5px] text-acuity-text">{step.title}</h3>
      <p className="m-0 font-sans text-[15.5px] leading-[1.55] text-acuity-text-sec text-pretty">{step.body}</p>
    </div>
  );
}
