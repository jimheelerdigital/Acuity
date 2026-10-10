import AsyncStorage from "@react-native-async-storage/async-storage";

import { type WelcomePhase, isWelcomePhase } from "./phases";

export * from "./phases";

// ── Persistence (device-local; the server only learns "completed") ──────
const KEY = "ripple.welcome.v1";

export interface StoredWelcome {
  phase: WelcomePhase | null;
  entryId: string | null;
}

export async function loadWelcome(): Promise<StoredWelcome> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { phase: null, entryId: null };
    const v = JSON.parse(raw) as Partial<StoredWelcome>;
    const phase = isWelcomePhase(v.phase) ? v.phase : null;
    const entryId = typeof v.entryId === "string" && v.entryId ? v.entryId : null;
    return { phase, entryId };
  } catch {
    return { phase: null, entryId: null };
  }
}

export async function saveWelcome(state: StoredWelcome): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // best-effort: losing it only means resuming one screen earlier
  }
}

export async function clearWelcome(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}

/**
 * Called by the recorder (app/record.tsx, `from=welcome`) once the server
 * has accepted the first debrief. The welcome screen picks it up on focus.
 */
export async function noteWelcomeDebrief(entryId: string): Promise<void> {
  await saveWelcome({ phase: "notify", entryId });
}

