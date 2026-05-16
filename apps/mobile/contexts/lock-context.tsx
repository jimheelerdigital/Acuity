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
  LOCK_TIMEOUT_MS,
  authenticate,
  isLockEnabled,
} from "@/lib/app-lock";
import { useAuth } from "@/contexts/auth-context";

/**
 * App-lock context. Sits above auth-context (consumer of useAuth)
 * but below the route tree — provider mounted inside AuthProvider in
 * _layout.tsx so we can short-circuit the lock when the user is
 * signed out (nothing to protect).
 *
 * Lock state machine:
 *   "checking"  — initial mount, reading SecureStore flag
 *   "unlocked"  — user is past the gate (or lock disabled, or signed out)
 *   "locked"    — show the overlay; require unlock() before rendering content
 *
 * Triggers that move "unlocked" → "locked":
 *   1. Cold launch when lock is enabled and user is signed in
 *   2. Foreground after backgrounded > LOCK_TIMEOUT_MS
 *
 * Triggers that move "locked" → "unlocked":
 *   Only authenticate() returning success.
 *
 * The overlay component reads `locked` and renders a full-screen gate
 * on top of the route tree when true.
 */

interface LockState {
  status: "checking" | "locked" | "unlocked";
  unlock: () => Promise<void>;
  /** Forces the lock to engage immediately (e.g., from a "Lock now"
   *  button if we add one). No-op when lock is disabled. */
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
  // Cache the enabled flag in memory so foreground transitions don't
  // hit SecureStore on every wake — re-read only when the toggle
  // changes (which happens via setLockEnabled from the Settings UI,
  // which then calls refreshEnabled()).
  const lockEnabled = useRef<boolean>(false);

  const refreshEnabled = useCallback(async () => {
    lockEnabled.current = await isLockEnabled();
  }, []);

  // Cold-launch sequence: wait for auth to resolve, then check the
  // SecureStore flag. If lock is enabled + user signed in → start
  // locked. Otherwise → start unlocked. "checking" is the intermediate
  // state so the overlay can render a neutral background instead of
  // flashing content underneath.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      await refreshEnabled();
      if (cancelled) return;
      if (lockEnabled.current && user) {
        setStatus("locked");
      } else {
        setStatus("unlocked");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, refreshEnabled]);

  // AppState transitions — track when we went to background and
  // re-lock on return if the gap exceeds the threshold.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        const prev = appState.current;
        appState.current = next;
        // active → background/inactive: stamp the time.
        if (
          prev === "active" &&
          (next === "background" || next === "inactive")
        ) {
          backgroundedAt.current = Date.now();
        }
        // background/inactive → active: maybe re-lock.
        if (
          (prev === "background" || prev === "inactive") &&
          next === "active"
        ) {
          if (!lockEnabled.current || !user) return;
          if (status === "locked") return; // already locked, no-op
          const bg = backgroundedAt.current;
          if (bg && Date.now() - bg > LOCK_TIMEOUT_MS) {
            setStatus("locked");
          }
        }
      }
    );
    return () => sub.remove();
  }, [status, user]);

  // Signed out → never locked. Drops the overlay if user signs out
  // while locked. Also re-reads enabled flag in case Settings flipped
  // it between renders.
  useEffect(() => {
    if (!user && status !== "checking") {
      setStatus("unlocked");
    }
  }, [user, status]);

  const unlock = useCallback(async () => {
    const res = await authenticate();
    if (res.success) {
      setStatus("unlocked");
      backgroundedAt.current = null;
    }
    // On failure, leave status locked — user can tap the overlay
    // again to retry.
  }, []);

  const lockNow = useCallback(async () => {
    await refreshEnabled();
    if (!lockEnabled.current || !user) return;
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
 * Called by the Settings UI after `setLockEnabled` to refresh the
 * in-memory cache. Without this, toggling lock-on in Settings
 * wouldn't take effect until the next cold launch or AppState wake.
 *
 * Hook variant: returns a function the Settings screen can call.
 */
export function useRefreshLockEnabled() {
  const ctx = useContext(LockContext);
  // The context doesn't expose the internal ref directly; instead,
  // call lockNow() which already re-reads the flag. Settings can
  // then trigger lockNow() to immediately engage the lock if the
  // user just turned it on.
  return ctx.lockNow;
}
