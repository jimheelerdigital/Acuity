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
 */
import * as QuickActions from "expo-quick-actions";
import type { RouterAction } from "expo-quick-actions/router";

export const RIPPLE_QUICK_ACTIONS: RouterAction[] = [
  {
    id: "new-debrief",
    title: "New Debrief",
    subtitle: "Record today's reflection",
    icon: "symbol:mic.fill",
    params: { href: "/record?autostart=1" },
  },
  {
    id: "ask-ripple",
    title: "Ask Ripple",
    icon: "symbol:sparkles",
    params: { href: "/insights/ask" },
  },
  {
    id: "habits",
    title: "Habits",
    icon: "symbol:checkmark.circle.fill",
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
