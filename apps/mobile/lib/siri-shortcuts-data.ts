import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

/**
 * Publishes the NON-SECRET slice of state the Siri App Intents need into the
 * shared App Group, so the out-of-process intents in
 * apps/mobile/plugins/RippleShortcuts.swift can act on the user's behalf.
 *
 * The session bearer is deliberately NOT here — a credential belongs in the
 * Keychain. The Swift intents read it straight from the app's existing
 * expo-secure-store item (lib/auth.ts setToken). The App Group only carries:
 *   apiBase       -> String  API origin, e.g. https://goripple.io
 *   habitsForSiri -> [{ id, name }] JSON — active habits, for the
 *                    "check off <habit>" entity resolver (same sensitivity as
 *                    the habit names the widget already shows).
 *
 * iOS only (no-op on Android). Best-effort: a failure here must never break
 * sign-in or the habits screen.
 */
const APP_GROUP = "group.com.heelerdigital.acuity";
const storage = Platform.OS === "ios" ? new ExtensionStorage(APP_GROUP) : null;

type SiriHabit = { id: string; name: string; archivedAt: string | null };

/** Publish the API origin the intents should call (non-secret). */
export function publishSiriConfig(apiBase: string): void {
  if (!storage) return;
  try {
    storage.set("apiBase", apiBase);
  } catch {
    // best-effort
  }
}

/** Publish active habits (id + name) so Siri can resolve "check off <habit>". */
export function publishSiriHabits(habits: SiriHabit[]): void {
  if (!storage) return;
  try {
    const active = habits
      .filter((h) => !h.archivedAt)
      .map((h) => ({ id: h.id, name: h.name }));
    storage.set("habitsForSiri", active);
  } catch {
    // best-effort
  }
}
