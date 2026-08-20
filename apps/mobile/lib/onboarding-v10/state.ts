import AsyncStorage from "@react-native-async-storage/async-storage";

import { isV10Branch, type V10Branch } from "./branches";

/**
 * Onboarding v10 — flow state that must survive a backgrounded app.
 *
 * Spec §3 requires guest recovery: "background before Screen 6 decision →
 * reopen lands on Screen 5 with her result still there". And §9 requires the
 * anonymous result to persist "through background, restart, purchase, later
 * claim". So the branch cannot live in React state alone — a cold start
 * between Screen 2 and Screen 6 would lose the personalization that every
 * later screen reads.
 *
 * Deliberately NOT the existing OnboardingProvider: that context holds the
 * q1–q5 diagnostic vector for the legacy flow, resets on unmount, and is
 * memory-only. v10 needs one durable value, and coupling to a context that
 * the flag-OFF path still owns would entangle the two flows.
 *
 * AsyncStorage rather than SecureStore: the branch is a UI personalization
 * key, not a credential. SecureStore is slower and its iOS keychain
 * behaviour has already caused session races in this app.
 */

const BRANCH_KEY = "ripple.v10.branch";
const STARTED_AT_KEY = "ripple.v10.started_at";

/**
 * Persist the branch chosen on Screen 1. Fire-and-forget by design — a
 * storage failure must not block the auto-advance, since the flow degrades
 * gracefully to the `open` branch rather than breaking.
 */
export async function setV10Branch(branch: V10Branch): Promise<void> {
  try {
    await AsyncStorage.setItem(BRANCH_KEY, branch);
  } catch {
    // Non-fatal — see above.
  }
}

/**
 * Read the branch. Returns null when absent or unrecognized.
 *
 * Callers should fall back to `"open"` — the branch whose copy makes no
 * assumption about the user ("Whatever's there. No category needed."). That
 * is the honest degradation: showing the overload mirror line to someone who
 * never chose it would be putting words in her mouth.
 */
export async function getV10Branch(): Promise<V10Branch | null> {
  try {
    const raw = await AsyncStorage.getItem(BRANCH_KEY);
    return isV10Branch(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Stamp when the flow began, for the activation funnel's latency reads. */
export async function markV10Started(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(STARTED_AT_KEY);
    if (existing) return; // first touch wins — this is install-scoped
    await AsyncStorage.setItem(STARTED_AT_KEY, String(Date.now()));
  } catch {
    /* non-fatal */
  }
}

export async function getV10StartedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STARTED_AT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Clear v10 flow state. Called when the flow completes or the user signs
 * out, so a second install-less run doesn't inherit a stale branch.
 */
export async function clearV10State(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([BRANCH_KEY, STARTED_AT_KEY]);
  } catch {
    /* non-fatal */
  }
}
