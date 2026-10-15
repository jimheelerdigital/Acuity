/**
 * Single source of truth for the first-login product tour steps.
 *
 * react-native-spotlight-tour (Fabric-safe replacement for
 * react-native-copilot) defines steps as an array on the provider and
 * attaches targets by INDEX (`<AttachStep index={n}>`). So the content
 * lives here, `TourProvider` builds the provider's `steps[]` from it,
 * and each target screen references its index via TOUR_STEP_INDEX.
 *
 * Order is the walkthrough order: mic → dashboard → entries → tasks →
 * insights → goals. The copy is carried over verbatim from the prior
 * (copilot) TOUR_STEPS so nothing user-facing changed — only the
 * rendering engine.
 */

/** 0-based index of each step in TOUR_STEP_CONTENT / the provider steps array. */
export const TOUR_STEP_INDEX = {
  mic: 0,
  dashboard: 1,
  entries: 2,
  tasks: 3,
  insights: 4,
  goals: 5,
  settings: 6,
} as const;

export interface TourStepContent {
  /** Short factual label shown as the tooltip title. */
  title: string;
  /** Body copy (carried over verbatim from the copilot TOUR_STEPS). */
  text: string;
}

export const TOUR_STEP_CONTENT: TourStepContent[] = [
  {
    title: "Home",
    text: "Tap here to come back Home anytime. Long-press it to start a new entry right away. Sixty seconds is enough.",
  },
  {
    title: "Home",
    text: "Your home screen reflects your reflections. Patterns surface as you record.",
  },
  {
    title: "Entries",
    text: "Every voice note lives here, processed into transcript + themes + mood.",
  },
  {
    title: "Tasks",
    text: "Ripple extracts to-dos from what you say — they land here.",
  },
  {
    title: "Insights",
    text: "Patterns, themes, and your weekly report. The longer you use it, the sharper this gets.",
  },
  {
    title: "Goals",
    text: "Set what you're working toward; Ripple nudges you when entries touch it.",
  },
  {
    title: "Settings",
    text: "Tap the gear icon to open Profile — themes, reminders, security, and replay-tour all live there.",
  },
];

export const TOUR_TOTAL_STEPS = TOUR_STEP_CONTENT.length;

/** First step the tour opens on (spotlight `start()` always begins at 0). */
export const TOUR_FIRST_STEP_INDEX = 0;

/**
 * What's New tour targets (1.9.1). Appended AFTER the first-login steps so
 * those keep indices 0–6; the first-login tour stops at
 * TOUR_TOTAL_STEPS - 1 and never walks into these. Only What's New mode
 * (components/tour/whats-new-tour.ts) visits them, via goTo().
 */
export const WHATS_NEW_STEP_INDEX = {
  today: TOUR_TOTAL_STEPS, // Home → TODAY card
  swipe: TOUR_TOTAL_STEPS + 1, // Tasks → first task row
  widgets: TOUR_TOTAL_STEPS + 2, // Setup → Widgets card
  actionButton: TOUR_TOTAL_STEPS + 3, // Setup → Action Button card
  notifications: TOUR_TOTAL_STEPS + 4, // Notifications → master toggle
} as const;

/** Screen each What's New target lives on (navigated to before measuring). */
export const WHATS_NEW_STEP_PATHS: Record<keyof typeof WHATS_NEW_STEP_INDEX, string> = {
  today: "/(tabs)",
  swipe: "/(tabs)/tasks",
  widgets: "/setup",
  actionButton: "/setup",
  notifications: "/notification-preferences",
};
