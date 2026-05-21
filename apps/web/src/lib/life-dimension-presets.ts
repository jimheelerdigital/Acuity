// Preset templates for the Configurable Life Matrix. Each preset is a
// 10-row override of the canonical LIFE_AREAS display layer — label,
// description, color, and icon. The underlying `area` enum never
// changes, so extraction + goals + LifeMapArea keep speaking the same
// vocabulary regardless of which preset the user picks.
//
// Phase D (2026-05-21): expanded from 6 axes to 10 (CAREER, MONEY,
// ROMANCE, FAMILY, FRIENDS, PHYSICAL_HEALTH, MENTAL_HEALTH, GROWTH,
// FUN, PURPOSE). STUDENT and PARENT presets re-cast labels to each
// life stage's vocabulary while preserving the canonical 10 enum
// values so AI extraction continues to populate them identically.

export type LifeDimensionRow = {
  area:
    | "CAREER"
    | "MONEY"
    | "ROMANCE"
    | "FAMILY"
    | "FRIENDS"
    | "PHYSICAL_HEALTH"
    | "MENTAL_HEALTH"
    | "GROWTH"
    | "FUN"
    | "PURPOSE";
  label: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export const LIFE_DIMENSION_PRESET_NAMES = [
  "DEFAULT",
  "STUDENT",
  "PARENT",
  "CUSTOM",
] as const;

export type LifeDimensionPresetName =
  (typeof LIFE_DIMENSION_PRESET_NAMES)[number];

export const LIFE_DIMENSION_PRESETS: Record<
  Exclude<LifeDimensionPresetName, "CUSTOM">,
  LifeDimensionRow[]
> = {
  DEFAULT: [
    { area: "CAREER", label: "Career", color: "#3B82F6", icon: "briefcase", sortOrder: 0 },
    { area: "MONEY", label: "Money", color: "#F59E0B", icon: "wallet", sortOrder: 1 },
    { area: "ROMANCE", label: "Romance", color: "#EC4899", icon: "heart", sortOrder: 2 },
    { area: "FAMILY", label: "Family", color: "#F43F5E", icon: "users", sortOrder: 3 },
    { area: "FRIENDS", label: "Friends", color: "#14B8A6", icon: "users-round", sortOrder: 4 },
    { area: "PHYSICAL_HEALTH", label: "Physical Health", color: "#84CC16", icon: "activity", sortOrder: 5 },
    { area: "MENTAL_HEALTH", label: "Mental Health", color: "#8B5CF6", icon: "brain", sortOrder: 6 },
    { area: "GROWTH", label: "Growth", color: "#A855F7", icon: "sprout", sortOrder: 7 },
    { area: "FUN", label: "Fun", color: "#F97316", icon: "sparkles", sortOrder: 8 },
    { area: "PURPOSE", label: "Purpose", color: "#6366F1", icon: "compass", sortOrder: 9 },
  ],
  STUDENT: [
    { area: "CAREER", label: "School & studies", color: "#3B82F6", icon: "graduation-cap", sortOrder: 0 },
    { area: "MONEY", label: "Money & loans", color: "#F59E0B", icon: "dollar-sign", sortOrder: 1 },
    { area: "ROMANCE", label: "Dating life", color: "#EC4899", icon: "heart", sortOrder: 2 },
    { area: "FAMILY", label: "Home & family", color: "#F43F5E", icon: "users", sortOrder: 3 },
    { area: "FRIENDS", label: "Friends & roommates", color: "#14B8A6", icon: "users-round", sortOrder: 4 },
    { area: "PHYSICAL_HEALTH", label: "Health & sleep", color: "#84CC16", icon: "activity", sortOrder: 5 },
    { area: "MENTAL_HEALTH", label: "Stress & mood", color: "#8B5CF6", icon: "brain", sortOrder: 6 },
    { area: "GROWTH", label: "Skills & identity", color: "#A855F7", icon: "sprout", sortOrder: 7 },
    { area: "FUN", label: "Hobbies & weekends", color: "#F97316", icon: "sparkles", sortOrder: 8 },
    { area: "PURPOSE", label: "What it's all for", color: "#6366F1", icon: "compass", sortOrder: 9 },
  ],
  PARENT: [
    { area: "CAREER", label: "Work", color: "#3B82F6", icon: "briefcase", sortOrder: 0 },
    { area: "MONEY", label: "Household finances", color: "#F59E0B", icon: "wallet", sortOrder: 1 },
    { area: "ROMANCE", label: "Partner", color: "#EC4899", icon: "heart", sortOrder: 2 },
    { area: "FAMILY", label: "Kids & family", color: "#F43F5E", icon: "users", sortOrder: 3 },
    { area: "FRIENDS", label: "Friendships", color: "#14B8A6", icon: "users-round", sortOrder: 4 },
    { area: "PHYSICAL_HEALTH", label: "Health & energy", color: "#84CC16", icon: "activity", sortOrder: 5 },
    { area: "MENTAL_HEALTH", label: "Burnout & overwhelm", color: "#8B5CF6", icon: "brain", sortOrder: 6 },
    { area: "GROWTH", label: "Personal growth", color: "#A855F7", icon: "sprout", sortOrder: 7 },
    { area: "FUN", label: "Me-time", color: "#F97316", icon: "sparkles", sortOrder: 8 },
    { area: "PURPOSE", label: "What matters", color: "#6366F1", icon: "compass", sortOrder: 9 },
  ],
};
