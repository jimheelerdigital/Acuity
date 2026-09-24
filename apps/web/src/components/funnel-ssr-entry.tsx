import type { Question } from "@/lib/funnel-config";

/**
 * Server-rendered Screen 1 for /start and /start-bwk. Real HTML in the first
 * response, so the question shows before any JS downloads. That matters in the
 * FB/IG in-app browsers, where JS can take 3-5s.
 *
 * v8 (2026-09-24): taps before hydration used to do nothing, because these
 * buttons have no React handlers. A tiny inline script now records the first
 * tap on window.__funnelPreTap. OnboardingFunnel picks it up on mount and
 * treats it as the entry answer, so a fast tapper isn't silently dropped.
 */

export const PRE_TAP_KEY = "__funnelPreTap";

const THEMES = {
  light: {
    bg: "#fff",
    text: "#18181b",
    sub: "#71717a",
    optBg: "#fafafa",
    optBorder: "#e4e4e7",
    optText: "#3f3f46",
    track: "#e4e4e7",
  },
  // Dark logo scheme (ripple-lockup-dusk.png): near-black navy + white.
  dusk: {
    bg: "linear-gradient(180deg, oklch(0.19 0.042 287) 0%, oklch(0.168 0.037 287) 100%)",
    text: "oklch(0.98 0.004 285)",
    sub: "oklch(0.74 0.010 285)",
    optBg: "oklch(0.215 0.048 287)",
    optBorder: "oklch(1 0 0 / 0.13)",
    optText: "oklch(0.92 0.006 285)",
    track: "oklch(1 0 0 / 0.1)",
  },
} as const;

export function FunnelSsrEntry({ question, theme, totalSteps }: {
  question: Question;
  theme: keyof typeof THEMES;
  totalSteps: number;
}) {
  const t = THEMES[theme];
  const accent = theme === "dusk" ? "oklch(0.64 0.16 292)" : "var(--acuity-primary)";
  const css = `
    .ssr-entry{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;background:${t.bg};color:${t.text};position:relative}
    .ssr-entry__inner{position:relative;max-width:28rem;width:100%}
    .ssr-entry__eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;text-align:center;color:${t.sub};margin-bottom:1rem}
    .ssr-entry h1{font-size:1.5rem;font-weight:700;letter-spacing:-.025em;line-height:1.3;text-align:center;margin-bottom:2rem}
    @media(min-width:640px){.ssr-entry h1{font-size:1.875rem}}
    .ssr-entry__opt{width:100%;text-align:left;border-radius:1rem;border:1px solid ${t.optBorder};background:${t.optBg};padding:1rem 1.25rem;font-size:0.9375rem;color:${t.optText};margin-bottom:0.75rem;cursor:pointer;transition:background 0.15s}
    .ssr-entry__opt[data-picked]{border-color:${accent};box-shadow:inset 0 0 0 1px ${accent}}
    .ssr-entry__progress{position:fixed;top:0;left:0;right:0;height:3px;background:${t.track}}
    .ssr-entry__progress-bar{height:100%;width:${(100 / totalSteps).toFixed(2)}%;background:${accent}}
  `;
  const preTap = `(function(){var r=document.getElementById('ssr-entry');if(!r)return;r.addEventListener('click',function(e){var b=e.target&&e.target.closest&&e.target.closest('[data-branch]');if(!b||window.${PRE_TAP_KEY})return;window.${PRE_TAP_KEY}={branch:b.getAttribute('data-branch')};b.setAttribute('data-picked','1');});})();`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div id="ssr-entry" className="ssr-entry">
        <div className="ssr-entry__progress"><div className="ssr-entry__progress-bar" /></div>
        <div className="ssr-entry__inner">
          <p className="ssr-entry__eyebrow">Ripple &middot; 2-minute check-in</p>
          <h1>{question.text}</h1>
          <div>
            {question.options.map((opt) => (
              <button key={opt.label} type="button" className="ssr-entry__opt" data-branch={opt.branch}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: preTap }} />
    </>
  );
}
