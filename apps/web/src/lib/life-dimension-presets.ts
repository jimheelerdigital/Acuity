// Preset templates for the Configurable Life Matrix. Each preset is a
// 6-row override of the canonical LIFE_AREAS display layer — label,
// description, color, and icon. The underlying `area` enum never
// changes, so extraction + goals + LifeMapArea keep speaking the same
// vocabulary regardless of which preset the user picks.

export type LifeDimensionRow = {
  area: "CAREER" | "HEALTH" | "RELATIONSHIPS" | "FINANCES" | "PERSONAL" | "OTHER";
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
    { area: "HEALTH", label: "Health", color: "#14B8A6", icon: "heart-pulse", sortOrder: 1 },
    { area: "RELATIONSHIPS", label: "Relationships", color: "#F43F5E", icon: "users", sortOrder: 2 },
    { area: "FINANCES", label: "Finances", color: "#F59E0B", icon: "trending-up", sortOrder: 3 },
    { area: "PERSONAL", label: "Personal Growth", color: "#A855F7", icon: "sparkles", sortOrder: 4 },
    { area: "OTHER", label: "Other", color: "#71717A", icon: "more-horizontal", sortOrder: 5 },
  ],
  STUDENT: [
    { area: "CAREER", label: "School & studies", color: "#3B82F6", icon: "graduation-cap", sortOrder: 0 },
    { area: "HEALTH", label: "Health & sleep", color: "#14B8A6", icon: "heart-pulse", sortOrder: 1 },
    { area: "RELATIONSHIPS", label: "Friends & family", color: "#F43F5E", icon: "users", sortOrder: 2 },
    { area: "FINANCES", label: "Money", color: "#F59E0B", icon: "dollar-sign", sortOrder: 3 },
    { area: "PERSONAL", label: "Growth & identity", color: "#A855F7", icon: "sparkles", sortOrder: 4 },
    { area: "OTHER", label: "Other", color: "#71717A", icon: "more-horizontal", sortOrder: 5 },
  ],
  PARENT: [
    { area: "CAREER", label: "Work", color: "#3B82F6", icon: "briefcase", sortOrder: 0 },
    { area: "HEALTH", label: "Health & energy", color: "#14B8A6", icon: "heart-pulse", sortOrder: 1 },
    { area: "RELATIONSHIPS", label: "Family & partner", color: "#F43F5E", icon: "users", sortOrder: 2 },
    { area: "FINANCES", label: "Household finances", color: "#F59E0B", icon: "trending-up", sortOrder: 3 },
    { area: "PERSONAL", label: "Me-time", color: "#A855F7", icon: "sparkles", sortOrder: 4 },
    { area: "OTHER", label: "Other", color: "#71717A", icon: "more-horizontal", sortOrder: 5 },
  ],
};
