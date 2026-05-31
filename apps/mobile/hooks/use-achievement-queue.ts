/**
 * Achievement celebration queue hook.
 *
 * Triggers a fetch of /api/achievements/pending on:
 *   - mount (app cold start, after auth resolves)
 *   - foreground transition (AppState background → active)
 *   - explicit `notify()` call from callers (e.g., the record screen
 *     after a successful entry processing run)
 *
 * Pending items are queued and shown one at a time via the consumer's
 * CelebrationModal. The current item flips to shown via POST /seen
 * before the next one is dequeued, so a cold-launch with 3 pending
 * badges plays the modal three times sequentially without losing any.
 *
 * This hook does NOT render the modal — it returns the current item
 * + a handler. The caller wraps the modal at a high level (root
 * layout or tabs layout) so the modal sits above every screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  fetchPending,
  markAchievementSeen,
  type PendingItem,
} from "@/lib/achievements-api";

export function useAchievementQueue(opts: { enabled: boolean }) {
  const { enabled } = opts;
  const [queue, setQueue] = useState<PendingItem[]>([]);
  const inFlightRef = useRef(false);
  const lastFetchRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) return;
    // Debounce — never poll more than once every 2s, regardless of how
    // many triggers fire in close succession (cold launch + foreground
    // + post-record can all fire within a second).
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;
    inFlightRef.current = true;
    try {
      const res = await fetchPending();
      if (res.items.length === 0) return;
      // Append any items not already in our local queue (dedup by
      // UserAchievement.id) so a re-fetch mid-celebration doesn't
      // disrupt the in-progress modal.
      setQueue((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const next = res.items.filter((i) => !existing.has(i.id));
        return next.length === 0 ? prev : [...prev, ...next];
      });
    } catch {
      // Non-fatal — try again on the next trigger.
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  // Mount + foreground transitions
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [enabled, refresh]);

  const current = queue[0] ?? null;

  const dismiss = useCallback(async () => {
    if (!current) return;
    // Mark seen + dequeue. We fire the POST as fire-and-forget — if it
    // fails the next fetchPending will surface this row again and we'll
    // re-show, which is recoverable. Blocking the UI on the request
    // would risk the same trap pattern we fixed in build 55.
    void markAchievementSeen(current.id).catch(() => {});
    setQueue((prev) => prev.slice(1));
  }, [current]);

  return { current, dismiss, notify: refresh };
}
