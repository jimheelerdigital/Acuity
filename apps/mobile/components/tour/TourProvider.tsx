import { useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  SpotlightTourProvider,
  type TourStep,
  type TourState,
} from "react-native-spotlight-tour";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { requestAchievementCheck } from "@/lib/achievement-bus";
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

// The home route the tour opens on (mic + dashboard steps live here).
const HOME_PATH = "/(tabs)" as const;

// Each step now lives on its OWN screen and spotlights a real element
// label. The per-step `before` navigates to this route so the user sees
// the real page; the spotlight then anchors on that section's BOTTOM TAB
// BAR item (always mounted + measurable), teaching where the tab lives.
// Settings has no bottom tab, so step 7 returns HOME and spotlights the
// gear in the home header.
// Indexed by TOUR_STEP_INDEX order: mic, dashboard, entries, tasks,
// insights, goals, settings.
const TOUR_STEP_PATHS: string[] = [
  HOME_PATH, // mic
  HOME_PATH, // dashboard
  "/(tabs)/entries",
  "/(tabs)/tasks",
  "/(tabs)/insights",
  "/(tabs)/goals",
  HOME_PATH, // settings → home (spotlight the header gear, not a tab)
];

// How long to wait after switching tabs before the spotlight measures the
// target — lets the tab become visible + lay out. Tune in sim if a cutout
// lands before its screen settles.
const NAV_SETTLE_MS = 450;

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
  const router = useRouter();
  // The route the tour currently has on-screen. Seeded to home (the tour
  // opens there); used to skip a redundant navigate+settle when the next
  // step is on the same screen (mic → dashboard are both home).
  const lastPathRef = useRef<string>(HOME_PATH);

  const steps = useMemo<TourStep[]>(
    () =>
      TOUR_STEP_CONTENT.map((content, i) => ({
        // mic is a round button → circle spotlight; everything else is a
        // rectangular slot/card.
        shape:
          i === TOUR_STEP_INDEX.mic
            ? { type: "circle", padding: 10 }
            : { type: "rectangle", padding: 8 },
        // Targets in the BOTTOM tab bar (mic + the four tab items) get the
        // tooltip ABOVE ("top"); targets in the home header (dashboard
        // hero, settings gear) get it BELOW ("bottom"). Keeps the tooltip
        // fully on-screen (build-68: step 7 was clipped off the bottom).
        placement:
          i === TOUR_STEP_INDEX.dashboard || i === TOUR_STEP_INDEX.settings
            ? "bottom"
            : "top",
        // Navigate to this step's screen before it renders, so the spotlight
        // measures a visible target. Awaited by spotlight, so the step waits
        // for the tab to settle. Same-screen transitions skip the delay.
        before: async () => {
          void trackOnboardingEvent("tour_step_viewed", {
            value: String(i + 1),
          });
          const path = TOUR_STEP_PATHS[i] ?? HOME_PATH;
          if (path !== lastPathRef.current) {
            lastPathRef.current = path;
            router.navigate(path as never);
            await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
          } else if (i === TOUR_STEP_INDEX.mic) {
            // Step 0 (mic) opens on the same screen the tour started on, so
            // the branch above skips the settle — but the raised,
            // absolutely-positioned mic wrapper needs a beat to finish
            // layout before measureInWindow, or its cutout mis-measures and
            // lands mid-screen (vc24 bug: spotlight over the goal card
            // instead of the mic FAB). Give it the same settle steps 1–6 get.
            await new Promise((r) => setTimeout(r, NAV_SETTLE_MS));
          }
        },
        render: (props) => (
          <TourTooltip {...props} content={content} total={TOUR_TOTAL_STEPS} />
        ),
      })),
    [router]
  );

  const handleStop = useCallback(
    (state: TourState) => {
      // Reaching the last step = completion; stopping earlier = skip.
      const finished = state.isLast;
      // The tour now walks across tabs (ending on /profile). Return the
      // user home when it ends (finish or skip), and reset the path ref
      // so a later replay starts cleanly from home.
      router.navigate(HOME_PATH as never);
      lastPathRef.current = HOME_PATH;
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
      // tourCompletedAt afterward. `completed` gates the guided_start
      // achievement server-side: only a genuine finish (last step)
      // awards it; a skip stamps tourCompletedAt without the achievement.
      void api
        .post("/api/user/tour-complete", { completed: finished })
        .catch(() => {})
        .finally(() => {
          void refresh();
          // On genuine completion the server granted guided_start
          // (shownToUser=false). The celebration queue only re-polls on
          // mount/foreground/bus-ping — none of which fire here (user is
          // already on home, app foreground) — so ping the bus to make
          // the celebration modal appear. (Was: achievement granted but
          // modal never showed.)
          if (finished) requestAchievementCheck();
        });
    },
    [refresh, router]
  );

  return (
    <SpotlightTourProvider
      steps={steps}
      overlayColor="rgb(8, 8, 16)"
      overlayOpacity={0.78}
      motion="fade"
      // Tapping the overlay (incl. the highlighted target area) advances
      // to the next step rather than doing nothing — so a tap on the
      // spotlit element feels responsive. Explicit Skip (in the tooltip)
      // is the exit. On the last step, "continue" stops the tour.
      onBackdropPress="continue"
      arrow={{ color: tokens.cardBg }}
      shape={{ type: "rectangle", padding: 8 }}
      onStop={handleStop}
    >
      {children}
    </SpotlightTourProvider>
  );
}
