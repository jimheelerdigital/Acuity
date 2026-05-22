import type { Config } from "tailwindcss";

/**
 * Tailwind config — slice 1 of web parity work (2026-05-22).
 *
 * The `acuity-*` color scale + canonical fontFamily are the new
 * design-system surface. Every primitive in `src/components/acuity/`
 * reads from these keys. CSS variables defined in
 * `src/lib/theme/tokens.css` resolve the actual OKLCH values at
 * runtime, parameterized by `[data-theme="dark"]` / `[data-theme="light"]`
 * on `<html>`.
 *
 * The legacy `brand` (violet) + `warm` palettes are intentionally
 * kept intact during slice 1 so the in-flight landing page and
 * authenticated screens continue to render. Slices 2+ migrate
 * consumers off the legacy keys; the deprecation removal lands
 * in the final slice once nothing reads from `brand-*` or `warm-*`.
 */

const config: Config = {
  // Dark mode driven by either `<html class="dark">` (legacy Tailwind
  // convention used by current pages) OR `<html data-theme="dark">`
  // (canonical Acuity convention from DESIGN_SYSTEM.md §2.10). Both
  // selectors trigger `dark:` variant classes until slice N retires
  // the className-based path.
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ─── Canonical Acuity palette (new — slice 1) ──────────────
        // Reads CSS vars defined in lib/theme/tokens.css. Coral primary
        // mirrors `apps/mobile/lib/theme/tokens.ts` coral preset.
        acuity: {
          // Brand
          primary: "var(--acuity-primary)",
          "primary-hi": "var(--acuity-primary-hi)",
          "primary-lo": "var(--acuity-primary-lo)",
          secondary: "var(--acuity-secondary)",
          "secondary-hi": "var(--acuity-secondary-hi)",
          "secondary-lo": "var(--acuity-secondary-lo)",

          // Status
          good: "var(--acuity-good)",
          "good-soft": "var(--acuity-good-soft)",
          bad: "var(--acuity-bad)",
          "bad-soft": "var(--acuity-bad-soft)",
          warn: "var(--acuity-warn)",

          // Brand soft variants (18% alpha at primary/secondary chroma)
          "primary-soft": "var(--acuity-primary-soft)",
          "secondary-soft": "var(--acuity-secondary-soft)",

          // Surfaces
          bg: "var(--acuity-bg)",
          "bg-sub": "var(--acuity-bg-sub)",
          "bg-inset": "var(--acuity-bg-inset)",
          "card-bg": "var(--acuity-card-bg)",
          "card-bg-tint": "var(--acuity-card-bg-tint)",
          "card-bg-raised": "var(--acuity-card-bg-raised)",
          "card-border": "var(--acuity-card-border)",

          // Text
          text: "var(--acuity-text)",
          "text-sec": "var(--acuity-text-sec)",
          "text-ter": "var(--acuity-text-ter)",
          "text-quiet": "var(--acuity-text-quiet)",

          // Hairlines
          line: "var(--acuity-line)",
          "line-strong": "var(--acuity-line-strong)",
        },

        // ─── Legacy palettes (slated for removal in slice N) ───────
        // DO NOT add new consumers. `brand-*` is the old violet ramp;
        // `warm-*` is the warm-amber landing aesthetic. Both stay
        // intact during slice 1 to avoid breaking active pages, get
        // migrated screen-by-screen in slices 2-7, then deleted.
        brand: {
          50: "#F5F3FF",
          100: "#EDE9FE",
          200: "#DDD6FE",
          300: "#C4B5FD",
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
          800: "#5B21B6",
          900: "#4C1D95",
        },
        warm: {
          amber: "#E8B88A",
          gold: "#D4A574",
          muted: "#B0A898",
          bg: "#181614",
          card: "#1E1C1A",
          "card-inner": "#252220",
        },
      },
      fontFamily: {
        // Canonical: Manrope for display, system stack for body, Geist
        // Mono for numerals + eyebrows. Mirrors DESIGN_SYSTEM.md §3.1.
        // The `--font-display` and `--font-mono` CSS vars are wired in
        // `app/layout.tsx` via `next/font/google`.
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        // `--font-geist-mono` is set by the `geist/font/mono` package
        // (Vercel's self-hosted Geist Mono); see layout.tsx for the
        // import. Tailwind doesn't need an alias.
        mono: [
          "var(--font-geist-mono)",
          "SF Mono",
          "ui-monospace",
          "monospace",
        ],

        // Legacy aliases — kept readable while landing/blog/etc still
        // use `font-serif` / `font-inter` / `font-playfair` class
        // references. These resolve to the canonical fonts now, so
        // any "display" surface inherits Manrope automatically.
        serif: [
          "var(--font-display)",
          "-apple-system",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        // Canonical scale per DESIGN_SYSTEM.md §4.2.
        "acuity-xs": "var(--acuity-radius-xs)",
        "acuity-sm": "var(--acuity-radius-sm)",
        "acuity-md": "var(--acuity-radius-md)",
        "acuity-lg": "var(--acuity-radius-lg)",
        "acuity-xl": "var(--acuity-radius-xl)",
        "acuity-pill": "var(--acuity-radius-pill)",
      },
      boxShadow: {
        "acuity-soft": "var(--acuity-shadow-soft)",
        "acuity-lift": "var(--acuity-shadow-lift)",
        "acuity-glow-primary": "var(--acuity-glow-primary)",
        "acuity-glow-secondary": "var(--acuity-glow-secondary)",
        "acuity-glow-soft": "var(--acuity-glow-soft)",
      },
      backgroundImage: {
        "acuity-grad-primary": "var(--acuity-grad-primary)",
        "acuity-grad-secondary": "var(--acuity-grad-secondary)",
        "acuity-grad-mix": "var(--acuity-grad-mix)",
        "acuity-grad-mix-soft": "var(--acuity-grad-mix-soft)",
      },
      transitionTimingFunction: {
        "acuity-standard": "var(--acuity-ease-standard)",
        "acuity-enter": "var(--acuity-ease-enter)",
      },
      transitionDuration: {
        "acuity-base": "280ms",
        "acuity-slow": "340ms",
      },
      animation: {
        // Legacy keyframes — consumers in landing/onboarding/recording
        // still reference these. Pruning happens slice-by-slice as the
        // consumers migrate. New surfaces use `acuity-fade-up` /
        // `acuity-fade-in` utilities (defined in tokens.css).
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.5s ease-in-out",
        "fade-in-up": "fadeInUp 0.6s ease-out both",
        "cta-shine": "cta-shine 3s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
