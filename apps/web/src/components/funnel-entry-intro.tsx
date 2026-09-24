import type { EntryIntro } from "@/lib/funnel-config";
import { APP_STORE_RATING_LABEL } from "@/lib/social-proof";

/**
 * Screen 1 intro for /start and /start-bwk: what Ripple is, shown as one
 * "you say it → Ripple catches it" exchange (a speech bubble, then chips for
 * what Ripple pulled out), plus a quiet rating/quiz line and a short rule. It
 * reads as a header for the question below, so it deliberately avoids the
 * white bordered card shape the answer buttons use (v8.2.1, Keenan: the first
 * version's card looked like an extra answer).
 *
 * Rendered twice with the same markup: by FunnelSsrEntry (server HTML, shows
 * before JS loads in the FB/IG in-app browsers) and by OnboardingFunnel once it
 * hydrates. No hooks and no Tailwind, so both renders match exactly and the
 * hand-off doesn't shift the layout. Colors come from ENTRY_THEMES because the
 * dusk tokens only exist inside the hydrated funnel root.
 */

export const ENTRY_THEMES = {
  light: {
    bg: "#fff",
    text: "#18181b",
    sub: "#71717a",
    optBg: "#fafafa",
    optBorder: "#e4e4e7",
    optText: "#3f3f46",
    track: "#e4e4e7",
    cardBg: "#fff",
    cardBorder: "#ececf0",
    accent: "var(--acuity-primary)",
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
    cardBg: "oklch(0.215 0.048 287)",
    cardBorder: "oklch(1 0 0 / 0.10)",
    accent: "oklch(0.64 0.16 292)",
  },
} as const;

export type EntryTheme = keyof typeof ENTRY_THEMES;

const css = (t: (typeof ENTRY_THEMES)[EntryTheme], theme: EntryTheme) => `
  .fei[data-theme-k="${theme}"]{--fei-text:${t.text};--fei-sub:${t.sub};--fei-bubble:${theme === "dusk" ? "oklch(1 0 0 / 0.07)" : "oklch(0 0 0 / 0.045)"};--fei-line:${t.cardBorder};--fei-accent:${t.accent}}
  .fei{text-align:center;color:var(--fei-text)}
  .fei--top{margin:0 0 1.5rem}
  .fei--bottom{margin:2rem 0 0}
  .fei__label{font-size:12.5px;font-weight:600;color:var(--fei-sub);margin:0}
  .fei__h{font-size:18px;font-weight:700;letter-spacing:-.015em;line-height:1.3;margin:0}
  .fei__said{display:inline-block;max-width:19rem;margin:.5rem auto 0;padding:.55rem .85rem;border-radius:18px 18px 18px 6px;background:var(--fei-bubble);font-size:13.5px;line-height:1.45;color:var(--fei-text);text-align:left}
  .fei__caught{list-style:none;margin:.625rem auto 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:.3rem;max-width:22rem}
  .fei__chip{display:inline-flex;align-items:center;gap:.25rem;padding:.22rem .55rem;border-radius:999px;font-size:12px;font-weight:600;line-height:1.3;color:var(--fei-text);background:color-mix(in oklch, var(--fei-accent) 13%, transparent);border:1px solid color-mix(in oklch, var(--fei-accent) 28%, transparent)}
  .fei__mark{color:var(--fei-accent);font-weight:700}
  .fei__meta{font-size:12px;white-space:nowrap;font-weight:500;color:var(--fei-sub);margin:.375rem 0 0}
  .fei__stars{color:#FBBF24;letter-spacing:.04em}
`;

/**
 * Two halves around the question (v8.2.2, Keenan): `top` sits above it (what
 * Ripple is + the rating/quiz line), `bottom` sits below the answers (the
 * say/catch example, for anyone who scrolls before choosing). Keeps the
 * answers high on a phone screen. Both halves carry the same <style>, so
 * either can render alone.
 */
export function FunnelEntryIntro({ intro, theme, part }: { intro: EntryIntro; theme: EntryTheme; part: "top" | "bottom" }) {
  const style = <style dangerouslySetInnerHTML={{ __html: css(ENTRY_THEMES[theme], theme) }} />;
  if (part === "top") {
    return (
      <>
        {style}
        <div className="fei fei--top" data-theme-k={theme}>
          <p className="fei__h">{intro.headline}</p>
          <p className="fei__meta">
            <span className="fei__stars" aria-label="5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span> {APP_STORE_RATING_LABEL} &middot; {intro.quizLine}
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      {style}
      <div className="fei fei--bottom" data-theme-k={theme}>
        <p className="fei__label">How Ripple works</p>
        <p className="fei__said">&ldquo;{intro.said}&rdquo;</p>
        <ul className="fei__caught" aria-label="What Ripple catches">
          {intro.caught.map((c) => (
            <li key={c.text} className="fei__chip">
              <span className="fei__mark" aria-hidden>{c.kind === "task" ? "\u2713" : "\u21bb"}</span>
              {c.text}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
