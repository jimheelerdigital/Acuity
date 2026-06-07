import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * Web product tour (driver.js) — the web equivalent of the iOS 7-step
 * first-login tour. Like iOS, each step NAVIGATES to that section's page
 * and spotlights an element on the real page (not the sidebar), so the
 * user sees actual content while the popover explains it.
 *
 * Cross-page mechanics: driver doesn't natively await async navigation
 * between steps, so we override its Next/Back buttons (onNextClick /
 * onPrevClick) — push the router to the next step's route, wait
 * NAV_SETTLE_MS for the page to render, then moveNext/movePrevious.
 * driver re-queries each step's selector at highlight time, so the
 * just-navigated page's element is found. On end (Done or close) the tour
 * returns the user to /home.
 *
 * Responsive: steps 3-7 anchor on PAGE CONTENT (one element per page →
 * viewport-agnostic). Only step 1 (Record) has desktop-sidebar vs
 * mobile-#record variants, so it's resolved to the visible element at
 * start. Navigation (router.push) is identical on both.
 */

const HOME = "/home";

/** Delay after navigating before driver measures the new page's anchor. */
export const NAV_SETTLE_MS = 450;

interface WebTourStep {
  /** Route this step lives on; navigated to via the router before highlight. */
  route: string;
  /** data-tour selector for the anchor (omitted for step 1 — resolved live). */
  selector?: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
}

const WEB_TOUR_STEPS: WebTourStep[] = [
  {
    route: HOME, // Record — resolved to the visible element (sidebar / #record)
    title: "Record",
    description:
      "Click Record anytime to capture what's on your mind. Sixty seconds is enough.",
    side: "right",
  },
  {
    route: HOME,
    selector: '[data-tour="dashboard"]',
    title: "Your dashboard",
    description:
      "Your home reflects your reflections. Patterns surface as you record.",
    side: "bottom",
  },
  {
    route: "/entries",
    selector: '[data-tour="entries-page"]',
    title: "Entries",
    description:
      "Every voice note lives here, processed into transcript + themes + mood.",
    side: "bottom",
  },
  {
    route: "/tasks",
    selector: '[data-tour="tasks-page"]',
    title: "Tasks",
    description:
      "Acuity extracts to-dos from what you say — they land here.",
    side: "bottom",
  },
  {
    route: "/insights",
    selector: '[data-tour="insights-page"]',
    title: "Insights",
    description:
      "Patterns, themes, and your weekly report. The longer you use it, the sharper this gets.",
    side: "bottom",
  },
  {
    route: "/goals",
    selector: '[data-tour="goals-page"]',
    title: "Goals",
    description:
      "Set what you're working toward; Acuity nudges you when entries touch it.",
    side: "bottom",
  },
  {
    route: "/account", // the web Settings route is /account
    selector: '[data-tour="settings-page"]',
    title: "Settings",
    description:
      "Themes, reminders, privacy, and replay-tour all live here.",
    side: "bottom",
  },
];

/** Visible anchor for a tourId (handles desktop/mobile variants of Record). */
function resolveVisibleAnchor(tourId: string): HTMLElement | null {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`)
  );
  return els.find((el) => el.offsetParent !== null) ?? null;
}

/**
 * Build + run the navigating tour. `navigate` pushes a route; `onEnd` is
 * called once when the tour finishes (completed = last step reached) or is
 * dismissed. Returns false if /home anchors aren't present yet (caller
 * retries). The tour routes the user back to /home on end.
 */
export function runWebTour(opts: {
  navigate: (path: string) => void;
  onEnd: (completed: boolean) => void;
}): boolean {
  const recordEl = resolveVisibleAnchor("record");
  if (!recordEl && !document.querySelector('[data-tour="dashboard"]')) {
    return false; // home shell not ready
  }

  const steps: DriveStep[] = WEB_TOUR_STEPS.map((s, i) => ({
    element:
      i === 0 ? recordEl ?? '[data-tour="record"]' : (s.selector as string),
    popover: {
      title: s.title,
      description: s.description,
      side: s.side ?? "bottom",
      align: "start",
    },
  }));

  const lastIndex = steps.length - 1;
  // "completed" = the user actually reached the final step. Tracked via a
  // flag set when the last step highlights, NOT read from getActiveIndex()
  // at destroy time — the cross-page navigation made that unreliable, so
  // genuine completions were posting completed:false and the server
  // (correctly) skipped the guided_start grant.
  let reachedLast = false;
  let completed = false;

  // Navigate (if the route changes) then run the driver mover after the
  // page settles.
  const step = (from: number, to: number, mover: () => void) => {
    const fromRoute = WEB_TOUR_STEPS[from]?.route;
    const toRoute = WEB_TOUR_STEPS[to]?.route;
    if (toRoute && toRoute !== fromRoute) {
      opts.navigate(toRoute);
      window.setTimeout(mover, NAV_SETTLE_MS);
    } else {
      mover();
    }
  };

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
    onHighlighted: () => {
      if ((d.getActiveIndex() ?? -1) >= lastIndex) reachedLast = true;
    },
    onNextClick: () => {
      const cur = d.getActiveIndex() ?? 0;
      if (cur >= lastIndex) {
        d.destroy(); // last step "Get started" → finish
        return;
      }
      step(cur, cur + 1, () => d.moveNext());
    },
    onPrevClick: () => {
      const cur = d.getActiveIndex() ?? 0;
      if (cur <= 0) return;
      step(cur, cur - 1, () => d.movePrevious());
    },
    onDestroyStarted: () => {
      completed = reachedLast;
      d.destroy();
    },
    onDestroyed: () => {
      opts.navigate(HOME); // always land back on home after the tour
      opts.onEnd(completed);
    },
  });

  d.drive();
  return true;
}
