/**
 * Pricing — single plan card. Ported from the handoff
 * (`marketing.jsx → Pricing`). $4.99/mo, 14-day trial (matches live).
 * "12-axis Life Matrix" corrected to "Life Matrix" (live is 10 axes —
 * see PRODUCT_DRIFT_AUDIT.md; no axis-count claim in marketing).
 */
import { Reveal } from "@/components/landing-shared";

const FEATURES = [
  "Unlimited voice entries",
  "AI tasks, goals & themes",
  "Weekly insight report",
  "Cosmic Theme Map",
  "Life Matrix",
  "Every achievement badge",
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-acuity-bg px-7 py-24">
      <div className="mx-auto max-w-[1080px]">
        <Reveal>
          <div className="mb-12 text-center">
            <div className="mb-[18px] font-mono text-[12px] font-semibold uppercase tracking-[0.2em] text-acuity-primary">
              Pricing
            </div>
            <h2 className="m-0 font-display text-[42px] font-extrabold tracking-[-1.2px] text-acuity-text">
              One plan. Everything in.
            </h2>
          </div>
        </Reveal>

        <Reveal delay={1}>
          <div className="relative mx-auto max-w-[460px] overflow-hidden rounded-acuity-xl border border-acuity-card-border bg-acuity-card-bg px-[38px] py-10 shadow-acuity-lift">
            <div className="pointer-events-none absolute -right-10 -top-[60px] h-[220px] w-[220px] rounded-full bg-acuity-grad-mix-soft blur-[10px]" />
            <div className="relative">
              <div className="mb-1.5 font-display text-[20px] font-bold text-acuity-text">Acuity Pro</div>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-display text-[56px] font-extrabold tracking-[-2px] text-acuity-text">$4.99</span>
                <span className="font-sans text-[17px] text-acuity-text-sec">/ month</span>
              </div>
              <div className="mb-7 font-sans text-[15px] text-acuity-text-ter">14-day free trial · cancel anytime</div>

              <div className="mb-[30px] flex flex-col gap-[13px]">
                {FEATURES.map((f) => (
                  <div key={f} className="flex items-center gap-[11px]">
                    <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-acuity-grad-primary">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12.5 10 17l9-10" />
                      </svg>
                    </div>
                    <span className="font-sans text-[16px] font-medium text-acuity-text">{f}</span>
                  </div>
                ))}
              </div>

              <a
                href="#start"
                className="flex w-full items-center justify-center gap-2.5 rounded-acuity-pill border-[0.5px] border-white/25 bg-acuity-grad-primary px-[26px] py-[15px] font-sans text-[16px] font-bold text-white shadow-acuity-glow-primary transition-transform hover:-translate-y-0.5"
              >
                Start free trial
              </a>
              <div className="mt-3.5 text-center font-sans text-[13.5px] text-acuity-text-ter">No credit card required</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
