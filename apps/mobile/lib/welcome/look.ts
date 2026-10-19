/**
 * Colours for the funnel welcome flow and its tour. The coral is the BRAND
 * coral the web/app funnel uses (#ED9672 family, CoralScreen in
 * app/onboarding-new/_v10/_ui.tsx) — not the deeper prototype shade, which
 * Jimmy rejected on device (2026-10-12: "not my coral color"). Shared by
 * app/welcome.tsx and components/tour/WelcomeTourCard.tsx.
 */
export const WELCOME_CORAL = {
  top: "#F4AD8C",
  mid: "#ED9672",
  bottom: "#E88B66",
  /** Coral label on white buttons (same as FunnelCta onCoral: tokens.primaryLo). */
  ink: "#e06b46",
  /** Coral text on tinted chips (darker for legibility at small sizes). */
  chipInk: "#c4532f",
  chipBg: "#fbf1ee",
  good: "#40c595",
} as const;
