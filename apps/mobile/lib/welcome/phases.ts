/**
 * Funnel welcome flow: order, progress, setup checklist and resume state.
 *
 * Who sees it: a signed-in web-funnel subscriber the server marks
 * `welcomeEligible` (apps/web/src/lib/welcome-eligibility.ts): Stripe PRO or
 * TRIAL, onboarding never actually completed, and either no entries or only
 * the one from the web funnel's first debrief.
 *
 * Design (approved by Jimmy 2026-10-12, "Ripple Welcome Flow Redesign"
 * canvas): one flow, one look. Setup screens, then the app tour runs on the
 * real tabs as the LAST setup step, with the same coral cards and the same
 * progress bar (components/tour/welcome-tour.ts). No separate tour after.
 *
 *   Debrief done on the web:  hello → consent → results → notify → habit → tour
 *   Debrief recorded here:    hello → consent → record → notify → habit → results → tour
 *
 * Consent always comes BEFORE the recorder: Apple rejected build 40 for
 * sending audio to an AI provider before the user agreed (5.1.1(i) /
 * 5.1.2(i)). It is skipped when the Art. 9 grant is already in the ledger.
 * "habit" only when habits are enabled. No paywall anywhere (3.1.3(b)).
 *
 * Pure (no React Native imports) so the web vitest suite can test it;
 * storage lives in ./flow.ts.
 */

export type WelcomePhase =
  | "hello" // Welcome back + the setup checklist (asks for a name if missing)
  | "consent" // AI processing consent
  | "record" // Hand-off to the real recorder (/record?from=welcome)
  | "notify" // Daily check-in time + notification permission
  | "habit" // First habit (only when habits are enabled)
  | "results"; // What Ripple heard in their first debrief

/** Every phase a stored state may hold (older builds also stored "value"). */
const ALL: WelcomePhase[] = ["hello", "consent", "record", "notify", "habit", "results"];

/** Tour cards after the setup screens: Home, Entries, Tasks, Growth, Insights, done. */
export const WELCOME_TOUR_CARDS = 6;

export function isWelcomePhase(v: unknown): v is WelcomePhase {
  return typeof v === "string" && (ALL as string[]).includes(v);
}

export type WelcomeOpts = {
  habitsEnabled: boolean;
  /** Art. 9 consent already granted (server `hasAiConsent`). */
  skipConsent?: boolean;
  /** First debrief already done on the web (server `webDebriefEntryId`). */
  skipRecord?: boolean;
};

export function phasesFor(opts: WelcomeOpts): WelcomePhase[] {
  const order: WelcomePhase[] = opts.skipRecord
    ? ["hello", "consent", "results", "notify", "habit"]
    : ["hello", "consent", "record", "notify", "habit", "results"];
  return order.filter(
    (p) => !(p === "habit" && !opts.habitsEnabled) && !(p === "consent" && opts.skipConsent)
  );
}

/** The phase after `phase`, or null when the tour comes next. */
export function nextPhase(phase: WelcomePhase, opts: WelcomeOpts): WelcomePhase | null {
  const list = phasesFor(opts);
  const i = list.indexOf(phase);
  if (i < 0 || i >= list.length - 1) return null;
  return list[i + 1];
}

/**
 * One continuous bar across setup AND tour (Miro: "a progress bar, not
 * steps"). Never 0 on the first screen; exactly 1 on the last tour card.
 */
export function progressFor(phase: WelcomePhase, opts: WelcomeOpts): number {
  const list = phasesFor(opts);
  const i = list.indexOf(phase);
  if (i < 0) return 0;
  return (i + 1) / (list.length + WELCOME_TOUR_CARDS);
}

/** The bar on tour card `card` (0-based), given how many setup screens ran. */
export function tourProgress(setupScreens: number, card: number): number {
  const total = setupScreens + WELCOME_TOUR_CARDS;
  return Math.min(1, (setupScreens + card + 1) / total);
}

export type SetupStep = { key: WelcomePhase | "tour"; label: string };

const STEP_LABELS: Record<WelcomePhase | "tour", string> = {
  hello: "",
  consent: "How Ripple uses AI",
  record: "Record your first debrief",
  results: "See what Ripple heard",
  notify: "Pick a daily check-in",
  habit: "Pick a first habit",
  tour: "A quick look around",
};

/** The numbered checklist on the hello screen: every step after it, then the tour. */
export function setupSteps(opts: WelcomeOpts): SetupStep[] {
  return [
    ...phasesFor(opts)
      .filter((p) => p !== "hello")
      .map((p) => ({ key: p, label: STEP_LABELS[p] })),
    { key: "tour", label: STEP_LABELS.tour },
  ];
}

/** "Step N of M" for a phase (or the tour); null for hello. */
export function stepOf(key: WelcomePhase | "tour", opts: WelcomeOpts): { n: number; of: number } | null {
  const steps = setupSteps(opts);
  const i = steps.findIndex((s) => s.key === key);
  return i < 0 ? null : { n: i + 1, of: steps.length };
}

/**
 * Where to land on (re)entry.
 *   - Web debrief: walk the list from wherever they were.
 *   - Recorded here: a debrief already sent means setup is next ("notify"),
 *     unless they were further on; no debrief yet means back to consent
 *     (or the recorder hand-off when consent is on file).
 * Anything not in this user's list falls back to the start.
 */
export function resumePhase(
  stored: WelcomePhase | null,
  entryId: string | null,
  opts: WelcomeOpts = { habitsEnabled: true }
): WelcomePhase {
  const list = phasesFor(opts);
  const has = (p: WelcomePhase | null): p is WelcomePhase => p != null && list.includes(p);

  if (opts.skipRecord) return has(stored) ? stored : list[0];

  let to: WelcomePhase;
  if (entryId) {
    to = stored === "habit" || stored === "results" ? stored : "notify";
  } else if (!stored) {
    to = "hello";
  } else if (stored === "notify" || stored === "habit" || stored === "results") {
    // Setup/results without a debrief can't render anything useful.
    to = opts.skipConsent ? "record" : "consent";
  } else {
    // "record" = consent given and the recorder opened, nothing sent.
    to = stored;
  }
  if (has(to)) return to;
  // habit off: the next phase that is in the list.
  const i = ALL.indexOf(to);
  return list.find((p) => ALL.indexOf(p) > i) ?? list[0];
}

/** Habit ideas offered on the habit step (Miro: pre-fill 2–3 suggestions). */
export const WELCOME_HABIT_SUGGESTIONS = [
  "Drink more water",
  "Move for 20 minutes",
  "Read before bed",
] as const;
