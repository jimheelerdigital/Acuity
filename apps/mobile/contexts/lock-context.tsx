import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  authenticate,
  autoLockThresholdMs,
  getAutoLockMinutes,
  isLockEnabled,
  type AutoLockMinutes,
} from "@/lib/app-lock";
import { useAuth } from "@/contexts/auth-context";

/**
 * App-lock context. Sits above auth-context (consumer of useAuth)
 * but below the route tree.
 *
 * Lock state machine:
 *   "checking"  — initial mount, reading SecureStore flag
 *   "unlocked"  — past the gate (or lock disabled, or signed out)
 *   "locked"    — show overlay; require unlock() before rendering
 *
 * Triggers that move "unlocked" → "locked":
 *   1. Cold launch when lock enabled and user signed in
 *   2. Foreground after backgrounded > user's autoLockMinutes
 *
 * Triggers that move "locked" → "unlocked":
 *   Only authenticate() returning success.
 *
 * v1.3.x Face ID UX rewrite (2026-06-03):
 *   - NO in-app inactivity timer. While the app is foregrounded
 *     and the user is interacting, the lock never engages. This
 *     was the headline complaint: "App re-locks after 30 seconds
 *     of in-app inactivity." The previous code stamped
 *     `backgroundedAt` whenever AppState went `active → inactive`,
 *     so a Control Center pull, a notification banner, or even
 *     iOS auto-dim could make the user feel like they were being
 *     re-locked while still using the app.
 *   - We now ONLY react to `background` state (not `inactive`).
 *     "inactive" is a transient OS interruption — banners, system
 *     dialogs, Face ID prompts themselves, screen lock peeks. We
 *     ignore it entirely.
 *   - Threshold is user-configurable via Settings → Security:
 *     Immediately (0), 1, 2 (default), 5, 15 min, or Never on
 *     resume. Reading the stored value on every relevant AppState
 *     transition means a setting change takes effect on the very
 *     next background → foreground cycle.
 *
 * v1.3 (2026-06-03) initialization-loop fix preserved:
 *   `initializedRef` keeps the cold-launch lock check from re-firing
 *   on user-object identity changes (every /api/user/me refetch).
 */

interface LockState {
  status: "checking" | "locked" | "unlocked";
  unlock: () => Promise<void>;
  /** Forces the lock to engage immediately. No-op if lock disabled. */
  lockNow: () => Promise<void>;
}

const LockContext = createContext<LockState>({
  status: "unlocked",
  unlock: async () => {},
  lockNow: async () => {},
});

export function LockProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<LockState["status"]>("checking");
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const lockEnabled = useRef<boolean>(false);
  // Threshold cached in ms. Refreshed on cold-launch + on every
  // background transition so a Settings change takes effect on the
  // next relevant AppState event without needing a remount.
  const autoLockMs = useRef<number>(2 * 60_000);
  const initializedRef = useRef<boolean>(false);
  const unlockedThisSessionRef = useRef<boolean>(false);

  const refreshEnabled = useCallback(async () => {
    lockEnabled.current = await isLockEnabled();
  }, []);

  const refreshAutoLockThreshold = useCallback(async () => {
    const minutes: AutoLockMinutes = await getAutoLockMinutes();
    autoLockMs.current = autoLockThresholdMs(minutes);
  }, []);

  // Cold-launch sequence: wait for auth, then check the lock flag
  // ONCE. user-object identity changes (e.g. /me refetches) don't
  // re-run this — `initializedRef` is the gate.
  useEffect(() => {
    if (authLoading) return;
    if (initializedRef.current) return;
    let cancelled = false;
    (async () => {
      await Promise.all([refreshEnabled(), refreshAutoLockThreshold()]);
      if (cancelled) return;
      initializedRef.current = true;
      if (lockEnabled.current && user) {
        setStatus("locked");
      } else {
        setStatus("unlocked");
        unlockedThisSessionRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, refreshEnabled, refreshAutoLockThreshold]);

  // AppState transitions — track when we went to background and
  // re-lock on return if the gap exceeds the user's threshold.
  //
  // CRITICAL: we only react to `background`, NOT `inactive`. iOS
  // fires `inactive` for transient interruptions (Control Center,
  // notifications, Face ID prompts, system dialogs) — none of
  // those should re-lock the app.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        const prev = appState.current;
        appState.current = next;
        // active → background: stamp the time. Treat the moment
        // we lose focus to the home screen / app switcher / OS lock
        // as the start of "user is not looking at us".
        if (prev === "active" && next === "background") {
          backgroundedAt.current = Date.now();
          // Re-read the threshold now so a setting change made
          // mid-session takes effect on the next return-to-foreground.
          void refreshAutoLockThreshold();
        }
        // background → active: maybe re-lock.
        if (prev === "background" && next === "active") {
          if (!lockEnabled.current || !user) return;
          if (status === "locked") return;
          const bg = backgroundedAt.current;
          // "Immediately on background" sets the threshold to 0,
          // so any background→active transition re-locks. "Never on
          // resume" sets the threshold to Infinity, so the
          // comparison is never true. Regular values (1, 2, 5, 15
          // minutes) fall in between.
          if (bg !== null && Date.now() - bg >= autoLockMs.current) {
            unlockedThisSessionRef.current = false;
            setStatus("locked");
          }
        }
      }
    );
    return () => sub.remove();
  }, [status, user, refreshAutoLockThreshold]);

  // Signed out → never locked. Drops overlay if user signs out
  // while locked. Resets initialized + session-unlocked markers
  // so the next sign-in re-runs the cold-launch check clean.
  useEffect(() => {
    if (!user && status !== "checking") {
      unlockedThisSessionRef.current = false;
      initializedRef.current = false;
      setStatus("unlocked");
    }
  }, [user, status]);

  const unlock = useCallback(async () => {
    const res = await authenticate();
    if (res.success) {
      unlockedThisSessionRef.current = true;
      setStatus("unlocked");
      backgroundedAt.current = null;
    }
    // On failure (cancel / lockout / hardware unavailable) — leave
    // status locked. The overlay surfaces a retry button and after
    // 3 fails shows the "Use device passcode" hint. Persistent
    // biometric lockouts resolve via OS passcode at the system prompt
    // (authenticate() passes disableDeviceFallback:false so the
    // passcode fallback is offered automatically).
  }, []);

  const lockNow = useCallback(async () => {
    await refreshEnabled();
    if (!lockEnabled.current || !user) return;
    unlockedThisSessionRef.current = false;
    setStatus("locked");
  }, [refreshEnabled, user]);

  return (
    <LockContext.Provider value={{ status, unlock, lockNow }}>
      {children}
    </LockContext.Provider>
  );
}

export function useLock() {
  return useContext(LockContext);
}

/**
 * Called by the Settings UI after `setLockEnabled` / `setAutoLockMinutes`
 * to refresh the in-memory caches. Without this, toggling lock-on or
 * changing the auto-lock interval in Settings wouldn't take effect
 * until the next cold launch or AppState background.
 *
 * Returns `lockNow` so the Settings screen can also engage the lock
 * immediately after the user just turned the feature on.
 */
export function useRefreshLockEnabled() {
  const ctx = useContext(LockContext);
  return ctx.lockNow;
}
