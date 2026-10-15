import type { Ionicons } from "@expo/vector-icons";

/**
 * What's New content, bundled with the app (1.9.1).
 *
 * Why in the app and not the server: the 1.8 sheet read release notes from
 * /api/app/version-check and only showed when the running version equalled
 * the server's `recommendedVersion`. That config was never bumped past
 * "1.1.0" with empty notes, so the sheet never appeared for 1.8 or 1.9.
 * Notes that ship inside the build show on every update without a server
 * step. (The server notes are still used as a fallback for a version with
 * no entry here.)
 *
 * Add one entry per release, newest first. Items with an `action` are
 * tappable and take the user straight to the how-to / setup / feature.
 */

export type WhatsNewItem = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  action?: { label: string; href: string };
  /** Omit for both platforms. */
  platform?: "ios" | "android";
};

export type WhatsNewRelease = {
  version: string;
  items: WhatsNewItem[];
};

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    version: "1.9.1",
    items: [
      {
        icon: "today-outline",
        title: "TODAY on Home",
        body: "Your most pressing tasks up top: overdue, due today, then high priority.",
      },
      {
        icon: "apps-outline",
        title: "New Ripple Today widget",
        body: "Put your TODAY list on your Home Screen or Lock Screen.",
        action: { label: "How to add it", href: "/setup" },
        platform: "ios",
      },
      {
        icon: "swap-horizontal-outline",
        title: "Swipe to edit or delete",
        body: "Swipe left on any goal, habit or task. Delete always asks first.",
        action: { label: "Try it on Tasks", href: "/(tabs)/tasks" },
      },
      {
        icon: "notifications-outline",
        title: "Know when your debrief is ready",
        body: "Leave the app while it processes. We'll tell you when it's done.",
        action: { label: "Notification settings", href: "/notification-preferences" },
      },
      {
        icon: "radio-button-on-outline",
        title: "Action Button recording fixed",
        body: "Starting a debrief from the Action Button or widget no longer says recording is unavailable.",
        action: { label: "Set up the Action Button", href: "/setup" },
        platform: "ios",
      },
      {
        icon: "key-outline",
        title: "No more passwords",
        body: "Sign in with Apple, Google, or a 6-digit code sent to your email.",
      },
    ],
  },
];
