// Acuity design-system token generator — single source of truth for the
// parametric oklch palette (light/dark × coral/sunset/citrus/cobalt).
//
// Seeded into @acuity/shared 2026-06-09 (marketing-home slice) so BOTH the
// mobile app and the marketing site derive tokens from one place. Ported
// verbatim from the design handoff (`marketing_handoff/acuity-tokens.jsx`)
// — values are 1:1 with `apps/web/src/lib/theme/tokens.css` and
// `apps/mobile/lib/theme/tokens.ts`.
//
// See docs/SHARED_TOKENS_MIGRATION.md for the queued follow-up that makes
// this the generator for web tokens.css + mobile tokens.ts (eliminating
// the current hand-mirroring drift risk). Until then this is consumed by
// the marketing site (page chrome + the live phone-mockup screens).

export type AccentName = "coral" | "sunset" | "citrus" | "cobalt";

export interface AccentPreset {
  /** [L, C, H] oklch triplet — warm primary. */
  primary: [number, number, number];
  /** [L, C, H] oklch triplet — cool secondary. */
  secondary: [number, number, number];
  name: string;
}

// Named accent presets. Each defines (warm) primary + (cool) secondary.
// Dopamine: saturation stays high, lightness mid.
export const ACUITY_ACCENT_PRESETS: Record<AccentName, AccentPreset> = {
  coral: { primary: [0.76, 0.155, 38], secondary: [0.66, 0.18, 285], name: "Coral × Violet" },
  sunset: { primary: [0.73, 0.165, 18], secondary: [0.62, 0.2, 330], name: "Sunset × Magenta" },
  citrus: { primary: [0.8, 0.155, 70], secondary: [0.68, 0.165, 195], name: "Citrus × Teal" },
  cobalt: { primary: [0.66, 0.18, 255], secondary: [0.78, 0.13, 85], name: "Cobalt × Lime" },
};

function _oklch([l, c, h]: [number, number, number], a = 1): string {
  return a < 1 ? `oklch(${l} ${c} ${h} / ${a})` : `oklch(${l} ${c} ${h})`;
}

export interface MakeAcuityTokensOptions {
  dark?: boolean;
  accent?: AccentName;
  boost?: number;
}

export interface AcuityTokens {
  mode: "dark" | "light";
  accent: AccentName;
  name: string;

  primary: string;
  primaryHi: string;
  primaryLo: string;
  secondary: string;
  secondaryHi: string;
  secondaryLo: string;

  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;

  bg: string;
  bgSub: string;
  bgInset: string;

  heroGrad: string;
  grain: string;
  recordGrad: string;
  cosmosGrad: string;

  gradPrimary: string;
  gradSecondary: string;
  gradMix: string;
  gradMixSoft: string;

  text: string;
  textSec: string;
  textTer: string;
  textQuiet: string;

  line: string;
  lineStrong: string;

  cardBg: string;
  cardBgTint: string;
  cardBgRaised: string;
  cardBorder: string;

  shadowSoft: string;
  shadowLift: string;
  glowPrimary: string;
  glowSecondary: string;
  glowSoft: string;

  radius: { xs: number; sm: number; md: number; lg: number; xl: number; pill: number };

  sans: string;
  display: string;
  mono: string;

  easeStandard: string;
  easeEnter: string;
  durBase: string;
  durSlow: string;

  /** Internal — [L,C,H] for percentage rings / oklch math. */
  _primary: [number, number, number];
  _secondary: [number, number, number];
}

export function makeAcuityTokens({
  dark = true,
  accent = "coral",
  boost = 1,
}: MakeAcuityTokensOptions = {}): AcuityTokens {
  const preset = ACUITY_ACCENT_PRESETS[accent] || ACUITY_ACCENT_PRESETS.coral;
  const [pl, pc, ph] = preset.primary;
  const [sl, sc, sh] = preset.secondary;

  const primary = _oklch([pl, pc * boost, ph]);
  const primaryHi = _oklch([Math.min(0.9, pl + 0.08), pc * boost, ph]);
  const primaryLo = _oklch([pl - 0.1, pc * boost, ph]);

  const secondary = _oklch([sl, sc * boost, sh]);
  const secondaryHi = _oklch([Math.min(0.9, sl + 0.08), sc * boost, sh]);
  const secondaryLo = _oklch([sl - 0.1, sc * boost, sh]);

  const good = _oklch([0.74, 0.135, 165]); // mint
  const goodSoft = _oklch([0.74, 0.135, 165], 0.18);
  const bad = _oklch([0.66, 0.17, 25]); // red-ember
  const badSoft = _oklch([0.66, 0.17, 25], 0.18);

  return {
    mode: dark ? "dark" : "light",
    accent,
    name: preset.name,
    primary,
    primaryHi,
    primaryLo,
    secondary,
    secondaryHi,
    secondaryLo,
    good,
    goodSoft,
    bad,
    badSoft,

    // Page surfaces — lifted charcoal with subtle warmth
    bg: dark ? _oklch([0.21, 0.022, sh + 5]) : _oklch([0.975, 0.005, sh]),
    bgSub: dark ? _oklch([0.235, 0.024, sh + 5]) : _oklch([0.96, 0.007, sh]),
    bgInset: dark ? _oklch([0.185, 0.02, sh]) : _oklch([0.95, 0.008, sh]),

    // Hero gradient — atmospheric, layered radial + linear
    heroGrad: dark
      ? `radial-gradient(120% 80% at 0% 0%, ${_oklch([0.36, 0.1, ph], 0.3)} 0%, transparent 55%),
         radial-gradient(110% 90% at 100% 0%, ${_oklch([0.32, 0.12, sh], 0.3)} 0%, transparent 60%),
         linear-gradient(180deg, ${_oklch([0.24, 0.024, sh + 5])} 0%, ${_oklch([0.2, 0.022, sh])} 100%)`
      : `radial-gradient(120% 80% at 0% 0%, ${_oklch([0.96, 0.07, ph], 0.85)} 0%, transparent 60%),
         radial-gradient(110% 90% at 100% 0%, ${_oklch([0.95, 0.06, sh], 0.85)} 0%, transparent 60%),
         linear-gradient(180deg, ${_oklch([0.985, 0.005, sh])} 0%, ${_oklch([0.97, 0.008, sh])} 100%)`,

    // Subtle SVG-turbulence grain. Keeps dark surfaces from reading as
    // flat black; layered on page bg at low opacity for analog warmth.
    grain: dark
      ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1   0 0 0 0 1   0 0 0 0 1   0 0 0 0.6 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.10'/></svg>")`
      : `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0   0 0 0 0 0   0 0 0 0 0   0 0 0 0.4 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/></svg>")`,

    // Recording: dramatic radial glow, soft falloff
    recordGrad: dark
      ? `radial-gradient(circle at 50% 38%, ${_oklch([0.32, 0.1, ph], 0.55)} 0%, ${_oklch([0.22, 0.04, sh + 10])} 45%, ${_oklch([0.16, 0.018, sh])} 100%)`
      : `radial-gradient(circle at 50% 38%, ${_oklch([0.93, 0.08, ph], 0.9)} 0%, ${_oklch([0.97, 0.04, sh])} 55%, ${_oklch([0.92, 0.03, sh])} 100%)`,

    cosmosGrad: dark
      ? `radial-gradient(ellipse at 50% 28%, ${_oklch([0.26, 0.08, sh])} 0%, ${_oklch([0.18, 0.02, sh])} 55%, ${_oklch([0.14, 0.014, sh])} 100%)`
      : `radial-gradient(ellipse at 50% 28%, ${_oklch([0.95, 0.06, sh])} 0%, ${_oklch([0.94, 0.04, sh])} 60%, ${_oklch([0.92, 0.02, sh])} 100%)`,

    // Common gradients (cards / buttons / tags)
    gradPrimary: `linear-gradient(135deg, ${primaryHi} 0%, ${primary} 55%, ${primaryLo} 100%)`,
    gradSecondary: `linear-gradient(135deg, ${secondaryHi} 0%, ${secondary} 55%, ${secondaryLo} 100%)`,
    gradMix: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
    gradMixSoft: `linear-gradient(135deg, ${_oklch([pl, pc * 0.7, ph], 0.16)} 0%, ${_oklch([sl, sc * 0.7, sh], 0.16)} 100%)`,

    // Text
    text: dark ? _oklch([0.98, 0.004, sh]) : _oklch([0.14, 0.012, sh]),
    textSec: dark ? _oklch([0.74, 0.01, sh]) : _oklch([0.42, 0.01, sh]),
    textTer: dark ? _oklch([0.56, 0.012, sh]) : _oklch([0.58, 0.012, sh]),
    textQuiet: dark ? _oklch([0.4, 0.008, sh]) : _oklch([0.74, 0.008, sh]),

    // Hairlines
    line: dark ? `oklch(1 0 0 / 0.07)` : `oklch(0 0 0 / 0.06)`,
    lineStrong: dark ? `oklch(1 0 0 / 0.13)` : `oklch(0 0 0 / 0.10)`,

    // Cards (rounded soft) — slightly raised off bg
    cardBg: dark ? _oklch([0.245, 0.024, sh + 5]) : _oklch([1, 0, 0]),
    cardBgTint: dark ? _oklch([0.255, 0.034, ph + 5]) : _oklch([0.965, 0.012, ph]),
    cardBgRaised: dark ? _oklch([0.27, 0.028, sh + 5]) : _oklch([1, 0, 0]),
    cardBorder: dark ? `oklch(1 0 0 / 0.05)` : `oklch(0 0 0 / 0.05)`,

    // Shadows — softer; rely on contrast lift, not glow
    shadowSoft: dark
      ? "0 1px 0 oklch(1 0 0 / 0.04) inset, 0 8px 22px oklch(0 0 0 / 0.28)"
      : "0 1px 2px oklch(0 0 0 / 0.04), 0 10px 24px oklch(0 0 0 / 0.05)",
    shadowLift: dark
      ? "0 1px 0 oklch(1 0 0 / 0.06) inset, 0 14px 36px oklch(0 0 0 / 0.34)"
      : "0 2px 6px oklch(0 0 0 / 0.05), 0 18px 44px oklch(0 0 0 / 0.08)",
    // Glow — reserve for hero moments (mic FAB, primary CTA, recording orb).
    glowPrimary: `0 0 16px ${_oklch([pl, pc, ph], 0.3)}, 0 8px 18px ${_oklch([pl - 0.1, pc, ph], 0.22)}`,
    glowSecondary: `0 0 16px ${_oklch([sl, sc, sh], 0.3)}, 0 8px 18px ${_oklch([sl - 0.1, sc, sh], 0.22)}`,
    glowSoft: `0 6px 18px ${_oklch([pl, pc * 0.7, ph], 0.18)}`,

    // Borders + radii
    radius: { xs: 10, sm: 14, md: 18, lg: 22, xl: 28, pill: 999 },

    // Fonts
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    display: '"Manrope", -apple-system, "SF Pro Display", system-ui, sans-serif',
    mono: '"Geist Mono", "SF Mono", ui-monospace, Menlo, monospace',

    // Motion
    easeStandard: "cubic-bezier(.32, .72, 0, 1)",
    easeEnter: "cubic-bezier(.16, .9, .3, 1)",
    durBase: "280ms",
    durSlow: "340ms",

    // Internal — for percentage rings, oklch math
    _primary: [pl, pc, ph],
    _secondary: [sl, sc, sh],
  };
}
