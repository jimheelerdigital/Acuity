/**
 * Acuity design-system primitives — web (Slice 1, 2026-05-22).
 *
 * Reference: `_design/DESIGN_SYSTEM.md` §5 primitives spec.
 * Tokens: `src/lib/theme/tokens.css` (CSS variables) +
 *          `tailwind.config.ts` (`acuity-*` color/radius/shadow scale).
 *
 * All primitives:
 *   - Read from `acuity-*` tokens — never hardcode hex.
 *   - Mirror the mobile shape in `apps/mobile/components/acuity/`.
 *   - Use the canonical pill radius (`acuity-pill`) on rounded
 *     surfaces, never `rounded-full` directly.
 *
 * Import via the barrel:
 *   import { Button, Card, ThemePill } from "@/components/acuity";
 *
 * Slice 1 ships these six primitives. The remaining set (HeroCard,
 * RingProgress, SegmentedTabs, GlassPill, GradientText,
 * GradientCheckbox, Sparkbar, TierPill, MiniRadar) lands as
 * consuming slices need them — no point building primitives ahead
 * of a confirmed consumer.
 */

export { Avatar, type AvatarProps } from "./Avatar";
export { Button, type ButtonProps } from "./Button";
export { Card, type CardProps } from "./Card";
export { HeroCard, type HeroCardProps } from "./HeroCard";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader";
export {
  SubscriptionPill,
  type SubscriptionPillProps,
  type SubscriptionStatus,
} from "./SubscriptionPill";
export { ThemePill, type ThemePillProps, type ThemeKey } from "./ThemePill";
