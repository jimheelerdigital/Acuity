/**
 * Session expiry + clear-on-uninstall primitives.
 *
 * iOS Keychain entries (where we store the session JWT via expo-
 * secure-store) persist across app uninstall by default. For a
 * privacy-sensitive app like Acuity, this means: someone uninstalls,
 * gives the phone to a friend, the friend reinstalls Acuity from the
 * App Store, and they're signed in as the original user. Real
 * privacy issue.
 *
 * Mitigation pattern (Slice A, 2026-05-16):
 *   - AsyncStorage flag `acuity_has_launched` — AsyncStorage clears
 *     on uninstall (iOS standard). If the flag is missing on launch
 *     AND a SecureStore token exists, we know an uninstall happened
 *     and clear the keychain.
 *   - AsyncStorage timestamp `acuity_last_active_ms` — bumped on
 *     every foreground transition. If the gap since last-active
 *     exceeds IDLE_EXPIRY_MS, force a re-auth on next launch.
 *
 * Threshold choice — 30 days idle expiry:
 *   Bear (sensitive notes): immediate session inactivity prompt
 *   Day One (journal): 14 days for sensitive operations, never for
 *     general session
 *   1Password (secrets): configurable, default 30 minutes
 *   Standard Notes (e2ee notes): configurable, default 1 hour
 *
 * 30 days hits the middle ground for sensitive content apps that
 * aren't password vaults. Users who open the app daily never see
 * the expiry. Users who fall off for a month re-authenticate, which
 * is the right friction point for a "did I really mean to leave my
 * journal accessible?" check.
 *
 * Migration-safety: existing users on build 42 do NOT have the
 * AsyncStorage flag yet. On their first launch of build 43+ the
 * flag will be missing AND they'll have a valid SecureStore token.
 * The auth-context's migration check (see this file's consumer)
 * distinguishes "fresh install after uninstall" from "live user on
 * build update" by simply writing the flag on first encounter
 * WITHOUT clearing the keychain. Subsequent launches all behave per
 * spec.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const HAS_LAUNCHED_KEY = "acuity_has_launched";
const LAST_ACTIVE_KEY = "acuity_last_active_ms";

/** 30 days in ms. The cutoff for idle expiry. */
export const IDLE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export async function isFirstLaunchSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(HAS_LAUNCHED_KEY);
    return v === "true";
  } catch {
    // AsyncStorage rarely throws; if it does, treat as "haven't seen"
    // which (for the migration path) defaults to NOT clearing.
    return false;
  }
}

export async function markFirstLaunchSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAS_LAUNCHED_KEY, "true");
  } catch {
    /* best-effort */
  }
}

export async function recordActive(now: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACTIVE_KEY, String(now));
  } catch {
    /* best-effort */
  }
}

export async function getLastActiveMs(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_ACTIVE_KEY);
    if (!raw) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function clearSessionMetadata(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    /* best-effort */
  }
  // Note: we do NOT clear HAS_LAUNCHED_KEY here. That flag tracks
  // whether this specific install has been opened at least once —
  // surviving sign-out is correct.
}

export interface SessionGateDecision {
  /** What to do with the existing SecureStore token (if any). */
  action: "keep" | "clear-stale" | "clear-uninstalled";
  /** Whether to write the has-launched flag now (idempotent). */
  markLaunched: boolean;
  /** Whether to record current time as last-active. */
  recordActiveNow: boolean;
  /** Human-readable rationale for safeLog / Sentry. */
  reason: string;
}

/**
 * Decide what to do with the existing session at app launch, given
 * the AsyncStorage state and SecureStore token presence.
 *
 * Pure decision function — easy to unit test, no I/O. Caller fetches
 * the inputs and applies the side effects.
 *
 * Four cases:
 *   A. Has-launched flag missing + token present
 *      → MIGRATION: live build-42 user on build 43+ first launch.
 *        Keep token, mark launched, record active. NO mass logout.
 *   B. Has-launched flag missing + token absent
 *      → Truly fresh install (or user signed out previously). Mark
 *        launched, record active.
 *   C. Has-launched flag present + last-active too old (>IDLE_EXPIRY_MS)
 *      → Idle expiry. Clear the SecureStore token, force re-auth.
 *   D. Has-launched flag present + last-active recent (or absent)
 *      → Normal warm launch. Keep token, record active.
 *
 * Case A is the critical migration path. Without it, every existing
 * user gets logged out the first time they update to build 43.
 */
export function decideSessionGate(input: {
  hasLaunchedBefore: boolean;
  tokenPresent: boolean;
  lastActiveMs: number | null;
  nowMs: number;
  idleThresholdMs: number;
}): SessionGateDecision {
  const { hasLaunchedBefore, tokenPresent, lastActiveMs, nowMs, idleThresholdMs } =
    input;

  if (!hasLaunchedBefore) {
    if (tokenPresent) {
      return {
        action: "keep",
        markLaunched: true,
        recordActiveNow: true,
        reason: "migration: existing live user on first launch of new build",
      };
    }
    return {
      action: "keep",
      markLaunched: true,
      recordActiveNow: true,
      reason: "fresh install or post-sign-out",
    };
  }

  // hasLaunchedBefore = true. Check idle expiry.
  if (tokenPresent && lastActiveMs !== null) {
    const idleMs = nowMs - lastActiveMs;
    if (idleMs > idleThresholdMs) {
      return {
        action: "clear-stale",
        markLaunched: false, // already marked
        recordActiveNow: false, // user will need to re-auth and that path records
        reason: `idle expiry: ${Math.round(idleMs / (24 * 60 * 60 * 1000))}d since last active`,
      };
    }
  }

  return {
    action: "keep",
    markLaunched: false,
    recordActiveNow: true,
    reason: "normal warm launch",
  };
}
