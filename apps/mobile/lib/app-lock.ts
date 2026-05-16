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

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const LOCK_ENABLED_KEY = "acuity_app_lock_enabled";

/** Background→foreground gap that triggers a re-lock. */
export const LOCK_TIMEOUT_MS = 30_000;

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
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(LOCK_ENABLED_KEY, "1");
  } else {
    await SecureStore.deleteItemAsync(LOCK_ENABLED_KEY);
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
 * Passing `disableDeviceFallback: false` lets iOS auto-fall-back to
 * the device passcode if biometry fails three times — desirable for
 * the unlock flow so the user has a recovery path.
 */
export async function authenticate(
  promptMessage = "Unlock Acuity"
): Promise<AuthenticateResult> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
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
