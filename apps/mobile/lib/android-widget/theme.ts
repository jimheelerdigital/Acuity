/**
 * Android widget colors from the user's palette (2026-10-28), mirroring the
 * iOS widget (targets/widget/index.swift "Theme" + "Readability guard"):
 * a flat wash of the accent over the background, the accent kept out of the
 * extremes, and accent-colored text darkened/lightened when needed so any
 * color (including a future free picker) stays readable.
 *
 * RemoteViews take solid hex colors, so the wash is pre-blended here.
 * Pure (no React Native imports) so the web vitest suite can test it.
 */
export type Hex = `#${string}`;

/** Ripple coral, used before the app has written a palette. */
export const FALLBACK_ACCENT: Hex = "#FF8A65";

type RGB = [number, number, number]; // 0…1

export function parseHex(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
  const h = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const v = parseInt(h, 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
}

export function toHex([r, g, b]: RGB): Hex {
  const c = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase() as Hex;
}

/** WCAG relative luminance, 0 (black) … 1 (white). */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Mix toward black (amount > 0) or white (amount < 0). */
function shade([r, g, b]: RGB, amount: number): RGB {
  if (amount >= 0) return [r * (1 - amount), g * (1 - amount), b * (1 - amount)];
  const t = -amount;
  return [r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t];
}

function darkenTo(c: RGB, target: number): RGB {
  let x = c;
  for (let i = 0; i < 20 && luminance(x) > target; i++) x = shade(x, 0.06);
  return x;
}

function lightenTo(c: RGB, target: number): RGB {
  let x = c;
  for (let i = 0; i < 20 && luminance(x) < target; i++) x = shade(x, -0.06);
  return x;
}

/** a over b at alpha. */
function over(a: RGB, b: RGB, alpha: number): RGB {
  return [b[0] + (a[0] - b[0]) * alpha, b[1] + (a[1] - b[1]) * alpha, b[2] + (a[2] - b[2]) * alpha];
}

export interface WidgetColors {
  bg: Hex;
  text: Hex;
  textSec: Hex;
  /** Fills: flame, check circles. */
  accent: Hex;
  /** Text drawn in the accent ("day", "All done"). */
  accentInk: Hex;
  /** Divider and open circles. */
  accentSoft: Hex;
}

const LIGHT_BASE: RGB = [1, 1, 1];
const DARK_BASE: RGB = parseHex("#1F1D1C")!;

/** Same thresholds as the iOS widget. */
export function widgetColors(accentHex: string | null | undefined, dark: boolean): WidgetColors {
  let a = parseHex(accentHex) ?? parseHex(FALLBACK_ACCENT)!;
  const l = luminance(a);
  if (l > 0.7) a = darkenTo(a, 0.6);
  else if (l < 0.05) a = lightenTo(a, 0.1);
  const la = luminance(a);
  const base = dark ? DARK_BASE : LIGHT_BASE;
  const wash = dark ? (la < 0.12 ? 0.32 : 0.2) : la > 0.55 ? 0.22 : 0.13;
  const ink = dark ? (la < 0.25 ? lightenTo(a, 0.35) : a) : la > 0.42 ? darkenTo(a, 0.3) : a;
  return {
    bg: toHex(over(a, base, wash)),
    text: dark ? "#F5F2F0" : "#1A1A1A",
    textSec: dark ? "#A8A29E" : "#6B7280",
    accent: toHex(a),
    accentInk: toHex(ink),
    accentSoft: toHex(over(a, over(a, base, wash), dark ? 0.45 : 0.55)),
  };
}
