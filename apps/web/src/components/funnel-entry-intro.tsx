import type { EntryIntro } from "@/lib/funnel-config";
import { APP_STORE_RATING_LABEL } from "@/lib/social-proof";

/**
 * Screen 1 intro for /start and /start-bwk: what Ripple is, one "you say it →
 * Ripple catches it" example, and the rating line. Sits above the entry
 * question.
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
  .fei[data-theme-k="${theme}"]{--fei-text:${t.text};--fei-sub:${t.sub};--fei-card:${t.cardBg};--fei-line:${t.cardBorder};--fei-accent:${t.accent}}
  .fei{text-align:center;color:var(--fei-text)}
  .fei__h{font-size:26px;font-weight:700;letter-spacing:-.025em;line-height:1.15;margin:0}
  .fei__sub{font-size:15px;line-height:1.45;color:var(--fei-sub);margin:.625rem auto 0;max-width:22rem}
  .fei__demo{margin:1rem 0 0;border-radius:18px;border:1px solid var(--fei-line);background:var(--fei-card);padding:.875rem 1rem;text-align:left}
  .fei__label{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--fei-sub);margin:0 0 .25rem}
  .fei__said{font-size:14px;font-style:italic;line-height:1.45;margin:0 0 .75rem}
  .fei__caught{list-style:none;margin:0;padding:0}
  .fei__caught li{display:flex;gap:.5rem;align-items:baseline;font-size:14px;font-weight:600;line-height:1.4;padding:.125rem 0}
  .fei__tick{color:var(--fei-accent);font-weight:700}
  .fei__rating{font-size:13px;font-weight:600;color:var(--fei-sub);margin:.875rem 0 0}
  .fei__stars{color:#FBBF24;letter-spacing:.05em}
  .fei__quiz{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--fei-accent);margin:1.375rem 0 .5rem}
`;

export function FunnelEntryIntro({ intro, theme }: { intro: EntryIntro; theme: EntryTheme }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css(ENTRY_THEMES[theme], theme) }} />
      <div className="fei" data-theme-k={theme}>
        <h1 className="fei__h">{intro.headline}</h1>
        <p className="fei__sub">{intro.sub}</p>
        <div className="fei__demo" aria-label="Example">
          <p className="fei__label">You say</p>
          <p className="fei__said">&ldquo;{intro.said}&rdquo;</p>
          <p className="fei__label">Ripple catches</p>
          <ul className="fei__caught">
            {intro.caught.map((c) => (
              <li key={c}><span className="fei__tick" aria-hidden>&#10003;</span>{c}</li>
            ))}
          </ul>
        </div>
        <p className="fei__rating">
          <span className="fei__stars" aria-label="5 stars">&#9733;&#9733;&#9733;&#9733;&#9733;</span> {APP_STORE_RATING_LABEL}
        </p>
        <p className="fei__quiz">{intro.quizLine}</p>
      </div>
    </>
  );
}
