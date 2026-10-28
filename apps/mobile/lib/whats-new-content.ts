import type { Ionicons } from "@expo/vector-icons";

import { compareVersion } from "./semver";

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
  | "record"
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
    // 1.9.6 (2026-10-23). User-facing only.
    version: "1.9.6",
    items: [
      {
        id: "apple-watch",
        icon: "watch-outline",
        title: "Ripple on your Apple Watch",
        body: "Record an entry from your wrist, even with no signal: it uploads when you're back in range. Check off tasks and habits there too. Open Ripple on your phone once and your watch connects.",
        platform: "ios",
      },
      {
        id: "widget-refresh",
        icon: "flame-outline",
        title: "A fresh look for your widgets",
        body: "Your streak now sits front and center, each habit shows its own streak, and the widgets take on the colors you picked in Ripple.",
        platform: "ios",
        tour: {
          target: "widgets",
          title: "Your streak, front and center",
          body: "Add the Ripple widget to your Home Screen to see your daily streak and today's habits, in your colors.",
        },
      },
      {
        id: "plan-my-day",
        icon: "time-outline",
        title: "Plan my day",
        body: "Tap Plan my day on the Today card. Ripple fits your most pressing tasks around today's meetings; adjust the times, then add them to your calendar in one tap. Pro.",
      },
      {
        id: "apple-health",
        icon: "heart-outline",
        title: "Apple Health",
        body: "Profile \u2192 Apple Health. See how sleep and steps line up with your mood, and let habits like 10,000 steps check themselves off.",
        platform: "ios",
      },
      {
        id: "calendar-connect",
        icon: "calendar-outline",
        title: "Connect your calendar",
        body: "Profile \u2192 Calendar. Your tasks with due dates land on the calendar you pick, Google calendars on your phone included, and your entries can reference what your day actually looked like. Pro.",
      },
      {
        id: "task-group-card",
        icon: "pricetags-outline",
        title: "Pick a group when you add a task",
        body: "On iOS 26 and later, adding a task with Siri or the Action Button asks for the due date and the group on one card. Skip the group and Ripple picks one.",
        platform: "ios",
      },
      {
        id: "manage-groups",
        icon: "albums-outline",
        title: "Make your own task groups",
        body: "Tap the tag button on Tasks to add, rename, reorder or delete groups. Work, Kids, Side project: whatever fits.",
      },
    ],
  },
  {
    // 1.9.5 (2026-10-22). App Store users come from 1.9.3 (1.9.4 never
    // shipped), so this covers everything since then. User-facing only:
    // nothing about billing plumbing / analytics.
    version: "1.9.5",
    items: [
      {
        id: "type-or-snap",
        icon: "create-outline",
        title: "Type it or snap it",
        body: "Can't talk right now? Type your entry instead, or take a photo of a handwritten page and Ripple reads it.",
        tour: {
          target: "record",
          title: "Type or snap an entry",
          body: "Tap \"Type it instead\" to write your entry. Once you're typing, the camera button turns a photo of a handwritten page into text.",
        },
      },
      {
        id: "widget-checkoff",
        icon: "checkmark-circle-outline",
        title: "Check off tasks from your Home Screen",
        body: "The Today widget shows all your open tasks. Tap a circle to check one off without opening the app.",
        platform: "ios",
        tour: {
          target: "widgets",
          title: "Check tasks off right on the widget",
          body: "Add the Ripple Today widget, then tap any circle to check that task off. Tap anywhere else to open your tasks.",
        },
      },
      {
        id: "siri-due-dates",
        icon: "mic-circle-outline",
        title: "Add tasks with Siri, due dates included",
        body: "Say \"Add a task in Ripple\" or use the Action Button, then pick a due date if you want one.",
        platform: "ios",
        tour: {
          target: "actionButton",
          title: "Add tasks hands-free",
          body: "Set the Action Button or ask Siri to \"Add a task in Ripple\". You'll be asked for an optional due date.",
        },
      },
      {
        id: "roadmap",
        icon: "map-outline",
        title: "See what's coming next",
        body: "Profile → Roadmap shows what we're building and what's planned. Vote for what you want most.",
      },
      {
        id: "keyboard",
        icon: "chatbox-ellipses-outline",
        title: "Smoother typing everywhere",
        body: "The keyboard no longer covers what you're typing or the buttons you need.",
      },
    ],
  },
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

/**
 * Most releases a catch-up sheet combines. Someone coming from a very old
 * build (or "0.0.0", a pre-1.8 upgrade) sees the newest few, not every
 * release ever — the full history stays in Profile → What's New.
 */
export const MAX_CATCH_UP_RELEASES = 3;

/**
 * Catch-up (1.9.6): everything new since the version they last saw.
 * Combines every release with from < version <= current, newest release
 * first (each release keeps its own item order), filtered to the platform,
 * de-duplicated by item id (the newest release's copy wins). Labelled with
 * `current`. Null when nothing applies.
 *
 * Before this, someone jumping 1.9.3 → 1.9.6 only saw 1.9.6's items and
 * never heard about 1.9.5.
 */
export function catchUpRelease(
  from: string,
  current: string,
  platform: "ios" | "android",
  maxReleases = MAX_CATCH_UP_RELEASES
): WhatsNewRelease | null {
  const releases = WHATS_NEW_RELEASES.filter(
    (r) =>
      compareVersion(from, r.version) === -1 &&
      compareVersion(r.version, current) !== 1
  )
    .sort((a, b) => compareVersion(b.version, a.version))
    .slice(0, Math.max(1, maxReleases));
  const seen = new Set<string>();
  const items: WhatsNewItem[] = [];
  for (const r of releases) {
    for (const i of r.items) {
      if (i.platform && i.platform !== platform) continue;
      if (seen.has(i.id)) continue;
      seen.add(i.id);
      items.push(i);
    }
  }
  return items.length > 0 ? { version: current, items } : null;
}

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
