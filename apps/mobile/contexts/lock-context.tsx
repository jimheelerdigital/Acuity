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
 * v1.3 lock-loop fix (2026-06-03, mostdaysnicole repro):
 *   The cold-launch effect previously depended on `user`, so any
 *   identity-change of the user object (which happens every time
 *   useAuth re-fetches /api/user/me) would re-run the lock check
 *   and re-lock immediately after a successful unlock. Symptom:
 *   infinite lock/unlock loop with Face ID re-prompting forever.
 *
 *   Fix: initializedRef guards the cold-launch check to fire EXACTLY
 *   ONCE per app launch. Subsequent re-locks happen only via the
 *   AppState handler when the user backgrounds for > LOCK_TIMEOUT_MS.
 *   unlockedThisSessionRef remembers the unlocked state across user
 *   identity changes so /me refetches don't re-trigger anything.
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
  // Cold-launch lock check runs ONCE per app launch. Prevents
  // re-lock on user-object identity changes (e.g., /me refetches).
  const initializedRef = useRef<boolean>(false);
  // Tracks whether the user has authenticated this session. Reset
  // only on signout or AppState backgrounded > LOCK_TIMEOUT_MS.
  const unlockedThisSessionRef = useRef<boolean>(false);

  const refreshEnabled = useCallback(async () => {
    lockEnabled.current = await isLockEnabled();
  }, []);

  // Cold-launch sequence: wait for auth to resolve, then check the
  // SecureStore flag ONCE. If lock is enabled + user signed in →
  // start locked. Otherwise → start unlocked. Subsequent user-object
  // identity changes (e.g., /me refetches) do NOT re-run this check.
  useEffect(() => {
    if (authLoading) return;
    if (initializedRef.current) return;
    let cancelled = false;
    (async () => {
      await refreshEnabled();
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
            unlockedThisSessionRef.current = false;
            setStatus("locked");
          }
        }
      }
    );
    return () => sub.remove();
  }, [status, user]);

  // Signed out → never locked. Drops the overlay if user signs out
  // while locked. Also resets the session-unlocked + initialized
  // markers so the next sign-in re-runs the cold-launch check.
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
    // On failure (cancel, lockout, etc.) — leave status locked. The
    // overlay surfaces a button so the user can retry; after 3 fails
    // it shows a fallback hint. Persistent biometric lockouts are an
    // OS-level state and resolve when the user uses the device
    // passcode at the OS prompt.
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
