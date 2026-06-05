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
    title: "Record",
    text: "Tap here anytime to capture what's on your mind. Sixty seconds is enough.",
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
    text: "Acuity extracts to-dos from what you say — they land here.",
  },
  {
    title: "Insights",
    text: "Patterns, themes, and your weekly report. The longer you use it, the sharper this gets.",
  },
  {
    title: "Goals",
    text: "Set what you're working toward; Acuity nudges you when entries touch it.",
  },
  {
    title: "Settings",
    text: "Tap the gear icon to open Profile — themes, reminders, security, and replay-tour all live there.",
  },
];

export const TOUR_TOTAL_STEPS = TOUR_STEP_CONTENT.length;

/** First step the tour opens on (spotlight `start()` always begins at 0). */
export const TOUR_FIRST_STEP_INDEX = 0;
