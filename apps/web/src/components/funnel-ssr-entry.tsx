import type { EntryIntro, Question } from "@/lib/funnel-config";
import { ENTRY_THEMES, FunnelEntryIntro, type EntryTheme } from "@/components/funnel-entry-intro";

/**
 * Server-rendered Screen 1 for /start and /start-bwk. Real HTML in the first
 * response, so the question shows before any JS downloads. That matters in the
 * FB/IG in-app browsers, where JS can take 3-5s.
 *
 * v8 (2026-09-24): taps before hydration used to do nothing, because these
 * buttons have no React handlers. A tiny inline script now records the first
 * tap on window.__funnelPreTap. OnboardingFunnel picks it up on mount and
 * treats it as the entry answer, so a fast tapper isn't silently dropped.
 *
 * v8.2 (2026-09-24): the intro (what Ripple is + a say/catch example) sits
 * above the question. It's the shared FunnelEntryIntro, so this server copy
 * and the hydrated screen match.
 */

export const PRE_TAP_KEY = "__funnelPreTap";

export function FunnelSsrEntry({ question, intro, theme, totalSteps }: {
  question: Question;
  intro: EntryIntro;
  theme: EntryTheme;
  totalSteps: number;
}) {
  const t = ENTRY_THEMES[theme];
  const accent = t.accent;
  const css = `
    .ssr-entry{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem 1.5rem 2rem;background:${t.bg};color:${t.text};position:relative}
    .ssr-entry__inner{position:relative;max-width:28rem;width:100%}
    .ssr-entry h2{font-size:1.5rem;font-weight:700;letter-spacing:-.025em;line-height:1.25;text-align:center;margin:0 0 1.5rem}
    @media(min-width:640px){.ssr-entry h2{font-size:1.875rem}}
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
          <FunnelEntryIntro intro={intro} theme={theme} />
          <h2>{question.text}</h2>
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
