"use client";

import {
  Card,
  SectionHeader,
  SegmentedTabs,
} from "@/components/acuity";
import {
  useAppearance,
  type Palette,
} from "@/contexts/appearance-context";

/**
 * Appearance settings section — light/dark/system toggle + 4-palette
 * picker. Slice 22 (2026-05-24). Replaces the minimal `<ThemeToggle/>`
 * placement that lived inline in account-client.tsx.
 *
 * Mirrors the mobile Profile → Appearance composition: SegmentedTabs
 * for the mode, swatch row for the palette. Each swatch renders an
 * inline gradient preview using the actual `--acuity-primary` +
 * `--acuity-secondary` OKLCH values for that palette so the user
 * sees exactly what they're about to pick. The currently-selected
 * swatch gets a ring at `--acuity-primary` (which itself reflects the
 * active palette — small self-confirming visual).
 *
 * Persistence flows through `useAppearance()` → POST /api/user/theme
 * (the mobile-shared endpoint). Updates are optimistic; first paint
 * already reflects the persisted preference via SSR (see slice 21).
 *
 * Voice (Accountability per Acuity_SalesCopy.md §8): short, matter-
 * of-fact, no transformation language. "Choose how Ripple looks for
 * you." is the rubric-compliant framing — specific (looks), neutral
 * (not "personalize", not "transform").
 */

const MODE_TABS = [
  { id: "light" as const, label: "Light" },
  { id: "dark" as const, label: "Dark" },
  { id: "system" as const, label: "System" },
];

interface PaletteSwatchProps {
  palette: Palette;
  label: string;
  primaryStop: string;
  secondaryStop: string;
  selected: boolean;
  onSelect: (p: Palette) => void;
}

/**
 * Swatch — circular gradient preview rendered as inline SVG so we
 * can mix the two OKLCH stops at exact angles. Plain CSS
 * `background: linear-gradient` would work too, but the SVG keeps
 * the swatch dimensions independent of layout flow (square aspect
 * locked at 56×56 regardless of grid behavior).
 *
 * The stops are passed in as literal OKLCH strings so the preview
 * renders the target palette regardless of the currently-active
 * `--acuity-primary` / `--acuity-secondary` vars. Otherwise every
 * swatch would look like the active palette — defeats the picker.
 */
function PaletteSwatch({
  palette,
  label,
  primaryStop,
  secondaryStop,
  selected,
  onSelect,
}: PaletteSwatchProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${label} palette`}
      onClick={() => onSelect(palette)}
      className={`group relative flex flex-col items-center gap-2 rounded-acuity-md p-2 transition outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary focus-visible:ring-offset-2 focus-visible:ring-offset-acuity-card-bg`}
    >
      <span
        className={`block h-14 w-14 rounded-full ring-offset-2 ring-offset-acuity-card-bg transition-shadow ${
          selected
            ? "ring-2 ring-acuity-primary"
            : "ring-1 ring-acuity-line group-hover:ring-acuity-line-strong"
        }`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 56 56"
          width="56"
          height="56"
          className="block rounded-full"
        >
          <defs>
            <linearGradient
              id={`swatch-${palette}`}
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop offset="0%" stopColor={primaryStop} />
              <stop offset="100%" stopColor={secondaryStop} />
            </linearGradient>
          </defs>
          <circle
            cx="28"
            cy="28"
            r="28"
            fill={`url(#swatch-${palette})`}
          />
        </svg>
      </span>
      <span
        className={`font-mono text-[10px] font-bold uppercase tracking-[1.4px] ${
          selected ? "text-acuity-text" : "text-acuity-text-ter"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Palette swatch stops match
 * `apps/mobile/lib/theme/tokens.ts → ACUITY_ACCENT_PRESETS`. We use
 * the canonical primary + secondary OKLCH triplets directly so a
 * design tweak in mobile's tokens.ts has a single mirror point on
 * web.
 */
const PALETTE_PREVIEWS: Array<{
  palette: Palette;
  label: string;
  primary: string;
  secondary: string;
}> = [
  {
    palette: "coral",
    label: "Coral",
    primary: "oklch(0.76 0.155 38)",
    secondary: "oklch(0.66 0.18 285)",
  },
  {
    palette: "sunset",
    label: "Sunset",
    primary: "oklch(0.73 0.165 18)",
    secondary: "oklch(0.62 0.2 330)",
  },
  {
    palette: "citrus",
    label: "Citrus",
    primary: "oklch(0.80 0.155 70)",
    secondary: "oklch(0.68 0.165 195)",
  },
  {
    palette: "cobalt",
    label: "Cobalt",
    primary: "oklch(0.66 0.18 255)",
    secondary: "oklch(0.78 0.13 85)",
  },
];

export function AppearanceSection() {
  const { themePreference, palette, setThemePreference, setPalette } =
    useAppearance();

  return (
    <Card variant="default" radius="lg" padding={6} className="mt-8">
      <SectionHeader label="Appearance" />

      <p className="mt-3 text-base leading-relaxed text-acuity-text-sec">
        Choose how Ripple looks for you.
      </p>

      {/* Mode toggle */}
      <div className="mt-5">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Mode
        </p>
        <SegmentedTabs
          tabs={MODE_TABS}
          activeId={themePreference}
          onChange={(id) => setThemePreference(id)}
        />
      </div>

      {/* Palette picker */}
      <div className="mt-6">
        <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          Palette
        </p>
        <div
          role="radiogroup"
          aria-label="Accent palette"
          className="flex flex-wrap gap-1"
        >
          {PALETTE_PREVIEWS.map((p) => (
            <PaletteSwatch
              key={p.palette}
              palette={p.palette}
              label={p.label}
              primaryStop={p.primary}
              secondaryStop={p.secondary}
              selected={palette === p.palette}
              onSelect={setPalette}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
