import type { Ionicons } from "@expo/vector-icons";

/**
 * What's New content, bundled with the app (1.9.1).
 *
 * Why in the app and not the server: the 1.8 sheet read release notes from
 * /api/app/version-check and only showed when the running version equalled
 * the server's `recommendedVersion`. That config was never bumped past
 * "1.1.0" with empty notes, so the sheet never appeared for 1.8 or 1.9.
 * Notes that ship inside the build show on every update without a server
 * step. (The server notes are still a fallback for a version with no entry
 * here.)
 *
 * Add one entry per release, newest first. Older entries stay: Profile →
 * What's New lists them as a changelog.
 *
 * `tour` = this item has a stop in the guided "Show me around" tour
 * (components/tour/whats-new-tour.ts): the tour opens that screen and
 * spotlights the feature. Tapping the item runs just that stop. Items
 * without `tour` are informational. Order here = tour order.
 */

export type WhatsNewTarget =
  | "today"
  | "swipe"
  | "widgets"
  | "actionButton"
  | "notifications";

export type WhatsNewItem = {
  /** Stable id — explored state is stored against it. */
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tour?: {
    target: WhatsNewTarget;
    /** Tour card copy (shown next to the spotlit feature). */
    title: string;
    body: string;
  };
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
        id: "today",
        icon: "today-outline",
        title: "TODAY on Home",
        body: "Your most pressing tasks up top: overdue, due today, then high priority.",
        tour: {
          target: "today",
          title: "Your TODAY list",
          body: "Overdue first, then due today, then high priority. Check one off right here.",
        },
      },
      {
        id: "swipe",
        icon: "swap-horizontal-outline",
        title: "Swipe to edit or delete",
        body: "Swipe left on any goal, habit or task. Delete always asks first.",
        tour: {
          target: "swipe",
          title: "Swipe left on any row",
          body: "Edit or Delete, on tasks, goals and habits. Delete always asks first.",
        },
      },
      {
        id: "widget",
        icon: "apps-outline",
        title: "New Ripple Today widget",
        body: "Put your TODAY list on your Home Screen or Lock Screen.",
        platform: "ios",
        tour: {
          target: "widgets",
          title: "Add the Ripple Today widget",
          body: "Follow these steps, then pick Ripple Today. This card turns green once it's on your screen.",
        },
      },
      {
        id: "action-button",
        icon: "radio-button-on-outline",
        title: "Action Button recording fixed",
        body: "Starting a debrief from the Action Button or widget no longer says recording is unavailable.",
        platform: "ios",
        tour: {
          target: "actionButton",
          title: "One press to record",
          body: "Set the Action Button to Ripple here. Every card on this page gets a green check once it's set up.",
        },
      },
      {
        id: "ready-push",
        icon: "notifications-outline",
        title: "Know when your debrief is ready",
        body: "Leave the app while it processes. We'll tell you when it's done.",
        tour: {
          target: "notifications",
          title: "Get told when it's ready",
          body: "Keep notifications on and we'll ping you the moment your debrief is done.",
        },
      },
      {
        id: "passwordless",
        icon: "key-outline",
        title: "No more passwords",
        body: "Sign in with Apple, Google, or a 6-digit code sent to your email.",
      },
    ],
  },
];

/** The entry for exactly this app version, filtered to the platform. */
export function releaseFor(
  version: string,
  platform: "ios" | "android"
): WhatsNewRelease | null {
  const r = WHATS_NEW_RELEASES.find((x) => x.version === version);
  if (!r) return null;
  return {
    version: r.version,
    items: r.items.filter((i) => !i.platform || i.platform === platform),
  };
}
