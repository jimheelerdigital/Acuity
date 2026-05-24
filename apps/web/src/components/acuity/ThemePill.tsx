import type { CSSProperties } from "react";

/**
 * Acuity ThemePill — web mirror of `apps/mobile/components/acuity/
 * ThemePill.tsx`. Slice 1 web foundation.
 *
 * Per DESIGN_SYSTEM.md §5.4 + §2.8 canonical theme palette:
 * pill with a small theme-color gradient dot + label. The 9 canonical
 * themes have stable hue values pre-positioned by the design. The
 * dot stops are oklch(0.78 0.16 H) → oklch(0.55 0.16 H); the pill
 * background is a low-chroma tint at the same hue.
 *
 * Hex pairs below are sampled offline (same conversion mobile does at
 * runtime via culori). Sampling once at design time means render-path
 * cost is zero per pill — the alternative was an oklch → rgb pass on
 * every paint, which we'd want to memoize and then we're paying the
 * complexity tax for a static 9-row table. Pre-sampled wins.
 *
 * For themes outside the canonical 9, callers pass `theme="other"`
 * and we fall through to a neutral pill — web does not currently
 * implement the FNV-1a hash-to-hue fallback that mobile uses for
 * arbitrary theme names. Add it when there's product demand
 * (probably alongside the orbital cosmos port in slice 6).
 */

export type ThemeKey =
  | "career"
  | "family"
  | "health"
  | "avoidance"
  | "money"
  | "relationships"
  | "sleep"
  | "growth"
  | "solitude"
  | "other";

interface ThemeColors {
  dotTop: string;
  dotBottom: string;
  tintDark: string;
  tintLight: string;
}

// 1:1 with `apps/mobile/components/acuity/ThemePill.tsx → THEME_COLORS`.
// If mobile's table changes, mirror here in the same commit.
const THEME_COLORS: Record<ThemeKey, ThemeColors> = {
  // hue 295 — violet
  career: {
    dotTop: "#b58ef5",
    dotBottom: "#7a3eb5",
    tintDark: "#3a2d4e9e",
    tintLight: "#ece0fb",
  },
  // hue 25 — coral
  family: {
    dotTop: "#ffa886",
    dotBottom: "#c45a3e",
    tintDark: "#4a312a9e",
    tintLight: "#fde2d7",
  },
  // hue 165 — mint
  health: {
    dotTop: "#7eddbc",
    dotBottom: "#3d8e75",
    tintDark: "#2a3f3a9e",
    tintLight: "#d8efe6",
  },
  // hue 60 — amber
  avoidance: {
    dotTop: "#dfc26a",
    dotBottom: "#8a6f1e",
    tintDark: "#3e3a229e",
    tintLight: "#f1ead0",
  },
  // hue 115 — green
  money: {
    dotTop: "#a4d575",
    dotBottom: "#5a8a30",
    tintDark: "#2e3e2c9e",
    tintLight: "#dfecd0",
  },
  // hue 345 — pink
  relationships: {
    dotTop: "#f59abf",
    dotBottom: "#b54d77",
    tintDark: "#4a2d3a9e",
    tintLight: "#fad5e3",
  },
  // hue 235 — blue
  sleep: {
    dotTop: "#88a8e8",
    dotBottom: "#3f5fa8",
    tintDark: "#2c344a9e",
    tintLight: "#dee5f3",
  },
  // hue 195 — teal
  growth: {
    dotTop: "#80c9dd",
    dotBottom: "#3d7a8e",
    tintDark: "#2a3a429e",
    tintLight: "#d6eaf1",
  },
  // hue 275 — purple
  solitude: {
    dotTop: "#a986e8",
    dotBottom: "#6f3eaf",
    tintDark: "#352e4a9e",
    tintLight: "#e7daf6",
  },
  // neutral fallback for non-canonical themes
  other: {
    dotTop: "#c4c4c8",
    dotBottom: "#6f6f76",
    tintDark: "#3a3a3e9e",
    tintLight: "#eaeaec",
  },
};

export interface ThemePillProps {
  theme: ThemeKey;
  label?: string;
  size?: "s" | "m";
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ThemePill({ theme, label, size = "m" }: ThemePillProps) {
  const colors = THEME_COLORS[theme] ?? THEME_COLORS.other;
  const padV = size === "s" ? "py-[5px]" : "py-[7px]";
  const padH = size === "s" ? "px-[10px]" : "px-3";
  const fontSize = size === "s" ? "text-[12px]" : "text-[13px]";
  const dotSize = size === "s" ? "h-1.5 w-1.5" : "h-[7px] w-[7px]";

  return (
    <span
      className={`acuity-theme-pill inline-flex items-center gap-[7px] rounded-acuity-pill border border-acuity-line ${padV} ${padH}`}
      style={
        // Both tints are emitted as CSS variables; tokens.css's
        // `.acuity-theme-pill` + `[data-theme="dark"] .acuity-theme-pill`
        // rules pick the right one based on the active theme. Keeps
        // ThemePill a server component and avoids a class explosion.
        {
          ["--pill-tint-light" as string]: colors.tintLight,
          ["--pill-tint-dark" as string]: colors.tintDark,
        } as CSSProperties
      }
    >
      <span
        className={`inline-block rounded-full ${dotSize}`}
        style={{
          background: `linear-gradient(135deg, ${colors.dotTop} 0%, ${colors.dotBottom} 100%)`,
        }}
      />
      <span
        className={`font-sans font-semibold tracking-[-0.1px] text-acuity-text ${fontSize}`}
      >
        {label ?? titleCase(theme)}
      </span>
    </span>
  );
}
