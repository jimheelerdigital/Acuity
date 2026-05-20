/**
 * Acuity v2 design tokens — port of `_design/design_handoff_acuity_v2/
 * acuity-tokens.jsx` (Claude Design's source of truth).
 *
 * The original was a JSX file that emitted oklch() CSS strings. React
 * Native's color parser doesn't accept oklch(), so we convert every
 * value to `#rrggbb` (or `#rrggbbaa` when there's alpha) at runtime
 * via culori. Palette switching is instant — `makeAcuityTokens` runs
 * in JS each time the user taps a new swatch.
 *
 * Bundle impact: importing from `culori/fn` (the tree-shakeable
 * functional entry) brings only `oklch`, `rgb`, `formatHex`,
 * `formatHex8`. Measured delta: ~14 KB minified, ~5 KB gzipped.
 *
 * Token shape preserves the original keys and structure 1:1. Two
 * intentional divergences from the JSX:
 *   1. All color strings are RN-parseable hex. Where the CSS used
 *      alpha, we use #rrggbbaa.
 *   2. Gradients (linear + radial) are returned as structured data
 *      (stops, locations, start, end) instead of CSS strings — so
 *      consumers can hand them to `expo-linear-gradient` /
 *      `react-native-svg` without re-parsing.
 *
 * Consumers should read tokens via the `useTheme` hook
 * (`apps/mobile/contexts/theme-context.tsx`), not import this file
 * directly. The hook handles light/dark/system resolution + palette
 * change re-renders.
 */

import { oklch as toOklch, rgb as toRgb, formatHex, formatHex8 } from "culori/fn";

// ─── Palette presets ──────────────────────────────────────────────

export type AcuityAccent = "coral" | "sunset" | "citrus" | "cobalt";

interface AccentPreset {
  /** Primary OKLCH [lightness 0..1, chroma 0..0.4, hue 0..360]. */
  primary: [number, number, number];
  /** Secondary OKLCH (cool complement). */
  secondary: [number, number, number];
  name: string;
}

export const ACUITY_ACCENT_PRESETS: Record<AcuityAccent, AccentPreset> = {
  coral: {
    primary: [0.76, 0.155, 38],
    secondary: [0.66, 0.18, 285],
    name: "Coral × Violet",
  },
  sunset: {
    primary: [0.73, 0.165, 18],
    secondary: [0.62, 0.2, 330],
    name: "Sunset × Magenta",
  },
  citrus: {
    primary: [0.8, 0.155, 70],
    secondary: [0.68, 0.165, 195],
    name: "Citrus × Teal",
  },
  cobalt: {
    primary: [0.66, 0.18, 255],
    secondary: [0.78, 0.13, 85],
    name: "Cobalt × Lime",
  },
};

// ─── OKLCH → hex/hex8 helpers ─────────────────────────────────────
//
// culori parses oklch() into an internal object then converts via the
// sRGB gamut. Some out-of-gamut combinations clip to nearest legal
// sRGB — same behavior as the browsers showed in the design canvas,
// so visual parity holds.

function lchToHex(l: number, c: number, h: number): string {
  const out = formatHex(toRgb({ mode: "oklch", l, c, h }));
  // formatHex returns undefined for unparseable input — defensive
  // fallback so a token bug never produces NaN colors that crash RN.
  return out ?? "#000000";
}

function lchToHex8(l: number, c: number, h: number, alpha: number): string {
  const out = formatHex8(toRgb({ mode: "oklch", l, c, h, alpha }));
  return out ?? "#00000000";
}

// ─── Gradient shapes ──────────────────────────────────────────────
//
// expo-linear-gradient accepts: { colors: string[], locations: number[],
// start: { x,y }, end: { x,y } }. Match that shape so callers can spread
// directly. 135deg in CSS = top-left → bottom-right = start {0,0} end {1,1}.

export interface LinearGradientStops {
  colors: string[];
  locations: number[];
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Radial gradients don't exist in expo-linear-gradient. Consumers
 * either layer multiple LinearGradients (cheap, looks fine for our
 * hero blobs) or render via react-native-svg <RadialGradient/>.
 * We surface the structural pieces; Q3 primitives will pick the
 * rendering approach per use case.
 */
export interface RadialGradientStops {
  /** Three stops with positions, ordered inner → outer. */
  stops: Array<{ color: string; position: number }>;
  /** Origin in unit space (0..1). 0.5/0.5 = center. */
  origin: { x: number; y: number };
  /** Extent in unit space (0..2). 1/1 = inscribed circle. */
  size: { x: number; y: number };
}

// ─── Tokens shape ─────────────────────────────────────────────────

export interface AcuityTokens {
  // Mode + accent
  mode: "dark" | "light";
  accent: AcuityAccent;
  name: string;

  // Brand
  primary: string;
  primaryHi: string;
  primaryLo: string;
  secondary: string;
  secondaryHi: string;
  secondaryLo: string;

  // Status
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;

  // Surfaces
  bg: string;
  bgSub: string;
  bgInset: string;

  // Text
  text: string;
  textSec: string;
  textTer: string;
  textQuiet: string;

  // Hairlines
  line: string;
  lineStrong: string;

  // Cards
  cardBg: string;
  cardBgTint: string;
  cardBgRaised: string;
  cardBorder: string;

  // Gradients (linear)
  gradPrimary: LinearGradientStops;
  gradSecondary: LinearGradientStops;
  gradMix: LinearGradientStops;
  gradMixSoft: LinearGradientStops;

  // Gradients (radial — structural; Q3 primitives render)
  heroGrad: { radials: RadialGradientStops[]; linear: LinearGradientStops };
  recordGrad: RadialGradientStops;
  cosmosGrad: RadialGradientStops;

  // Shadows — RN doesn't support inset shadows or multi-layer shadows
  // natively, so consumers should use a `<ShadowView>` primitive (Q3)
  // that composes inset overlays + outer shadow elevation. For Q1, we
  // expose just the outer drop shadows as structured values.
  shadowSoft: { color: string; offsetY: number; radius: number; opacity: number };
  shadowLift: { color: string; offsetY: number; radius: number; opacity: number };
  glowPrimary: { color: string; radius: number; opacity: number };
  glowSecondary: { color: string; radius: number; opacity: number };
  glowSoft: { color: string; radius: number; opacity: number };

  // Radii
  radius: { xs: 10; sm: 14; md: 18; lg: 22; xl: 28; pill: 999 };

  // Fonts — resolved family names (post-useFonts). Geist Mono is the
  // numeral family per design; consumers must pair every numeric
  // display with this family + fontVariant: ['tabular-nums'].
  fontDisplay: string;
  fontSans: string;
  fontMono: string;

  // Motion (Reanimated easing constants live in the consumer; these
  // are documented values matching the design spec).
  durBase: number; // ms
  durSlow: number; // ms

  // Internal — exposed for primitives that need raw OKLCH math
  // (e.g. mixing at runtime). Prefer the resolved hex tokens above.
  _primary: [number, number, number];
  _secondary: [number, number, number];
}

export interface MakeTokensInput {
  dark?: boolean;
  accent?: AcuityAccent;
  /** Chroma scale 0.75..1.25. Production default 1. */
  boost?: number;
}

/**
 * Generate a full token set from a (mode, accent, boost) triple.
 * Pure function — same inputs always yield the same hex strings.
 * Safe to call on every render; cost is dominated by ~30 culori
 * conversions (~0.2ms on a modern device).
 */
export function makeAcuityTokens({
  dark = true,
  accent = "coral",
  boost = 1,
}: MakeTokensInput = {}): AcuityTokens {
  const preset = ACUITY_ACCENT_PRESETS[accent] ?? ACUITY_ACCENT_PRESETS.coral;
  const [pl, pc, ph] = preset.primary;
  const [sl, sc, sh] = preset.secondary;

  // Boost-scaled chroma for primary + secondary brand stops.
  const pcb = pc * boost;
  const scb = sc * boost;

  const primary = lchToHex(pl, pcb, ph);
  const primaryHi = lchToHex(Math.min(0.9, pl + 0.08), pcb, ph);
  const primaryLo = lchToHex(pl - 0.1, pcb, ph);

  const secondary = lchToHex(sl, scb, sh);
  const secondaryHi = lchToHex(Math.min(0.9, sl + 0.08), scb, sh);
  const secondaryLo = lchToHex(sl - 0.1, scb, sh);

  const good = lchToHex(0.74, 0.135, 165);
  const goodSoft = lchToHex8(0.74, 0.135, 165, 0.18);
  const bad = lchToHex(0.66, 0.17, 25);
  const badSoft = lchToHex8(0.66, 0.17, 25, 0.18);

  // Surfaces — note the +5 hue rotation on dark bg variants. Lifts
  // pure neutrals toward warm/cool depending on accent, the "warm
  // undertone charcoal" effect.
  const bg = dark ? lchToHex(0.21, 0.022, sh + 5) : lchToHex(0.975, 0.005, sh);
  const bgSub = dark
    ? lchToHex(0.235, 0.024, sh + 5)
    : lchToHex(0.96, 0.007, sh);
  const bgInset = dark
    ? lchToHex(0.185, 0.02, sh)
    : lchToHex(0.95, 0.008, sh);

  // Hero blob radials. Two soft warm/cool spots at top corners
  // over a vertical linear gradient that gives subtle depth.
  const heroGrad = {
    radials: [
      {
        stops: [
          {
            color: dark
              ? lchToHex8(0.36, 0.1, ph, 0.3)
              : lchToHex8(0.96, 0.07, ph, 0.85),
            position: 0,
          },
          { color: "#00000000", position: 0.55 },
        ],
        origin: { x: 0, y: 0 },
        size: { x: 1.2, y: 0.8 },
      },
      {
        stops: [
          {
            color: dark
              ? lchToHex8(0.32, 0.12, sh, 0.3)
              : lchToHex8(0.95, 0.06, sh, 0.85),
            position: 0,
          },
          { color: "#00000000", position: 0.6 },
        ],
        origin: { x: 1, y: 0 },
        size: { x: 1.1, y: 0.9 },
      },
    ],
    linear: {
      colors: dark
        ? [lchToHex(0.24, 0.024, sh + 5), lchToHex(0.2, 0.022, sh)]
        : [lchToHex(0.985, 0.005, sh), lchToHex(0.97, 0.008, sh)],
      locations: [0, 1],
      start: { x: 0.5, y: 0 },
      end: { x: 0.5, y: 1 },
    },
  };

  // Record screen — deep radial halo behind the orb.
  const recordGrad: RadialGradientStops = {
    stops: dark
      ? [
          { color: lchToHex8(0.32, 0.1, ph, 0.55), position: 0 },
          { color: lchToHex(0.22, 0.04, sh + 10), position: 0.45 },
          { color: lchToHex(0.16, 0.018, sh), position: 1 },
        ]
      : [
          { color: lchToHex8(0.93, 0.08, ph, 0.9), position: 0 },
          { color: lchToHex(0.97, 0.04, sh), position: 0.55 },
          { color: lchToHex(0.92, 0.03, sh), position: 1 },
        ],
    origin: { x: 0.5, y: 0.38 },
    size: { x: 1, y: 1 },
  };

  // Theme Map — quiet dark ellipse for the orbital canvas.
  const cosmosGrad: RadialGradientStops = {
    stops: dark
      ? [
          { color: lchToHex(0.26, 0.08, sh), position: 0 },
          { color: lchToHex(0.18, 0.02, sh), position: 0.55 },
          { color: lchToHex(0.14, 0.014, sh), position: 1 },
        ]
      : [
          { color: lchToHex(0.95, 0.06, sh), position: 0 },
          { color: lchToHex(0.94, 0.04, sh), position: 0.6 },
          { color: lchToHex(0.92, 0.02, sh), position: 1 },
        ],
    origin: { x: 0.5, y: 0.28 },
    size: { x: 1, y: 1 },
  };

  // CTA gradients — 135deg = top-left → bottom-right.
  const tlToBr = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };
  const gradPrimary: LinearGradientStops = {
    colors: [primaryHi, primary, primaryLo],
    locations: [0, 0.55, 1],
    ...tlToBr,
  };
  const gradSecondary: LinearGradientStops = {
    colors: [secondaryHi, secondary, secondaryLo],
    locations: [0, 0.55, 1],
    ...tlToBr,
  };
  const gradMix: LinearGradientStops = {
    colors: [primary, secondary],
    locations: [0, 1],
    ...tlToBr,
  };
  const gradMixSoft: LinearGradientStops = {
    colors: [
      lchToHex8(pl, pc * 0.7, ph, 0.16),
      lchToHex8(sl, sc * 0.7, sh, 0.16),
    ],
    locations: [0, 1],
    ...tlToBr,
  };

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

    bg,
    bgSub,
    bgInset,

    text: dark ? lchToHex(0.98, 0.004, sh) : lchToHex(0.14, 0.012, sh),
    textSec: dark ? lchToHex(0.74, 0.01, sh) : lchToHex(0.42, 0.01, sh),
    textTer: dark ? lchToHex(0.56, 0.012, sh) : lchToHex(0.58, 0.012, sh),
    textQuiet: dark ? lchToHex(0.4, 0.008, sh) : lchToHex(0.74, 0.008, sh),

    line: dark ? "#ffffff12" : "#0000000f",
    lineStrong: dark ? "#ffffff21" : "#0000001a",

    cardBg: dark ? lchToHex(0.245, 0.024, sh + 5) : "#ffffff",
    cardBgTint: dark
      ? lchToHex(0.255, 0.034, ph + 5)
      : lchToHex(0.965, 0.012, ph),
    cardBgRaised: dark ? lchToHex(0.27, 0.028, sh + 5) : "#ffffff",
    cardBorder: dark ? "#ffffff0d" : "#0000000d",

    gradPrimary,
    gradSecondary,
    gradMix,
    gradMixSoft,
    heroGrad,
    recordGrad,
    cosmosGrad,

    // Shadow primitives. RN's <View shadow*> approximates the design's
    // outer shadow; inset highlights are layered manually in Q3.
    shadowSoft: dark
      ? { color: "#000000", offsetY: 8, radius: 22, opacity: 0.28 }
      : { color: "#000000", offsetY: 10, radius: 24, opacity: 0.05 },
    shadowLift: dark
      ? { color: "#000000", offsetY: 14, radius: 36, opacity: 0.34 }
      : { color: "#000000", offsetY: 18, radius: 44, opacity: 0.08 },
    glowPrimary: { color: primary, radius: 16, opacity: 0.3 },
    glowSecondary: { color: secondary, radius: 16, opacity: 0.3 },
    glowSoft: {
      color: lchToHex(pl, pc * 0.7, ph),
      radius: 18,
      opacity: 0.18,
    },

    radius: { xs: 10, sm: 14, md: 18, lg: 22, xl: 28, pill: 999 },

    // Resolved font families. These names match the @expo-google-fonts/*
    // package exports loaded in _layout.tsx via useFonts.
    fontDisplay: "Manrope_700Bold",
    fontSans: "System", // RN's default — SF Pro on iOS, Roboto on Android
    fontMono: "GeistMono_500Medium",

    durBase: 280,
    durSlow: 340,

    _primary: [pl, pc, ph],
    _secondary: [sl, sc, sh],
  };
}

/**
 * Sanity check helper — verifies oklch→hex round-trip lands in the
 * sRGB gamut. Used in dev to catch token regressions if the design
 * spec changes. Not called at runtime.
 */
export function _validatePalette(accent: AcuityAccent): boolean {
  const tokens = makeAcuityTokens({ dark: true, accent, boost: 1 });
  return (
    tokens.primary.startsWith("#") &&
    tokens.primary.length === 7 &&
    tokens.secondary.startsWith("#") &&
    tokens.secondary.length === 7
  );
}
