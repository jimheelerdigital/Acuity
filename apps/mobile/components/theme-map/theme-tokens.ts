/**
 * Mobile mirror of apps/web/src/components/theme-map/theme-tokens.
 * No CSS gradient strings — RN uses gradient stop objects passed to
 * react-native-svg's <LinearGradient> instead. Solid colours and the
 * mood/text token vocabulary are kept identical.
 */

export type CategoryToken = "activity" | "reflection" | "life" | "emotional";

export const CATEGORY: Record<
  CategoryToken,
  {
    solid: string;
    accent: string;
  }
> = {
  activity: { solid: "#FB923C", accent: "#FBBF24" },
  reflection: { solid: "#A78BFA", accent: "#60A5FA" },
  life: { solid: "#22D3EE", accent: "#22D3EE" },
  emotional: { solid: "#F472B6", accent: "#F472B6" },
};

export const MOOD = {
  positive: "#34D399",
  positiveLight: "#6EE7B7",
  negative: "#FB7185",
  negativeLight: "#F472B6",
  baseline: "rgba(255,255,255,0.15)",
};

export const TEXT = {
  primary: "#FAFAFA",
  secondary: "rgba(168,168,180,0.7)",
  tertiary: "rgba(168,168,180,0.5)",
  eyebrow: "#FCA85A",
};

export const PAGE_BG_STOPS = [
  { offset: "0%", color: "#1A1530" },
  { offset: "40%", color: "#0E0E1C" },
  { offset: "100%", color: "#08080F" },
];

export const CARD_STYLE = {
  backgroundColor: "rgba(255,255,255,0.02)",
  borderWidth: 0.5,
  borderColor: "rgba(255,255,255,0.08)",
  borderRadius: 16,
} as const;
