import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Web product tour (driver.js) — the web equivalent of the iOS 7-step
 * first-login spotlight tour. Single responsive flow (Option A): each
 * step resolves its anchor at runtime to whichever element is VISIBLE at
 * the current viewport (desktop sidebar vs mobile top-nav), and steps
 * whose anchor isn't present at this width are skipped.
 *
 * Anchors are `data-tour="<tourId>"` attributes placed on the real nav
 * elements (app-shell sidebar, mobile nav-bar, home hero, user menu).
 * Copy mirrors the mobile tour (apps/mobile/components/tour/steps.ts),
 * adapted for click (web) vs long-press (mobile).
 *
 * Completion semantics match mobile: reaching the last step = completed
 * (grants guided_start via /api/user/tour-complete); closing early = skip.
 */

interface WebTourStepContent {
  tourId: string;
  title: string;
  description: string;
  /** driver.js popover side relative to the anchor. */
  side?: "top" | "bottom" | "left" | "right";
}

export const WEB_TOUR_STEPS: WebTourStepContent[] = [
  {
    tourId: "record",
    title: "Record",
    description:
      "Click Record anytime to capture what's on your mind. Sixty seconds is enough.",
    side: "right",
  },
  {
    tourId: "dashboard",
    title: "Your dashboard",
    description:
      "Your home reflects your reflections. Patterns surface as you record.",
    side: "bottom",
  },
  {
    tourId: "entries",
    title: "Entries",
    description:
      "Every voice note lives here, processed into transcript + themes + mood.",
    side: "right",
  },
  {
    tourId: "tasks",
    title: "Tasks",
    description:
      "Acuity extracts to-dos from what you say — they land here.",
    side: "right",
  },
  {
    tourId: "insights",
    title: "Insights",
    description:
      "Patterns, themes, and your weekly report. The longer you use it, the sharper this gets.",
    side: "right",
  },
  {
    tourId: "goals",
    title: "Goals",
    description:
      "Set what you're working toward; Acuity nudges you when entries touch it.",
    side: "right",
  },
  {
    tourId: "settings",
    title: "Settings",
    description:
      "Themes, reminders, privacy, and replay-tour all live here.",
    side: "bottom",
  },
];

/**
 * Find the VISIBLE element for a tourId. Both the desktop sidebar and the
 * mobile nav can carry the same `data-tour` attribute; only one is
 * displayed at a given viewport (the other is `display:none` via Tailwind
 * `lg:` classes → `offsetParent === null`). Returns null if no anchor is
 * mounted/visible at this width (that step is then skipped).
 */
function resolveVisibleAnchor(tourId: string): HTMLElement | null {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`)
  );
  return els.find((el) => el.offsetParent !== null) ?? null;
}

/**
 * Build + run the tour. Calls `onEnd(completed)` once when the tour
 * finishes (completed=true if the user reached the last step) or is
 * dismissed early (completed=false). Returns false if no anchors resolved
 * (nothing to show) — caller should treat that as a no-op, not a skip.
 */
export function runWebTour(opts: { onEnd: (completed: boolean) => void }): boolean {
  const steps: DriveStep[] = [];
  for (const s of WEB_TOUR_STEPS) {
    const el = resolveVisibleAnchor(s.tourId);
    if (!el) continue;
    steps.push({
      element: el,
      popover: {
        title: s.title,
        description: s.description,
        side: s.side ?? "bottom",
        align: "start",
      },
    });
  }

  if (steps.length === 0) return false;

  let completed = false;
  const lastIndex = steps.length - 1;

  const d = driver({
    showProgress: true,
    allowClose: true,
    overlayColor: "rgba(8, 8, 16, 0.72)",
    stagePadding: 6,
    stageRadius: 10,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Get started",
    popoverClass: "acuity-web-tour",
    steps,
    // Fires on any close request (Done on last step, ESC, X, overlay
    // click). We must call destroy() ourselves when this is defined.
    // Treat a close from the last step as completion.
    onDestroyStarted: () => {
      completed = d.getActiveIndex() === lastIndex;
      d.destroy();
    },
    onDestroyed: () => {
      opts.onEnd(completed);
    },
  });

  d.drive();
  return true;
}
