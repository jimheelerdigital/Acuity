import { useCallback } from "react";

import { cachedGet } from "@/lib/cache";
import { isOpenNow, type TodayTaskInput } from "@/lib/today-tasks";
import { getWhatsNewState, loadWhatsNewState } from "@/lib/whats-new-state";

import { useTourMode } from "./TourProvider";
import {
  fullTour,
  singleStop,
  type WhatsNewTourContext,
  type WhatsNewTourRequest,
} from "./whats-new-tour";

const TASKS_CACHE_KEY = "/api/tasks?all=1";

async function tourContext(): Promise<WhatsNewTourContext> {
  try {
    const res = await cachedGet<{ tasks: TodayTaskInput[] }>(TASKS_CACHE_KEY);
    const tasks = res.tasks ?? [];
    const now = Date.now();
    return {
      hasOpenTasks: tasks.some((t) => t.status !== "DONE"),
      hasTaskRow: tasks.some((t) => isOpenNow(t, now)),
    };
  } catch {
    return { hasOpenTasks: false, hasTaskRow: false };
  }
}

/**
 * Starts the What's New tour: everything ("Show me around") or one item.
 * Must be called from inside TourProvider (any screen under the root
 * layout is).
 */
export function useWhatsNewTour() {
  const { prepareWhatsNewTour, showWhatsNewCard } = useTourMode();

  const run = useCallback(
    (req: WhatsNewTourRequest | null) => {
      if (!req || req.cards.length === 0) return;
      prepareWhatsNewTour(req);
      // Through the provider, not spotlight's goTo: the first card can be
      // a screen stop (1.9.5 opens /record).
      showWhatsNewCard(0);
    },
    [prepareWhatsNewTour, showWhatsNewCard]
  );

  /** `onlyUnexplored`: "Continue the tour" — skip stops already seen. */
  const startAll = useCallback(
    async (opts?: { onlyUnexplored?: boolean }) => {
      await loadWhatsNewState();
      const s = getWhatsNewState();
      let items = s.release?.items ?? [];
      if (opts?.onlyUnexplored) {
        const left = items.filter((i) => i.tour && !s.explored.includes(i.id));
        if (left.length > 0) items = left;
      }
      run(fullTour(items, await tourContext()));
    },
    [run]
  );

  const startItem = useCallback(
    async (itemId: string) => {
      await loadWhatsNewState();
      const item = getWhatsNewState().release?.items.find((i) => i.id === itemId);
      if (!item) return;
      run(singleStop(item, await tourContext()));
    },
    [run]
  );

  return { startAll, startItem };
}
