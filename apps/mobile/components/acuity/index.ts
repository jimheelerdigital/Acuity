/**
 * Acuity design-system primitives (Slice Q3, 2026-05-19).
 *
 * Reference: _design/design_handoff_acuity_v2/acuity-chrome.jsx
 * Tokens: lib/theme/tokens.ts → makeAcuityTokens()
 *
 * All primitives:
 *   - Consume tokens via useTheme() — never hardcode colors.
 *   - Use `react-native-reanimated` v4 worklets API for motion.
 *   - Apply `fontVariant: ['tabular-nums']` on every numeric display.
 *
 * Import via the barrel:
 *   import { RingProgress, SegmentedTabs, ThemePill } from
 *     "@/components/acuity";
 */

export { GradientText, type GradientTextProps } from "./GradientText";
export { GlassPill, type GlassPillProps } from "./GlassPill";
export { RingProgress, type RingProgressProps } from "./RingProgress";
export { SegmentedTabs, type SegmentedTabsProps } from "./SegmentedTabs";
export { Sparkbar, type SparkbarProps } from "./Sparkbar";
export { ThemePill, type ThemePillProps, type ThemeKey } from "./ThemePill";
export {
  AcuityTabBar,
  type AcuityTabBarProps,
  type AcuityTabId,
} from "./AcuityTabBar";
export { HeroCard, type HeroCardProps } from "./HeroCard";
export { MiniRadar, type MiniRadarProps } from "./MiniRadar";
export { TierPill, type TierPillProps } from "./TierPill";
