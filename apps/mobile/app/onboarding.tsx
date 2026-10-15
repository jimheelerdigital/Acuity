import { View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * /onboarding — the legacy post-signup onboarding used to live here.
 * Removed in 1.9.1 (Jimmy, 2026-10-15: "the old funnel shouldn't even
 * exist"). The route file stays only so a stale link or old navigation
 * state can't hit "unmatched route": it renders a blank themed screen and
 * AuthGate (app/_layout.tsx → decideColdStartRoute) immediately sends the
 * person to the right place — the new funnel if they haven't recorded yet,
 * otherwise Home.
 */
export default function LegacyOnboardingGone() {
  const { tokens } = useTheme();
  return <View style={{ flex: 1, backgroundColor: tokens.bg }} />;
}
