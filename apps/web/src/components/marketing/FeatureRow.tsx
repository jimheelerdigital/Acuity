/**
 * Alternating copy + phone feature row. Ported from the handoff
 * (`marketing.jsx → FeatureRow`). Reused ×3 (Home / Theme Map / Life
 * Matrix). The per-feature `accent` is a tokenized CSS color (e.g.
 * var(--acuity-primary)) — not the prototype's literal hue — so it stays
 * palette-reactive. `phone` is the pre-rendered PhoneFrame+screen.
 */
import type { ReactNode } from "react";

import { Reveal } from "@/components/landing-shared";

export function FeatureRow({
  eyebrow,
  title,
  body,
  points,
  accent,
  flip = false,
  phone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  /** CSS color for the eyebrow + bullet tiles, e.g. var(--acuity-primary). */
  accent: string;
  flip?: boolean;
  phone: ReactNode;
}) {
  const copy = (
    <Reveal>
      <div className="max-w-[460px]">
        <div
          className="mb-[18px] font-mono text-[12px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: accent }}
        >
          {eyebrow}
        </div>
        <h2 className="m-0 mb-[18px] font-display text-[38px] font-extrabold leading-[1.08] tracking-[-1px] text-acuity-text text-balance">
          {title}
        </h2>
        <p className="m-0 mb-6 font-sans text-[18px] leading-[1.55] text-acuity-text-sec text-pretty">
          {body}
        </p>
        <div className="flex flex-col gap-[13px]">
          {points.map((p) => (
            <div key={p} className="flex items-start gap-3">
              <div
                className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklch, ${accent}, #000 12%))` }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5 10 17l9-10" />
                </svg>
              </div>
              <span className="font-sans text-[16px] font-medium leading-[1.45] text-acuity-text">{p}</span>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );

  const phoneEl = (
    <Reveal delay={1}>
      <div className="flex justify-center">{phone}</div>
    </Reveal>
  );

  return (
    <section className="bg-acuity-bg px-7 py-16">
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-center gap-14 min-[900px]:grid-cols-2">
        {flip ? (
          <>
            {phoneEl}
            {copy}
          </>
        ) : (
          <>
            {copy}
            {phoneEl}
          </>
        )}
      </div>
    </section>
  );
}
