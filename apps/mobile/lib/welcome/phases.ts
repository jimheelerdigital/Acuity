/**
 * Funnel welcome flow — order, progress and resume state.
 *
 * Who sees it: a signed-in web-funnel subscriber (PRO) with onboarding
 * unfinished and zero recordings (lib/onboarding-v10/entry-routing.ts).
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

export function phasesFor({ habitsEnabled }: { habitsEnabled: boolean }): WelcomePhase[] {
  return habitsEnabled ? ORDER : ORDER.filter((p) => p !== "habit");
}

/** The phase after `phase`, or null when it is the last one. */
export function nextPhase(
  phase: WelcomePhase,
  opts: { habitsEnabled: boolean }
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
  opts: { habitsEnabled: boolean }
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
  entryId: string | null
): WelcomePhase {
  if (entryId) {
    if (stored === "habit" || stored === "results") return stored;
    return "notify";
  }
  if (!stored) return "hello";
  // Consent was given and the recorder opened, but nothing was sent.
  if (stored === "record") return "record";
  // Setup/results without a debrief can't render anything useful.
  if (stored === "notify" || stored === "habit" || stored === "results") return "consent";
  return stored;
}

/** Habit ideas offered on the habit step (Miro: pre-fill 2–3 suggestions). */
export const WELCOME_HABIT_SUGGESTIONS = [
  "Drink more water",
  "Move for 20 minutes",
  "Read before bed",
] as const;
