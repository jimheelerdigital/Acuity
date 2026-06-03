import { type ReactNode } from "react";
import { CopilotProvider } from "react-native-copilot";

import { useTheme } from "@/contexts/theme-context";
import { TourTooltip } from "./TourTooltip";

/**
 * Wraps the app's tab navigator with react-native-copilot's
 * CopilotProvider, configured with Acuity's design tokens + custom
 * tooltip component.
 *
 * Why mount in app/_layout.tsx (above the Stack, inside ThemeProvider):
 *   The tour highlights elements ACROSS tabs (mic, four tab labels,
 *   IdentityHero, avatar). Copilot needs a single Provider above all
 *   of them so its step registry sees everything. Mounting above the
 *   Stack is the simplest correct scope.
 *
 * Overlay style:
 *   - SVG overlay = smooth animated cutout. We pick SVG over the
 *     legacy view overlay because the SVG path can ease between
 *     step positions cleanly; view-mode only translates instantly.
 *   - backdropColor matches the CelebrationModal scrim so the tour
 *     reads as part of the same visual family.
 *   - stopOnOutsideClick=true so a tap outside the tooltip exits the
 *     tour (and our orchestrator persists tourCompletedAt either way).
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <CopilotProvider
      tooltipComponent={TourTooltip}
      overlay="svg"
      animated
      animationDuration={200}
      backdropColor="rgba(8, 8, 16, 0.78)"
      margin={8}
      arrowColor={tokens.cardBg}
      stopOnOutsideClick
      labels={{
        skip: "Skip",
        previous: "Back",
        next: "Next",
        finish: "Get started",
      }}
    >
      {children}
    </CopilotProvider>
  );
}
