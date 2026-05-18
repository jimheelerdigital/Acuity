/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          400: "#A78BFA",
          500: "#8B5CF6",
          600: "#7C3AED",
          700: "#6D28D9",
        },
      },
      // Slice H typography scale (2026-05-18). Aligns Tailwind's
      // text-* classes to iOS Human Interface Guidelines semantic
      // sizes so the app reads as a native iOS surface, not a web
      // app shoved into a phone frame. Body baseline is 17pt
      // (HIG default) — was 14-16pt across 200+ usage sites
      // pre-Slice H. Multiple user reports said text was "way too
      // small everywhere."
      //
      // First-pass screenshot review (2026-05-18) had hero titles
      // wrapping on iPhone 16e at 40px. Walked text-4xl back to 34
      // (iOS largeTitle baseline) and text-3xl back to 30. Mid-tier
      // sizes (body 17, subhead 15, caption 13) were the actual
      // problem; hero titles didn't need to exceed iOS native scale.
      //
      // Mapping (lineHeight ≈ 1.4× of size for body, tighter for
      // headlines per iOS conventions):
      //   text-xs   13px → footnote / caption
      //   text-sm   15px → subhead
      //   text-base 17px → body (iOS HIG default)
      //   text-lg   20px → title3 / callout-heading
      //   text-xl   22px → title2
      //   text-2xl  28px → title1
      //   text-3xl  30px → between title1 and largeTitle
      //   text-4xl  34px → largeTitle (iOS HIG)
      //   text-5xl  48px → hero number (unchanged)
      //
      // Dynamic Type respect: app/_layout.tsx sets
      // Text.defaultProps.maxFontSizeMultiplier = 1.5 so layouts
      // don't explode at iOS "Larger Accessibility" Dynamic Type
      // settings. allowFontScaling stays at RN's default (true)
      // so per-user accessibility preferences are honored.
      fontSize: {
        xs: ["13px", { lineHeight: "18px" }],
        sm: ["15px", { lineHeight: "21px" }],
        base: ["17px", { lineHeight: "24px" }],
        lg: ["20px", { lineHeight: "26px" }],
        xl: ["22px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "34px" }],
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["34px", { lineHeight: "40px" }],
        "5xl": ["48px", { lineHeight: "52px" }],
      },
    },
  },
  plugins: [],
};
