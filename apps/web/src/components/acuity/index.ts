/**
 * Acuity design-system primitives — web (Slice 1 + slice 8, 2026-05-22).
 *
 * Reference: `_design/DESIGN_SYSTEM.md` §5 primitives spec.
 * Tokens: `src/lib/theme/tokens.css` + `tailwind.config.ts`.
 *
 * All primitives:
 *   - Read from `acuity-*` tokens — never hardcode hex.
 *   - Mirror the mobile shape in `apps/mobile/components/acuity/`.
 *   - Use the canonical pill radius (`acuity-pill`) on rounded
 *     surfaces, never `rounded-full` directly.
 *
 * Import via the barrel:
 *   import { Button, Card, HeroCard, RingProgress } from
 *     "@/components/acuity";
 */

export { Avatar, type AvatarProps } from "./Avatar";
export { Button, type ButtonProps } from "./Button";
export { Card, type CardProps } from "./Card";
export {
  GradientCheckbox,
  type GradientCheckboxProps,
} from "./GradientCheckbox";
export {
  GradientText,
  type GradientTextProps,
  type GradientTextVariant,
} from "./GradientText";
export { GlassPill, type GlassPillProps, type GlassPillTint } from "./GlassPill";
export { HeroCard, type HeroCardProps } from "./HeroCard";
export { MiniRadar, type MiniRadarProps } from "./MiniRadar";
export { RingProgress, type RingProgressProps } from "./RingProgress";
export {
  SectionHeader,
  type SectionHeaderProps,
} from "./SectionHeader";
export {
  SegmentedTabs,
  type SegmentedTabsProps,
} from "./SegmentedTabs";
export { Sparkbar, type SparkbarProps } from "./Sparkbar";
export {
  SubscriptionPill,
  type SubscriptionPillProps,
  type SubscriptionStatus,
} from "./SubscriptionPill";
export { ThemePill, type ThemePillProps, type ThemeKey } from "./ThemePill";
