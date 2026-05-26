import type {
  Q1Answer,
  Q2Answer,
  Q4Answer,
  Q5Answer,
} from "@/contexts/onboarding-context";

/**
 * Personalized promise lookup — mobile mirror of the web funnel's
 * getPersonalizedPromise(answers) function in apps/web/src/
 * components/onboarding-funnel.tsx. Same priority order (specific
 * combinations first, then loop-only fallbacks, then the generic
 * line), same copy verbatim.
 *
 * Web uses display-string equality (e.g. loop === "Work bleeds into
 * life"); mobile uses the stable key strings from the onboarding
 * context (e.g. q1 === "work_bleeds"). Logic stays identical because
 * the keys are one-to-one with the labels.
 *
 * Returns null only when no input is provided yet (defensive — every
 * production path through this function has q1 set, so the fallback
 * line at the bottom catches the no-match case).
 */
export function getPersonalizedPromise(answers: {
  q1: Q1Answer | null;
  q2: Q2Answer | null;
  q4: Q4Answer[];
  q5: Q5Answer | null;
}): string {
  const { q1, q2, q4, q5 } = answers;

  // ── Specific combinations (cost / desire) — checked first ──
  if (
    q1 === "blurry_days" &&
    q2 === "over_a_year" &&
    q4.includes("relationships_suffering")
  ) {
    return "You've been stuck in this loop for over a year, and your relationships are paying the price. Acuity will show you the pattern in 60 seconds of your voice.";
  }
  if (q1 === "work_bleeds" && q4.includes("dont_recognize_self")) {
    return "Work has been swallowing your life and you don't even recognize yourself anymore. Acuity will show you exactly where you disappeared.";
  }
  if (q1 === "goals_not_real" && q5 === "follow_through") {
    return "You know what you want. Acuity catches the goals you mention and holds you to them — so this time, you actually follow through.";
  }
  if (q1 === "same_fights" && q4.includes("relationships_suffering")) {
    return "The same arguments keep cycling and your relationships are paying for it. Acuity surfaces the pattern so you can finally break it.";
  }

  // ── Loop + duration fallbacks ──
  if (q1 === "blurry_days" && q2 === "over_a_year") {
    return "You've been stuck in this loop for over a year. Acuity will show you the pattern in 60 seconds of your voice.";
  }
  if (q1 === "work_bleeds" && (q2 === "few_months" || q2 === "over_a_year")) {
    return "Work has been bleeding into your life for months. Acuity will show you exactly where the line disappears.";
  }

  // ── Loop-only fallbacks ──
  if (q1 === "same_fights") {
    return "The same conversations keep happening because the same patterns keep running. Acuity will show you the loop.";
  }
  if (q1 === "goals_not_real") {
    return "Your goals stay abstract because nothing holds you accountable daily. Acuity extracts action from intention.";
  }

  // ── Generic ──
  return "Acuity will show you the pattern in 60 seconds of your voice.";
}
