/**
 * The app tour as the last step of the funnel welcome flow (approved
 * 2026-10-12, "Ripple Welcome Flow Redesign" canvas). Same engine and
 * targets as the standard tour (TourProvider + AttachStep), but its own
 * stops, copy, coral card (WelcomeTourCard) and a progress bar that
 * continues from the welcome screens. No second tour runs afterwards.
 *
 * Pure (no React Native imports) so the web vitest suite can test it.
 */
import { TOUR_STEP_INDEX } from "./steps";

/** Written by app/welcome.tsx on finish; consumed by useTourTrigger on Home focus. */
export const WELCOME_TOUR_KEY = "ripple.welcomeTour.v1";

export interface WelcomeTourRequest {
  /** Setup screens shown before the tour (for the continuous progress bar). */
  setupScreens: number;
  /** "Step N of M" numbering: the tour is step M. */
  stepOf: number;
  firstName: string | null;
  /** e.g. "9:00 PM", or null when they chose no reminders. */
  checkInTime: string | null;
}

export function parseWelcomeTourRequest(raw: string | null): WelcomeTourRequest | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<WelcomeTourRequest>;
    const setupScreens = typeof v.setupScreens === "number" && v.setupScreens > 0 ? Math.floor(v.setupScreens) : 4;
    const stepOf = typeof v.stepOf === "number" && v.stepOf > 0 ? Math.floor(v.stepOf) : 4;
    return {
      setupScreens,
      stepOf,
      firstName: typeof v.firstName === "string" && v.firstName.trim() ? v.firstName.trim() : null,
      checkInTime: typeof v.checkInTime === "string" && v.checkInTime ? v.checkInTime : null,
    };
  } catch {
    return null;
  }
}

export interface WelcomeTourCard {
  /** Spotlight step index (an existing AttachStep target). */
  target: number;
  label: string;
  title: string;
  body: string;
  cta: string;
}

/** Home → Tasks → Entries → Insights → done (back on Home). */
export function welcomeTourCards(req: WelcomeTourRequest): WelcomeTourCard[] {
  const step = `Step ${req.stepOf} of ${req.stepOf}`;
  const who = req.firstName ? `, ${req.firstName}` : "";
  return [
    {
      target: TOUR_STEP_INDEX.mic,
      label: `${step} · A quick look around`,
      title: "This is Home",
      body: "Tap here to come back anytime. Hold it to start a debrief right away. A minute is enough.",
      cta: "Next",
    },
    {
      target: TOUR_STEP_INDEX.tasks,
      label: `${step} · Tasks`,
      title: "Your to-dos land here",
      body: "Anything you say you need to do shows up on this list, already written for you.",
      cta: "Next",
    },
    {
      target: TOUR_STEP_INDEX.entries,
      label: `${step} · Entries`,
      title: "Every debrief, kept",
      body: "Your first one is already here, with its summary, mood and themes.",
      cta: "Next",
    },
    {
      target: TOUR_STEP_INDEX.insights,
      label: `${step} · Insights`,
      title: "Patterns over time",
      body: "After a few debriefs Ripple shows what keeps coming up, and your weekly report starts.",
      cta: "Next",
    },
    {
      target: TOUR_STEP_INDEX.mic,
      label: "You're all set",
      title: req.checkInTime ? `Talk to you soon${who}` : `You're all set${who}`,
      body: req.checkInTime
        ? `We'll check in at ${req.checkInTime}. Or hold Home whenever something's on your mind.`
        : "Hold Home whenever something's on your mind. A minute is enough.",
      cta: "Start using Ripple",
    },
  ];
}
