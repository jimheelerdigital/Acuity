import { useCallback, useMemo, type ReactNode } from "react";
import {
  SpotlightTourProvider,
  type TourStep,
  type TourState,
} from "react-native-spotlight-tour";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";
import { TourTooltip } from "./TourTooltip";
import {
  TOUR_STEP_CONTENT,
  TOUR_STEP_INDEX,
  TOUR_TOTAL_STEPS,
} from "./steps";

// Matches use-tour-trigger's ASYNC_STORAGE_KEY — written here on stop so
// a network failure can't re-fire the tour locally on the next launch.
const TOUR_COMPLETED_MARKER_KEY = "acuity.tour.completed";

/**
 * Wraps the app's navigator with react-native-spotlight-tour, replacing
 * react-native-copilot (which couldn't measure/render under the New
 * Architecture — 244 start() calls, 0 tooltip renders across 99 users;
 * see commit history). spotlight-tour measures via `measureInWindow`,
 * which works under Fabric.
 *
 * Mounted in app/_layout.tsx above the Stack (inside AuthProvider so
 * onStop can refresh()): the tour spans tabs (mic + tab labels) and the
 * Home screen (IdentityHero), so the provider must sit above all of them.
 *
 * Steps are defined here as an array (spotlight's model); each target
 * attaches by index via <AttachStep index={TOUR_STEP_INDEX.x}>. Analytics
 * + tourCompletedAt persistence — which copilot drove via copilotEvents —
 * now live on the per-step `before` (tour_step_viewed) and `onStop`
 * (tour_completed/skipped + POST /api/user/tour-complete) below.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const { tokens } = useTheme();
  const { refresh } = useAuth();

  const steps = useMemo<TourStep[]>(
    () =>
      TOUR_STEP_CONTENT.map((content, i) => ({
        // mic is a round button → circle spotlight; everything else is a
        // rectangular slot/card.
        shape:
          i === TOUR_STEP_INDEX.mic
            ? { type: "circle", padding: 10 }
            : { type: "rectangle", padding: 8 },
        before: () => {
          void trackOnboardingEvent("tour_step_viewed", {
            value: String(i + 1),
          });
        },
        render: (props) => (
          <TourTooltip {...props} content={content} total={TOUR_TOTAL_STEPS} />
        ),
      })),
    []
  );

  const handleStop = useCallback(
    (state: TourState) => {
      // Reaching the last step = completion; stopping earlier = skip.
      const finished = state.isLast;
      void trackOnboardingEvent(
        finished ? "tour_completed" : "tour_skipped",
        { value: String(state.index + 1) }
      );
      // Local marker first so a network failure doesn't re-fire the tour.
      AsyncStorage.setItem(
        TOUR_COMPLETED_MARKER_KEY,
        new Date().toISOString()
      ).catch(() => {});
      // Server persistence — fire-and-forget; refresh() pulls the new
      // tourCompletedAt afterward.
      void api
        .post("/api/user/tour-complete", {})
        .catch(() => {})
        .finally(() => {
          void refresh();
        });
    },
    [refresh]
  );

  return (
    <SpotlightTourProvider
      steps={steps}
      overlayColor="rgb(8, 8, 16)"
      overlayOpacity={0.78}
      motion="fade"
      onBackdropPress="stop"
      arrow={{ color: tokens.cardBg }}
      shape={{ type: "rectangle", padding: 8 }}
      onStop={handleStop}
    >
      {children}
    </SpotlightTourProvider>
  );
}
