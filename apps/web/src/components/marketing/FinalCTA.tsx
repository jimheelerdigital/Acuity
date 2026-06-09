/**
 * Final CTA — full-bleed gradient band. Ported from the handoff
 * (`marketing.jsx → FinalCTA`). Gradient built from acuity-* CSS vars
 * (palette-reactive); white CTA on top.
 */
import { Reveal } from "@/components/landing-shared";

export function FinalCTA() {
  return (
    <section id="start" className="bg-acuity-bg px-7 pb-24 pt-10">
      <Reveal>
        <div
          className="relative mx-auto max-w-[1080px] overflow-hidden rounded-acuity-xl px-10 py-[72px] text-center shadow-acuity-glow-primary"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 0%, var(--acuity-primary) 0%, transparent 60%), radial-gradient(120% 120% at 100% 100%, var(--acuity-secondary) 0%, transparent 60%), linear-gradient(135deg, var(--acuity-primary-lo), var(--acuity-secondary-lo))",
          }}
        >
          <h2 className="m-0 mb-4 font-display text-[46px] font-extrabold tracking-[-1.4px] text-white text-balance">
            Clarity starts tonight.
          </h2>
          {/* TODO(copy): confirm with Keenan. */}
          <p className="mx-auto mb-8 max-w-[480px] font-sans text-[19px] leading-[1.5] text-white/90">
            Your first entry takes one minute. Your first pattern shows up by Sunday.
          </p>
          <a
            href="#"
            className="inline-flex items-center gap-2.5 rounded-acuity-pill bg-white px-8 py-4 font-sans text-[17px] font-bold transition-transform hover:-translate-y-0.5"
            style={{ color: "var(--acuity-primary-lo)", boxShadow: "0 12px 30px oklch(0 0 0 / 0.2)" }}
          >
            Start your free trial
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
      </Reveal>
    </section>
  );
}
