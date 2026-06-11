import { driver, type DriveStep, type PopoverDOM } from "driver.js";
import "driver.js/dist/driver.css";
import "./web-tour.css"; // mobile-safe popover overrides (Next-button clip fix)

/**
 * Web product tour (driver.js) — web equivalent of the iOS 7-step tour.
 * Each step NAVIGATES to its section's page (so the page content is
 * visible behind the overlay) and spotlights the SECTION'S NAV LINK —
 * the desktop left-sidebar link, or the mobile top-nav link — teaching
 * "click this to come back here." Anchoring on the nav (always mounted,
 * lives in the persistent root layout) instead of page content removes
 * the render race that previously broke the tour mid-flow.
 *
 * Anchors are resolved to the VISIBLE element at build time (desktop
 * sidebar vs mobile top-nav). The shell persists across router.push, so
 * those element refs stay valid as the tour navigates. Steps whose anchor
 * isn't present at the current width are skipped (e.g. Entries has no
 * mobile top-nav link).
 *
 * Completion: the grant fires ONLY when the user clicks "Get started" on
 * the last step (onNextClick at lastIndex sets completed=true). Skip / X /
 * Esc / overlay all close with completed=false → server stamps
 * tourCompletedAt (done, won't re-prompt) but does NOT grant guided_start.
 */

const HOME = "/home";

/** Delay after navigating before driver measures + moves to the step. */
export const NAV_SETTLE_MS = 450;

interface WebTourStep {
  /** data-tour id of the anchor (resolved to its visible element). */
  tourId: string;
  /** Route this step lives on; navigated to before the step shows. */
  route: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
}

const WEB_TOUR_STEPS: WebTourStep[] = [
  { tourId: "record", route: HOME, title: "Record", description: "Click Record anytime to capture what's on your mind. Sixty seconds is enough.", side: "right" },
  { tourId: "dashboard", route: HOME, title: "Your dashboard", description: "Your home reflects your reflections. Patterns surface as you record.", side: "bottom" },
  { tourId: "entries", route: "/entries", title: "Entries", description: "Every voice note lives here, processed into transcript + themes + mood.", side: "right" },
  { tourId: "tasks", route: "/tasks", title: "Tasks", description: "Acuity extracts to-dos from what you say — they land here.", side: "right" },
  { tourId: "insights", route: "/insights", title: "Insights", description: "Patterns, themes, and your weekly report. The longer you use it, the sharper this gets.", side: "right" },
  { tourId: "goals", route: "/goals", title: "Goals", description: "Set what you're working toward; Acuity nudges you when entries touch it.", side: "right" },
  { tourId: "settings", route: "/account", title: "Settings", description: "Themes, reminders, privacy, and replay-tour all live here.", side: "bottom" },
];

/** Visible anchor for a tourId (picks desktop-sidebar vs mobile-nav). */
function resolveVisibleAnchor(tourId: string): HTMLElement | null {
  const els = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tour="${tourId}"]`)
  );
  return els.find((el) => el.offsetParent !== null) ?? null;
}

/**
 * Build + run the tour. `navigate` pushes a route; `onEnd(completed)`
 * runs once at the end. Returns false if no anchors resolve (caller
 * retries). The tour routes back to /home on end.
 */
export function runWebTour(opts: {
  navigate: (path: string) => void;
  onEnd: (completed: boolean) => void;
}): boolean {
  // Resolve each step to its visible anchor NOW (shell is mounted on
  // /home). Drop steps with no visible anchor at this viewport (e.g.
  // Entries on mobile, which has no top-nav link).
  const resolved = WEB_TOUR_STEPS.map((s) => ({
    ...s,
    el: resolveVisibleAnchor(s.tourId),
  })).filter((s): s is WebTourStep & { el: HTMLElement } => s.el != null);

  if (resolved.length === 0) return false;

  const driverSteps: DriveStep[] = resolved.map((s) => ({
    element: s.el,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side ?? "bottom",
      align: "start",
    },
  }));

  const lastIndex = resolved.length - 1;
  // Grant decision: set true ONLY by the explicit "Get started" click on
  // the last step. reachedLast is tracked as a non-load-bearing backup.
  let completed = false;
  let reachedLast = false;

  const step = (from: number, to: number, mover: () => void) => {
    const fromRoute = resolved[from]?.route;
    const toRoute = resolved[to]?.route;
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
    steps: driverSteps,
    onHighlighted: () => {
      if ((d.getActiveIndex() ?? -1) >= lastIndex) reachedLast = true;
    },
    // Add an explicit "Skip tour" button to every popover footer. Skip
    // closes the tour (completed stays false → no grant; server still
    // stamps tourCompletedAt so it won't re-prompt, but it's replayable
    // from Settings).
    onPopoverRender: (popover: PopoverDOM) => {
      const skip = document.createElement("button");
      skip.type = "button";
      skip.textContent = "Skip tour";
      skip.className = "acuity-web-tour-skip";
      skip.style.cssText =
        "margin-right:auto;background:none;border:none;color:#9ca3af;" +
        "font-size:13px;cursor:pointer;padding:0;";
      skip.addEventListener("click", () => d.destroy());
      popover.footer?.prepend(skip);
    },
    onNextClick: () => {
      const cur = d.getActiveIndex() ?? 0;
      if (cur >= lastIndex) {
        // "Get started" on the last step = the ONLY completion signal.
        completed = true;
        d.destroy();
        return;
      }
      step(cur, cur + 1, () => d.moveNext());
    },
    onPrevClick: () => {
      const cur = d.getActiveIndex() ?? 0;
      if (cur <= 0) return;
      step(cur, cur - 1, () => d.movePrevious());
    },
    // X / Esc / overlay / Skip all land here. Do NOT set completed — only
    // the Get-started click does. Must call destroy() ourselves.
    onDestroyStarted: () => {
      d.destroy();
    },
    onDestroyed: () => {
      void reachedLast; // tracked backup; not used for the grant decision
      opts.navigate(HOME);
      opts.onEnd(completed);
    },
  });

  d.drive();
  return true;
}
