/**
 * App-level passcode / biometric lock — primitive layer.
 *
 * Sits ABOVE the auth layer: if a user has enabled the lock in
 * Profile, the app shows a Face ID / Touch ID / device-passcode gate
 * over the entire UI on cold launch and after backgrounding for more
 * than LOCK_TIMEOUT_MS. Independent of server auth — the keychain
 * session token is still valid; we just refuse to render content
 * until the local device-owner re-authenticates.
 *
 * Storage:
 *   - SecureStore key `acuity_app_lock_enabled` — "1" | "0". Defaults
 *     to off (user opts in). Per-device, not synced to server.
 *
 * The lock-enabled flag in SecureStore persists across uninstall (iOS
 * keychain default). Treat that as a feature, not a bug — a user who
 * re-installs the app finds it still locked, recognizes the brand
 * promise. The session token's keychain persistence-across-uninstall
 * is handled separately (see Slice A — session-expiry).
 *
 * Threshold: LOCK_TIMEOUT_MS (default 30s) is the background→
 * foreground gap that triggers a re-lock. Picked as the middle ground
 * between "annoying every tab-switch" and "trivially bypassable."
 * Bear: ~immediate. Day One: 30-60s. Standard Notes: 0s/30s/1m/5m
 * configurable.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const LOCK_ENABLED_KEY = "acuity_app_lock_enabled";
const AUTO_LOCK_MINUTES_KEY = "acuity.app_lock.auto_lock_minutes";

// Match the session-token's accessibility tier (see lib/auth.ts).
// AFTER_FIRST_UNLOCK survives reboot and remains readable while the
// screen is locked AFTER first unlock — so background app-lock
// state can be read without throwing "User interaction is not
// allowed" during iOS background-prefetch (Sentry REACT-NATIVE-5).
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * DEPRECATED — kept exported only for type-compat with any old import.
 * The runtime threshold is now derived per-resume from
 * `getAutoLockMinutes()`; see `autoLockThresholdMs()` below.
 *
 * @deprecated Use `autoLockThresholdMs(await getAutoLockMinutes())`.
 */
export const LOCK_TIMEOUT_MS = 120_000;

/**
 * Allowed auto-lock minute values. Mirrors the picker options in
 * the Security screen.
 *
 * Encoding:
 *   0  → lock immediately when app backgrounds
 *   1  → 1 minute background → re-lock
 *   2  → 2 minutes (default — banking-app norm)
 *   5  → 5 minutes
 *   15 → 15 minutes
 *  -1  → never re-lock on resume; only cold-launch re-locks
 */
export const AUTO_LOCK_OPTIONS = [0, 1, 2, 5, 15, -1] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];

const DEFAULT_AUTO_LOCK_MINUTES: AutoLockMinutes = 2;
// Sentinel: "Never re-lock on resume." The lock-context treats this
// as Infinity so the background-elapsed comparison never trips.
const NEVER_SENTINEL: AutoLockMinutes = -1;

/**
 * Synchronously-readable cache of the user's chosen auto-lock minutes.
 * Critical: the AppState background→foreground handler in
 * lock-context must read this WITHOUT awaiting AsyncStorage —
 * an async read inside the handler races against fast wake-ups
 * (Cmd-H + immediate reopen in the simulator finishes in <100ms
 * but the AsyncStorage round-trip is ~200ms), so the handler would
 * compare against a stale threshold.
 *
 * Updated:
 *   1. On boot, populate from AsyncStorage via primeAutoLockCache().
 *   2. When the Security screen calls setAutoLockMinutes(), update
 *      this synchronously THEN persist to AsyncStorage. The user-
 *      visible change takes effect on the very next background event.
 *   3. When the lock-context observes a new user.autoLockMinutes
 *      from /api/user/me, it calls primeAutoLockCacheFromServer() to
 *      reconcile.
 *
 * The cache lives at module scope (not React state) because lock-
 * context's AppState handler is a closure registered once-per-effect
 * and cannot await React state updates between renders.
 */
let cachedAutoLockMinutes: AutoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;

/** Convert an `autoLockMinutes` value to its millisecond threshold. */
export function autoLockThresholdMs(minutes: AutoLockMinutes): number {
  if (minutes === NEVER_SENTINEL) return Number.POSITIVE_INFINITY;
  if (minutes <= 0) return 0;
  return minutes * 60_000;
}

function isValidAutoLockMinutes(n: unknown): n is AutoLockMinutes {
  return (
    typeof n === "number" &&
    (AUTO_LOCK_OPTIONS as readonly number[]).includes(n)
  );
}

/**
 * Synchronous read of the in-memory cached value. Returns the default
 * (2 minutes) until primeAutoLockCache() has populated from storage.
 * The lock-context AppState handler uses this — see comment on
 * `cachedAutoLockMinutes`.
 */
export function getCachedAutoLockMinutes(): AutoLockMinutes {
  return cachedAutoLockMinutes;
}

export async function getAutoLockMinutes(): Promise<AutoLockMinutes> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_LOCK_MINUTES_KEY);
    if (raw === null) {
      cachedAutoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
      return DEFAULT_AUTO_LOCK_MINUTES;
    }
    const parsed = Number(raw);
    if (isValidAutoLockMinutes(parsed)) {
      cachedAutoLockMinutes = parsed;
      return parsed;
    }
    cachedAutoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES;
    return DEFAULT_AUTO_LOCK_MINUTES;
  } catch {
    // AsyncStorage failure is non-fatal — fall back to default.
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
}

/**
 * Boot-time priming. Call once from lock-context's cold-launch
 * effect to populate the cache before the user can background the
 * app. After this resolves, `getCachedAutoLockMinutes()` returns
 * the persisted value.
 */
export async function primeAutoLockCache(): Promise<void> {
  await getAutoLockMinutes();
}

/**
 * Reconcile the cache against a value just returned from
 * `/api/user/me`. Use the server value as the source of truth when:
 *   - AsyncStorage is empty (fresh install, signed-in elsewhere)
 *   - The server value differs from local AND AsyncStorage hasn't
 *     been touched since last reconcile (no local-pending write)
 * For now, the simplest rule is: if AsyncStorage has any value, that
 * wins (most-recent-local-action is authoritative). If AsyncStorage
 * is empty, hydrate from server.
 */
export async function primeAutoLockCacheFromServer(
  serverValue: AutoLockMinutes | null | undefined
): Promise<void> {
  if (!isValidAutoLockMinutes(serverValue)) return;
  try {
    const local = await AsyncStorage.getItem(AUTO_LOCK_MINUTES_KEY);
    if (local !== null) return; // local wins
    cachedAutoLockMinutes = serverValue;
    await AsyncStorage.setItem(AUTO_LOCK_MINUTES_KEY, String(serverValue));
  } catch {
    // Non-fatal.
  }
}

export async function setAutoLockMinutes(minutes: AutoLockMinutes): Promise<void> {
  if (!isValidAutoLockMinutes(minutes)) return;
  // Update the synchronously-readable cache FIRST so the next
  // AppState transition uses the new value even if the AsyncStorage
  // write is still in flight. Per the comment on `cachedAutoLockMinutes`,
  // this is the load-bearing fix for Bug 1.
  cachedAutoLockMinutes = minutes;
  try {
    await AsyncStorage.setItem(AUTO_LOCK_MINUTES_KEY, String(minutes));
  } catch {
    // Swallow — caller's local state still reflects intent.
  }
}

/**
 * Is the device capable of biometric or device-passcode local auth?
 * Returns false on simulators with no biometry enrolled AND no
 * passcode. UI uses this to hide the toggle when Face ID would never
 * fire.
 */
export async function isLocalAuthCapable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    // isEnrolled returns true if the user has set up Face ID, Touch
    // ID, OR a device passcode. authenticateAsync falls back to
    // passcode automatically when biometry isn't enrolled, so the
    // "enrolled" gate covers all working configurations.
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function isLockEnabled(): Promise<boolean> {
  try {
    const value = await SecureStore.getItemAsync(LOCK_ENABLED_KEY);
    return value === "1";
  } catch {
    // Locked keychain → default to "not enabled" so the lock doesn't
    // surface an overlay we can't dismiss. Safer fallback than crash.
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(LOCK_ENABLED_KEY, "1", KEYCHAIN_OPTIONS);
    } else {
      await SecureStore.deleteItemAsync(LOCK_ENABLED_KEY);
    }
  } catch (err) {
    if (__DEV__) {
      console.warn("[app-lock] setLockEnabled failed:", err);
    }
    // Swallow — the in-app toggle's local state still reflects the
    // user's intent; next interaction will retry.
  }
}

export interface AuthenticateResult {
  success: boolean;
  /** "cancelled" | "lockedOut" | "noEnrolled" | "noHardware" | "unknown" | null on success */
  error: string | null;
}

/**
 * Prompt the user with Face ID / Touch ID / device passcode. Returns
 * success=true only on confirmed authentication. Cancellation,
 * lock-out (too many failed attempts), or device-side errors return
 * success=false with the error code surfaced for caller diagnostics.
 *
 * Policy choice — `LAPolicy.deviceOwnerAuthentication`:
 *   `disableDeviceFallback: false` (Expo's mapping for
 *   `deviceOwnerAuthentication` instead of
 *   `deviceOwnerAuthenticationWithBiometrics`) — biometry preferred,
 *   passcode fallback armed on every prompt. Critical: passing the
 *   `fallbackLabel` makes iOS render the passcode-fallback button
 *   immediately. Without it, iOS only surfaces the fallback button
 *   after three failed biometric attempts, which feels broken on
 *   devices where the user has covered the camera / their finger is
 *   wet / etc. The labeled fallback gives them an immediate escape.
 *
 * Works on:
 *   - iPhones with Face ID (X+) — biometry first, "Use Passcode" fallback
 *   - iPhones with Touch ID (8/SE) — biometry first, "Use Passcode" fallback
 *   - iPhones with no biometry enrolled — passcode prompt direct
 *   - iPads with the same matrix
 */
export async function authenticate(
  promptMessage = "Unlock Acuity"
): Promise<AuthenticateResult> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
      fallbackLabel: "Use Passcode",
    });
    if (res.success) return { success: true, error: null };
    return {
      success: false,
      error: "error" in res ? String(res.error) : "unknown",
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
