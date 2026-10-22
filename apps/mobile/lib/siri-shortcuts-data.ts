import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

import { getCached, subscribeCached } from "@/lib/cache";

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
 *   taskGroupsForSiri -> [{ id, name, icon }] JSON — the user's task groups,
 *                    in order, for the Add a Task card's group buttons
 *                    (iOS 26+) and the Shortcuts "Group" parameter.
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

type SiriTaskGroup = { id: string; name: string; icon: string; order?: number };

const TASK_GROUPS_CACHE_KEY = "/api/task-groups";

/** Publish the user's task groups (id + name + icon, in order). */
export function publishSiriTaskGroups(groups: SiriTaskGroup[]): void {
  if (!storage) return;
  try {
    const list = [...groups]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((g) => ({ id: g.id, name: g.name, icon: g.icon }));
    storage.set("taskGroupsForSiri", list);
  } catch {
    // best-effort
  }
}

/**
 * Keep taskGroupsForSiri in step with the app: every write to the shared
 * task-groups cache (Tasks tab, New task, Manage groups) republishes.
 * Call once at startup. Returns the unsubscribe.
 */
export function startSiriTaskGroupsPublisher(): () => void {
  const push = () => {
    const groups = getCached<{ groups?: SiriTaskGroup[] }>(TASK_GROUPS_CACHE_KEY)?.groups;
    if (Array.isArray(groups)) publishSiriTaskGroups(groups);
  };
  push();
  return subscribeCached(TASK_GROUPS_CACHE_KEY, push);
}

/** Sign-out: the next person on this device must not see these. */
export function clearSiriUserData(): void {
  if (!storage) return;
  try {
    storage.remove("taskGroupsForSiri");
    storage.remove("habitsForSiri");
  } catch {
    // best-effort
  }
}
