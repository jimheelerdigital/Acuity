import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef } from "react";
import { useCopilot } from "react-native-copilot";

import { useAuth } from "@/contexts/auth-context";
import { api } from "@/lib/api";
import { trackOnboardingEvent } from "@/lib/onboarding-events";

/**
 * Trigger logic for the first-login product tour. v1.3.x (2026-06-03).
 *
 * Mounted from the Home tab (apps/mobile/app/(tabs)/index.tsx) so the
 * gates evaluate after the user has actually landed on the dashboard.
 *
 * Auto-fires the copilot walkthrough when ALL of:
 *   1. User.tourCompletedAt is null/undefined (not yet done, not skipped)
 *   2. User.onboardingCompleted === true (we don't run tours mid-onboarding)
 *   3. User.totalRecordings === 0 (user hasn't already found the button)
 *   4. AsyncStorage marker `acuity.tour.completed` is not set (handles
 *      the network-flakey case where the server hasn't replied yet)
 *   5. The achievement queue is empty (don't stack two modals)
 *   6. 500ms have elapsed since home mount (let the celebration modal
 *      win the race if a milestone was earned by the last entry)
 *
 * Once started, copilotEvents emits start / stepChange / stop. The
 * orchestrator wires those to analytics + persistence:
 *   - start                → tour_started
 *   - stepChange           → tour_step_viewed (with step #)
 *   - stop pre-final-step  → tour_skipped + POST /api/user/tour-complete
 *   - stop on final step   → tour_completed + POST /api/user/tour-complete
 *
 * Both stop paths write tourCompletedAt server-side (and update the
 * AsyncStorage marker) so the tour doesn't keep nagging.
 */

const ASYNC_STORAGE_KEY = "acuity.tour.completed";
const POST_MOUNT_DELAY_MS = 500;
const FIRST_STEP_NAME = "mic";

interface Options {
  /**
   * Optional gate — if true, the tour waits to fire. v1.3.x ships
   * with this always false; future work can wire a global achievement-
   * queue context to avoid overlapping the celebration modal.
   */
  queueHasItem?: boolean;
}

export function useTourTrigger({ queueHasItem = false }: Options = {}) {
  const { user, refresh } = useAuth();
  const { start, copilotEvents, totalStepsNumber } = useCopilot();
  // Tracks whether THIS mount has already fired (or attempted to fire)
  // the tour. Prevents a re-render churn loop from re-triggering.
  const firedRef = useRef<boolean>(false);
  // Tracks whether we've subscribed to copilot events. Subscribed
  // exactly once on first start so the listeners don't multiply.
  const subscribedRef = useRef<boolean>(false);
  // Tracks the most recent step number reached, so a stop() can
  // attribute the skip to the right step.
  const lastStepRef = useRef<number>(0);

  // Subscribe once to copilot events. The listeners write analytics
  // and persist tourCompletedAt on stop.
  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    const onStart = () => {
      lastStepRef.current = 1;
      void trackOnboardingEvent("tour_started");
    };
    const onStepChange = (step: { order?: number } | undefined) => {
      const n = step?.order ?? lastStepRef.current;
      lastStepRef.current = n;
      void trackOnboardingEvent("tour_step_viewed", { value: String(n) });
    };
    const onStop = () => {
      // stop fires on both finish (last step → next) AND user-cancel.
      // We can't reliably tell which from the event itself; instead,
      // we compare the last step the user saw against the total step
      // count. Reaching the final step = completion; anything earlier
      // = skip.
      const lastStep = lastStepRef.current;
      const finished = lastStep >= totalStepsNumber && totalStepsNumber > 0;
      void trackOnboardingEvent(
        finished ? "tour_completed" : "tour_skipped",
        { value: String(lastStep) }
      );
      // Local marker first so a network failure doesn't re-fire the
      // tour on the next home mount.
      AsyncStorage.setItem(ASYNC_STORAGE_KEY, new Date().toISOString()).catch(
        () => {}
      );
      // Server persistence. Fire-and-forget — refresh() pulls the new
      // tourCompletedAt + the guided_start UserAchievement row. The
      // refresh happens whether or not the POST succeeded; worst case
      // the AsyncStorage marker keeps the tour from firing again
      // locally until the next /me succeeds.
      void api
        .post<{ ok: boolean; awarded: boolean }>("/api/user/tour-complete", {})
        .catch(() => {})
        .finally(() => {
          void refresh();
        });
    };

    copilotEvents.on("start", onStart);
    copilotEvents.on("stepChange", onStepChange);
    copilotEvents.on("stop", onStop);

    return () => {
      copilotEvents.off("start", onStart);
      copilotEvents.off("stepChange", onStepChange);
      copilotEvents.off("stop", onStop);
    };
  }, [copilotEvents, refresh, totalStepsNumber]);

  // Auto-fire on home mount when all gates pass.
  useEffect(() => {
    if (firedRef.current) return;
    if (!user) return;
    if (!user.onboardingCompleted) return;
    if ((user.totalRecordings ?? 0) > 0) return;
    if (user.tourCompletedAt != null) return;
    if (queueHasItem) return;

    let cancelled = false;
    void (async () => {
      // Double-check the AsyncStorage marker — the user may have
      // completed the tour just now on this same device but the /me
      // refresh hasn't landed yet.
      const localMarker = await AsyncStorage.getItem(ASYNC_STORAGE_KEY);
      if (cancelled || localMarker) return;
      // 500ms after mount so the celebration modal wins if it was
      // going to fire.
      await new Promise((r) => setTimeout(r, POST_MOUNT_DELAY_MS));
      if (cancelled) return;
      firedRef.current = true;
      void start(FIRST_STEP_NAME);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, queueHasItem, start]);
}
