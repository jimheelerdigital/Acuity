/**
 * Shared visual tokens for the v2 Theme Map. Web + mobile keep these
 * in sync — see apps/mobile/components/theme-map/theme-tokens.ts for
 * the RN-friendly mirror (no CSS gradient strings).
 */

export type CategoryToken = "activity" | "reflection" | "life" | "emotional";

export const CATEGORY: Record<
  CategoryToken,
  {
    /** primary solid colour — used for borders, dots, glow halos */
    solid: string;
    /** matched secondary tone, used as the second stop on gradients */
    accent: string;
    /** complete CSS gradient string for backgrounds + borders */
    gradient: string;
  }
> = {
  activity: {
    solid: "#FB923C",
    accent: "#FBBF24",
    gradient: "linear-gradient(135deg, #FB923C, #FBBF24)",
  },
  reflection: {
    solid: "#A78BFA",
    accent: "#60A5FA",
    gradient: "linear-gradient(135deg, #A78BFA, #60A5FA)",
  },
  life: {
    solid: "#22D3EE",
    accent: "#22D3EE",
    gradient: "linear-gradient(135deg, #22D3EE, #22D3EE)",
  },
  emotional: {
    solid: "#F472B6",
    accent: "#F472B6",
    gradient: "linear-gradient(135deg, #F472B6, #F472B6)",
  },
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

export const BG_GRADIENT =
  "linear-gradient(180deg, #1A1530 0%, #0E0E1C 40%, #08080F 100%)";

export const CARD_STYLE = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.005) 100%)",
  border: "0.5px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -36px rgba(0,0,0,0.6)",
} as const;
