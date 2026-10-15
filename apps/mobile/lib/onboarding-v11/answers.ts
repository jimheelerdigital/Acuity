import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Onboarding v11 answers — what she tapped before her first debrief.
 *
 * Durable (AsyncStorage) for the same reason as lib/onboarding-v10/state:
 * a cold start mid-funnel must not lose the name the year plan greets her
 * by, or the "carrying" picks the habit suggestions come from. Not a
 * credential, so AsyncStorage rather than SecureStore.
 */

// "ripple.v10." prefix on purpose: entry-routing's isHistoryKey() treats
// every other "ripple." key as proof of a returning user, which would send a
// signed-out funnel-taker to sign-in on relaunch.
const KEY = "ripple.v10.v11answers";

export interface V11Answers {
  firstName?: string;
  hook?: "yes" | "no";
  age?: string;
  carrying: string[];
  sound?: "yes" | "no";
  /** Check-in time chosen while the debrief analyzes ("21:00"), or null for none. */
  checkInTime?: string | null;
  // ── Choices made before the account exists (account comes after the
  //    results, Jimmy 2026-10-15). Applied by applyPendingSetup() right
  //    after sign-up, then cleared. ──
  /** When she ticked the AI-consent box (ms). Recorded to the ledger after sign-up. */
  consentAgreedAt?: number;
  /** Habits picked while the debrief analyzed. Created after sign-up. */
  pendingHabits?: string[];
  /** A reminder time was chosen but not yet saved to the account. */
  reminderPending?: boolean;
}

const EMPTY: V11Answers = { carrying: [] };

export async function loadAnswers(): Promise<V11Answers> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<V11Answers>;
    return { ...EMPTY, ...parsed, carrying: Array.isArray(parsed.carrying) ? parsed.carrying : [] };
  } catch {
    return { ...EMPTY };
  }
}

/** Merge a patch into the stored answers. Best-effort: never blocks a tap. */
export async function saveAnswers(patch: Partial<V11Answers>): Promise<V11Answers> {
  const next = { ...(await loadAnswers()), ...patch };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* non-fatal */
  }
  return next;
}

export async function clearAnswers(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* non-fatal */
  }
}
