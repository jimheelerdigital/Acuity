/**
 * Funnel welcome flow — order, progress and resume state.
 *
 * Who sees it: a signed-in web-funnel subscriber the server marks
 * `welcomeEligible` (apps/web/src/lib/welcome-eligibility.ts): Stripe PRO or
 * TRIAL, onboarding never actually completed, and either no entries or only
 * the one from the web funnel's first debrief.
 *
 * Web first debrief (2026-10-11, Jimmy: "Welcome, skip debrief"): those
 * users get every step EXCEPT "record"; the results step shows the web
 * entry. Anyone whose Art. 9 consent is already in the ledger skips
 * "consent" (the web debrief records it since 2026-10-11).
 * Source of the step list: the "EXISTING USER (CAME IN THRU FUNNEL)" column
 * on the Ripple App Planner Miro board, with ONE deliberate reorder:
 *
 *   Miro puts the AI-consent checkbox AFTER the first debrief. It has to
 *   come BEFORE: Apple rejected build 40 for sending audio to an AI
 *   provider before the user was told and agreed (Guidelines 5.1.1(i) /
 *   5.1.2(i)), and only 10 of 27 recent web subscribers had given the
 *   Art. 9 consent on the web. So consent sits right before the recorder.
 *
 * No paywall anywhere: these users already paid (Guideline 3.1.3(b)).
 *
 * Pure (no React Native imports) so it can be unit-tested from the web
 * vitest suite; storage lives in ./flow.ts.
 */

export type WelcomePhase =
  | "hello" // Welcome back, {name} — asks for a first name if we have none
  | "value" // What Ripple does and how it helps
  | "consent" // AI processing consent (before any audio leaves the device)
  | "record" // Hand-off to the real recorder (/record?from=welcome)
  | "notify" // While we analyze: check-in time + notification permission
  | "habit" // While we analyze: first habit (only when habits are enabled)
  | "results"; // Their first debrief's results, then the app tour

const ORDER: WelcomePhase[] = [
  "hello",
  "value",
  "consent",
  "record",
  "notify",
  "habit",
  "results",
];

export function isWelcomePhase(v: unknown): v is WelcomePhase {
  return typeof v === "string" && (ORDER as string[]).includes(v);
}

export type WelcomeOpts = {
  habitsEnabled: boolean;
  /** Art. 9 consent already granted (server `hasAiConsent`). */
  skipConsent?: boolean;
  /** First debrief already done on the web (server `webDebriefEntryId`). */
  skipRecord?: boolean;
};

export function phasesFor(opts: WelcomeOpts): WelcomePhase[] {
  return ORDER.filter(
    (p) =>
      !(p === "habit" && !opts.habitsEnabled) &&
      !(p === "consent" && opts.skipConsent) &&
      !(p === "record" && opts.skipRecord)
  );
}

/** The phase after `phase`, or null when it is the last one. */
export function nextPhase(
  phase: WelcomePhase,
  opts: WelcomeOpts
): WelcomePhase | null {
  const list = phasesFor(opts);
  const i = list.indexOf(phase);
  if (i < 0 || i >= list.length - 1) return null;
  return list[i + 1];
}

/**
 * Fraction for the continuous progress bar (Miro: "a progress bar, not
 * steps"). Never 0 — an empty bar on the first screen reads as broken — and
 * exactly 1 on the last.
 */
export function progressFor(
  phase: WelcomePhase,
  opts: WelcomeOpts
): number {
  const list = phasesFor(opts);
  const i = list.indexOf(phase);
  if (i < 0) return 0;
  return (i + 1) / list.length;
}

/**
 * Where to land on (re)entry. A debrief already sent means the "while we
 * analyze" setup is next, whatever was stored; otherwise resume the stored
 * phase. "record" (consent given, recorder opened, nothing sent — e.g. they
 * backed out) renders the consent screen pre-agreed, one tap from the mic.
 */
export function resumePhase(
  stored: WelcomePhase | null,
  entryId: string | null,
  opts: WelcomeOpts = { habitsEnabled: true }
): WelcomePhase {
  const list = phasesFor(opts);
  const has = (p: WelcomePhase | null): p is WelcomePhase => p != null && list.includes(p);

  // Debrief came from the web: no recorder hand-off, just walk the list
  // from wherever they were.
  if (opts.skipRecord) return has(stored) ? stored : list[0];

  let to: WelcomePhase;
  if (entryId) {
    to = stored === "habit" || stored === "results" ? stored : "notify";
  } else if (!stored) {
    to = "hello";
  } else if (stored === "notify" || stored === "habit" || stored === "results") {
    // Setup/results without a debrief can't render anything useful.
    to = "consent";
  } else {
    // "record" = consent given and the recorder opened, nothing sent.
    to = stored;
  }
  if (has(to)) return to;
  // Not in this user's list (habits off, consent already on file): the
  // next phase that is, in canonical order.
  const after = ORDER.slice(ORDER.indexOf(to)).find((p) => list.includes(p));
  return after ?? list[0];
}

/** Habit ideas offered on the habit step (Miro: pre-fill 2–3 suggestions). */
export const WELCOME_HABIT_SUGGESTIONS = [
  "Drink more water",
  "Move for 20 minutes",
  "Read before bed",
] as const;
