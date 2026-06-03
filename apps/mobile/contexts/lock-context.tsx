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
  getCachedAutoLockMinutes,
  isLockEnabled,
  primeAutoLockCache,
  primeAutoLockCacheFromServer,
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
 *   2. Foreground after backgrounded ≥ user's autoLockMinutes
 *
 * Triggers that move "locked" → "unlocked":
 *   Only authenticate() returning success.
 *
 * v1.3.x Face ID UX rewrite (2026-06-03), HARDENED 2026-06-03 P0 pass:
 *
 *   Bug 1 root cause: iOS's AppState transitions for the home button
 *   go `active → inactive → background` — not `active → background`
 *   directly. The original v1.3.x code gated stamping on
 *   `prev === "active" && next === "background"`, which never matched
 *   the iOS reality (prev was always "inactive" by the time
 *   next === "background"). So `backgroundedAt.current` stayed null,
 *   and on resume the elapsed check short-circuited. Symptom: app
 *   NEVER locked on background no matter the threshold.
 *
 *   Fix: stamp whenever we LAND on "background" (any prev),
 *   un-stamp on any return to "active". Control-Center pulls etc
 *   stay ignored because they fire "active → inactive → active"
 *   without ever passing through "background".
 *
 *   Bug 1 secondary cause: the threshold was read async on every
 *   background event. A fast Cmd-H + reopen (<200ms) finished
 *   before the AsyncStorage read resolved, so the foreground check
 *   used the stale prior threshold. Symptom: setting "Immediately"
 *   in Settings, backgrounding, and quickly returning didn't lock.
 *
 *   Fix: read the threshold synchronously via
 *   `getCachedAutoLockMinutes()`. The cache is updated synchronously
 *   in `setAutoLockMinutes()` so a Settings change takes effect on
 *   the next AppState event without any awaits.
 *
 * Initialization-loop fix preserved:
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
  // Cache the enabled flag in memory so foreground transitions don't
  // hit SecureStore on every wake.
  const lockEnabled = useRef<boolean>(false);
  // Cold-launch lock check runs ONCE per app launch. Prevents
  // re-lock on user-object identity changes (e.g., /me refetches).
  const initializedRef = useRef<boolean>(false);

  const refreshEnabled = useCallback(async () => {
    lockEnabled.current = await isLockEnabled();
  }, []);

  // Cold-launch sequence: wait for auth, then check the lock flag
  // ONCE. user-object identity changes (e.g. /me refetches) don't
  // re-run this — `initializedRef` is the gate.
  useEffect(() => {
    if (authLoading) return;
    if (initializedRef.current) return;
    let cancelled = false;
    (async () => {
      // Prime the synchronous threshold cache + lock-enabled flag
      // before we touch state. After these resolve, the AppState
      // handler below will read the right values on the first wake.
      await Promise.all([refreshEnabled(), primeAutoLockCache()]);
      if (cancelled) return;
      initializedRef.current = true;
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

  // Reconcile the threshold cache against the server value every
  // time /api/user/me returns. AsyncStorage local writes still win
  // (most-recent-local-action is authoritative) — see
  // primeAutoLockCacheFromServer for the merge rule.
  useEffect(() => {
    if (!user) return;
    const serverValue = (user as unknown as { autoLockMinutes?: AutoLockMinutes })
      .autoLockMinutes;
    if (typeof serverValue !== "number") return;
    void primeAutoLockCacheFromServer(serverValue as AutoLockMinutes);
  }, [user]);

  // AppState transitions — track when the app actually backgrounds
  // (NOT just becomes inactive) and re-lock on return if the gap
  // exceeds the user's threshold.
  //
  // iOS state machine on home button / app-switcher dismiss:
  //   active → inactive → background → (later) inactive → active
  // iOS state machine on Control Center / notification pull-down:
  //   active → inactive → active  (background never reached)
  //
  // So we gate on "did we ever land on background" rather than on
  // a specific prev→next pair. This was Bug 1.
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (next: AppStateStatus) => {
        appState.current = next;
        if (next === "background") {
          // Stamp once. If we somehow re-enter "background" without
          // going through "active" first, keep the older stamp so
          // total backgrounded time is correctly measured.
          if (backgroundedAt.current === null) {
            backgroundedAt.current = Date.now();
          }
          return;
        }
        if (next === "active") {
          // Return from any prior state. If we'd been backgrounded,
          // compute the elapsed gap synchronously against the cached
          // threshold and re-lock if it crossed.
          const bg = backgroundedAt.current;
          backgroundedAt.current = null;
          if (bg === null) return; // we never actually backgrounded
          if (!lockEnabled.current || !user) return;
          if (status === "locked") return; // already locked, no-op
          const minutes = getCachedAutoLockMinutes();
          const thresholdMs = autoLockThresholdMs(minutes);
          // Use >= so threshold 0 ("Immediately") triggers reliably
          // on any wall-clock advance, however small. Threshold
          // Infinity ("Never") never trips because elapsed is finite.
          if (Date.now() - bg >= thresholdMs) {
            setStatus("locked");
          }
        }
        // "inactive" — transient OS interruption. Ignore.
      }
    );
    return () => sub.remove();
  }, [status, user]);

  // Signed out → never locked. Drops overlay if user signs out
  // while locked. Resets initialized marker so the next sign-in
  // re-runs the cold-launch check clean.
  useEffect(() => {
    if (!user && status !== "checking") {
      initializedRef.current = false;
      backgroundedAt.current = null;
      setStatus("unlocked");
    }
  }, [user, status]);

  const unlock = useCallback(async () => {
    const res = await authenticate();
    if (res.success) {
      setStatus("unlocked");
      backgroundedAt.current = null;
    }
    // On failure (cancel / lockout / hardware unavailable) — leave
    // status locked. The overlay surfaces a retry button and after
    // 3 fails shows the "Use Passcode" hint. Persistent biometric
    // lockouts resolve via OS passcode at the system prompt
    // (authenticate() passes both disableDeviceFallback:false AND
    // fallbackLabel:"Use Passcode" so the passcode escape is one
    // tap away on every prompt).
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
