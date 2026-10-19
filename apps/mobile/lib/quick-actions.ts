/**
 * Home-screen quick actions (long-press the app icon).
 *
 * Runtime-registered (not static Info.plist) so the set can evolve without a
 * native rebuild, and routed through expo-router via the `params.href`
 * contract that `useQuickActionRouting` (wired in app/(tabs)/_layout.tsx)
 * understands. Deliberately mirrors the App Intents keystone
 * (plugins/RippleShortcuts.swift) so Siri, Spotlight, the Action Button, and
 * the long-press icon menu all offer the same first actions.
 *
 * Best-effort: quick actions are a convenience, never load-bearing.
 *
 * Icons: iOS takes SF Symbols ("symbol:…"). Android needs real image
 * resources — the qa_* adaptive icons generated from assets/quick-actions by
 * the expo-quick-actions config plugin (app.json). Without them Android
 * shows the shortcuts with no icon.
 */
import { Platform } from "react-native";
import * as QuickActions from "expo-quick-actions";
import type { RouterAction } from "expo-quick-actions/router";

const icon = (ios: string, android: string) =>
  Platform.OS === "android" ? android : `symbol:${ios}`;

export const RIPPLE_QUICK_ACTIONS: RouterAction[] = [
  {
    id: "new-debrief",
    title: "New Debrief",
    subtitle: "Record today's reflection",
    icon: icon("mic.fill", "qa_record"),
    params: { href: "/record?autostart=1" },
  },
  {
    id: "ask-ripple",
    title: "Ask Ripple",
    icon: icon("sparkles", "qa_ask"),
    params: { href: "/insights/ask" },
  },
  {
    id: "habits",
    title: "Habits",
    icon: icon("checkmark.circle.fill", "qa_habits"),
    params: { href: "/habits" },
  },
];

/** Register the quick actions. No-op where unsupported or on any error. */
export async function setupQuickActions(): Promise<void> {
  try {
    if (!(await QuickActions.isSupported())) return;
    await QuickActions.setItems(RIPPLE_QUICK_ACTIONS);
  } catch {
    // Swallow — a failed quick-action registration must never disrupt the app.
  }
}
