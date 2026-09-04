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
const PLAN_DECISION_KEY = "ripple.v10.plan_decision";
const GUEST_KEY = "ripple.v10.guest";
const OFFERED_KEY = "ripple.v10.offered";
const DISMISSED_KEY = "ripple.v10.dismissed";
const SAVE_WALL_HITS_KEY = "ripple.v10.save_wall_hits";

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
/**
 * What the user chose on Screen 6.
 *
 * Screen 7's copy branches on this ("Your Ripple has started" vs "Keep your
 * first insight"), and Screen 7 can be reached after a cold start, so the
 * decision cannot live in React state or a route param. Showing the paid
 * line to someone who chose Free reads as a system that wasn't listening.
 *
 * NOT an entitlement check and never to be used as one — this records an
 * intent, not a receipt. Whether the user actually has access is
 * RevenueCat's answer, not this key's.
 */
export type V10PlanDecision = "annual" | "monthly" | "free";

export async function setV10PlanDecision(
  decision: V10PlanDecision
): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAN_DECISION_KEY, decision);
  } catch {
    // Non-fatal: Screen 7 falls back to the free copy, which is the safe
    // direction to be wrong in — it under-claims rather than over-claims.
  }
}

export async function getV10PlanDecision(): Promise<V10PlanDecision | null> {
  try {
    const v = await AsyncStorage.getItem(PLAN_DECISION_KEY);
    return v === "annual" || v === "monthly" || v === "free" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Guest mode — chose "Later" on Screen 7, holds an unclaimed debrief.
 *
 * Durable because AuthGate consults it on every cold launch: a guest is
 * signed OUT, and without this flag the signed-out redirect sends them to
 * sign-in the instant "Later" navigates to the tabs.
 *
 * Cleared when they create an account (they are no longer a guest) and on
 * sign-out (the next person on this device is not their guest).
 */
export async function setV10Guest(isGuest: boolean): Promise<void> {
  try {
    if (isGuest) await AsyncStorage.setItem(GUEST_KEY, "true");
    else await AsyncStorage.removeItem(GUEST_KEY);
  } catch {
    // Best-effort. Failing to SET means they get bounced to sign-in, which
    // is recoverable; failing to CLEAR is handled by the signed-in branch
    // taking precedence over guest state in decideColdStartRoute.
  }
}

export async function isV10Guest(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(GUEST_KEY)) === "true";
  } catch {
    return false;
  }
}

/**
 * Set the moment we route an install into v10 — NOT when the user
 * interacts.
 *
 * Marking on interaction would mean someone who force-quits on Screen 1 is
 * treated as brand new on every launch, while someone who reaches Screen 4
 * has written enough cached data to look like a returning user and get
 * diverted to sign-in mid-funnel.
 */
export async function markV10Offered(): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFERED_KEY, "true");
  } catch {
    /* best-effort */
  }
}

export async function wasV10Offered(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(OFFERED_KEY)) === "true";
  } catch {
    return false;
  }
}

/**
 * The user explicitly chose "Sign in" from the funnel.
 *
 * Sticky across launches on purpose: a returning subscriber who reinstalled
 * and found the escape hatch must not be dropped back into the funnel every
 * cold start.
 */
export async function dismissV10(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, "true");
  } catch {
    /* best-effort */
  }
}

export async function wasV10Dismissed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DISMISSED_KEY)) === "true";
  } catch {
    return false;
  }
}

/**
 * How many times this guest has hit the save wall.
 *
 * Durable so the escalation survives a relaunch — otherwise force-quitting
 * resets a guest to the soft wall forever and they can keep tapping past it
 * indefinitely.
 */
export async function getSaveWallHits(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(SAVE_WALL_HITS_KEY);
    const n = v === null ? 0 : Number.parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export async function bumpSaveWallHits(): Promise<number> {
  const next = (await getSaveWallHits()) + 1;
  try {
    await AsyncStorage.setItem(SAVE_WALL_HITS_KEY, String(next));
  } catch {
    /* best-effort — worst case they see the soft wall twice */
  }
  return next;
}

export async function clearV10State(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([
      BRANCH_KEY,
      STARTED_AT_KEY,
      PLAN_DECISION_KEY,
      GUEST_KEY,
      OFFERED_KEY,
      DISMISSED_KEY,
      SAVE_WALL_HITS_KEY,
    ]);
  } catch {
    /* non-fatal */
  }
}
