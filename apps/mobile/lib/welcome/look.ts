/**
 * Colours for the funnel welcome flow and its tour (approved design,
 * 2026-10-12). Deliberately deeper than the funnel's #ED9672 surface
 * (app/onboarding-new/_v10/_ui.tsx) so white type stays readable; body
 * copy sits on white cards. Shared by app/welcome.tsx and
 * components/tour/WelcomeTourCard.tsx so the two can't drift apart.
 */
export const WELCOME_CORAL = {
  top: "#e9724c",
  mid: "#d65f3a",
  bottom: "#b8472b",
  /** Tour card bottom stop. */
  card: "#c4532f",
  /** Coral text on white (buttons, numbers). */
  ink: "#b8472b",
  /** Coral text on tinted chips. */
  chipInk: "#c4532f",
  chipBg: "#fbf1ee",
  good: "#40c595",
} as const;
