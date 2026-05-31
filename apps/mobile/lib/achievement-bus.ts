/**
 * Tiny pub/sub bus that lets non-React code (the entry-polling hook,
 * future event handlers, etc.) ask the achievement-queue hook to
 * re-fetch /pending immediately.
 *
 * Why a bus and not a context: useAchievementQueue is mounted once
 * at the root in app/_layout.tsx via <AchievementsCelebrationMount/>.
 * Lifting it into a context would require wrapping the tree at the
 * exact same root + threading a `notify` function down to call sites,
 * which adds rerender churn for one-line consumers (e.g.,
 * use-entry-polling.ts firing on a status transition). The bus is
 * one module-level Set + two stable callbacks; no context, no
 * context value churn, no extra render passes.
 *
 * Idempotency: subscribers are responsible for their own debouncing.
 * useAchievementQueue already debounces fetches to a 2s floor inside
 * refresh(), so a burst of requestAchievementCheck() calls collapses
 * into one network request.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Subscribe to achievement-check requests. Returns an unsubscribe
 * function — call it in useEffect cleanup to prevent stale closures.
 */
export function subscribeToAchievementChecks(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Notify all subscribers that something happened (e.g. an entry just
 * finished processing) that may have unlocked new badges and the
 * queue should re-poll /pending. Each listener runs in its own
 * try/catch so a bad subscriber can't break the others.
 */
export function requestAchievementCheck(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* swallow — caller debounces internally */
    }
  }
}
