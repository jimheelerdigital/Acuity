import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { useSpotlightTour } from "react-native-spotlight-tour";

import { useAuth } from "@/contexts/auth-context";
import { trackOnboardingEvent } from "@/lib/onboarding-events";

/**
 * Trigger for the first-login product tour. Mounted from the Home tab
 * (apps/mobile/app/(tabs)/index.tsx) so the gates evaluate after the user
 * has landed on the dashboard.
 *
 * Engine: react-native-spotlight-tour (Fabric-safe). The walkthrough's
 * STEP DEFINITIONS, per-step analytics (tour_step_viewed), and the
 * tour_completed/skipped + tourCompletedAt persistence all live on
 * TourProvider (steps[].before + onStop). This hook only decides WHEN to
 * call start():
 *   - first-login auto-fire (all gates pass), or
 *   - manual replay (force flag set by the Settings button), which fires
 *     on Home FOCUS so the spotlight measures a mounted, visible target.
 *
 * Build-67/68 instrumentation: emits tour.start.called / .threw and (in
 * TourTooltip) tour.tooltip.rendered, so production Sentry proves the
 * render path is reached — the signal that gates the v1.3 submission.
 */

const ASYNC_STORAGE_KEY = "acuity.tour.completed";
/**
 * Set by the "Replay product tour" button in Profile before it navigates
 * home. When present, the focus trigger fires the tour even for users who
 * have recordings and a prior completion — the first-login gates are for
 * the AUTO-fire, not an explicit replay.
 */
export const TOUR_FORCE_REPLAY_KEY = "acuity.tour.forceReplay";
const POST_MOUNT_DELAY_MS = 500;

/**
 * Fire the tour (spotlight `start()` always begins at step 0) with
 * analytics + instrumentation. start() is wrapped so a throw is captured
 * rather than swallowed.
 */
function fireTourStart(path: "auto" | "replay", start: () => void): void {
  void trackOnboardingEvent("tour_started", { value: path });
  Sentry.captureMessage(`tour.start.called path=${path}`, "info");
  try {
    start();
  } catch (e) {
    Sentry.captureMessage(`tour.start.threw ${String(e)}`, "warning");
  }
}

interface Options {
  /** If true, the tour waits (reserved for a future achievement-queue gate). */
  queueHasItem?: boolean;
}

export function useTourTrigger({ queueHasItem = false }: Options = {}) {
  const { user } = useAuth();
  const { start } = useSpotlightTour();
  // Prevents a re-render churn loop from re-triggering within a mount.
  const firedRef = useRef<boolean>(false);

  // First-login AUTO-fire on home mount. All gates must pass.
  useEffect(() => {
    if (firedRef.current) return;
    if (!user) return;
    if (!user.onboardingCompleted) return;
    if ((user.totalRecordings ?? 0) > 0) return;
    if (user.tourCompletedAt != null) return;
    if (queueHasItem) return;

    let cancelled = false;
    void (async () => {
      // Double-check the local marker — the user may have just completed
      // the tour on this device before the /me refresh landed.
      const localMarker = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
      if (cancelled || localMarker) return;
      // 500ms after mount so a celebration modal wins the race if one was
      // going to fire.
      await new Promise((r) => setTimeout(r, POST_MOUNT_DELAY_MS));
      if (cancelled) return;
      firedRef.current = true;
      fireTourStart("auto", start);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queueHasItem, start]);

  // Manual replay — fires when the Home tab gains FOCUS and the force flag
  // is set (the Replay button sets it, then navigates here). Focus-based so
  // the spotlight measures a mounted, visible target, and so refresh()
  // churn can't cancel the run that calls start(). Bypasses the first-login
  // gates (explicit, user-initiated override).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const flag = await AsyncStorage.getItem(TOUR_FORCE_REPLAY_KEY);
        if (cancelled || !flag) return;
        await AsyncStorage.removeItem(TOUR_FORCE_REPLAY_KEY);
        await AsyncStorage.removeItem(ASYNC_STORAGE_KEY);
        firedRef.current = true;
        await new Promise((r) => setTimeout(r, POST_MOUNT_DELAY_MS));
        if (cancelled) return;
        Sentry.captureMessage("tour.replay.flagConsumed firing start()", "info");
        fireTourStart("replay", start);
      })();
      return () => {
        cancelled = true;
      };
    }, [start])
  );
}
