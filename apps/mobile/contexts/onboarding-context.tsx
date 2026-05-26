import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Onboarding-v2 (pain-first) state — slice 3 v1.2.
 *
 * Holds the three diagnostic answers (q1 single, q2 single, q3
 * multi) collected on screens 2-4 of the new onboarding. Read by:
 *   - Screen 6 (personalized promise) — q1 key picks the variant
 *   - Screen 10 (signup) — sends all three to /api/auth/mobile-signup
 *     so the server persists them on UserOnboarding + emits the
 *     OnboardingEvent rows from slice 11 analytics
 *
 * Stable string keys (not display labels) so the schema column +
 * analytics events stay legible if marketing rewords the cards
 * later. Display labels live in this file as well so screens stay
 * dumb — they consume Q*_OPTIONS, never hardcode their own text.
 *
 * Context is intentionally minimal — three fields, no async, no
 * I/O. Persistence to the server happens once at signup; we don't
 * mirror to AsyncStorage because a user who abandons the flow
 * should restart fresh, not get auto-rehydrated into a half-
 * answered diagnostic on next launch.
 */

export type Q1Answer =
  | "work_bleeds"
  | "same_fights"
  | "goals_not_real"
  | "blurry_days"
  | "something_else";

export type Q2Answer =
  | "few_weeks"
  | "few_months"
  | "over_a_year"
  | "cant_remember";

export type Q3Answer =
  | "journaling"
  | "therapy"
  | "productivity"
  | "push_through"
  | "all_of_above";

// Diagnostic Q4 — "What's it costing you?". Multi-select, mirrors
// the web funnel's DIAGNOSTIC4_OPTIONS (apps/web/src/components/
// onboarding-funnel.tsx). Web does NOT include an "All of the above"
// option here, intentionally — none of the cost framings reduce to
// a single bucket. Mobile matches.
export type Q4Answer =
  | "dropping_balls_work"
  | "relationships_suffering"
  | "health_slipping"
  | "dont_recognize_self";

// Diagnostic Q5 — "What would change if you could finally see the
// pattern?". Single-select, mirrors DIAGNOSTIC5_OPTIONS. The four
// answers feed into the slice 6 personalized-promise expansion
// (web's getPersonalizedPromise uses all of loop/duration/cost/
// desire to pick the variant).
export type Q5Answer =
  | "stop_repeating"
  | "follow_through"
  | "control_life"
  | "be_the_person";

export interface OnboardingOption<K extends string> {
  key: K;
  label: string;
}

export const Q1_OPTIONS: OnboardingOption<Q1Answer>[] = [
  { key: "work_bleeds", label: "Work bleeds into life" },
  { key: "same_fights", label: "Same fights, same conversations" },
  { key: "goals_not_real", label: "Goals that never become real" },
  { key: "blurry_days", label: "Days that blur together" },
  { key: "something_else", label: "Something else" },
];

export const Q2_OPTIONS: OnboardingOption<Q2Answer>[] = [
  { key: "few_weeks", label: "A few weeks" },
  { key: "few_months", label: "A few months" },
  { key: "over_a_year", label: "Over a year" },
  { key: "cant_remember", label: "I can't remember when it started" },
];

export const Q3_OPTIONS: OnboardingOption<Q3Answer>[] = [
  { key: "journaling", label: "Journaling (couldn't keep it up)" },
  { key: "therapy", label: "Therapy (not enough between sessions)" },
  { key: "productivity", label: "Productivity apps (too much work)" },
  { key: "push_through", label: "Nothing — I just push through" },
  { key: "all_of_above", label: "All of the above" },
];

export const Q4_OPTIONS: OnboardingOption<Q4Answer>[] = [
  { key: "dropping_balls_work", label: "I'm dropping balls at work" },
  { key: "relationships_suffering", label: "My relationships are suffering" },
  { key: "health_slipping", label: "My health is slipping" },
  { key: "dont_recognize_self", label: "I don't recognize myself anymore" },
];

export const Q5_OPTIONS: OnboardingOption<Q5Answer>[] = [
  { key: "stop_repeating", label: "I'd stop repeating the same mistakes" },
  { key: "follow_through", label: "I'd actually follow through on goals" },
  { key: "control_life", label: "I'd feel in control of my life again" },
  { key: "be_the_person", label: "I'd be the person I know I can be" },
];

interface OnboardingContextValue {
  q1: Q1Answer | null;
  q2: Q2Answer | null;
  q3: Q3Answer[];
  q4: Q4Answer[];
  q5: Q5Answer | null;
  setQ1: (answer: Q1Answer) => void;
  setQ2: (answer: Q2Answer) => void;
  toggleQ3: (answer: Q3Answer) => void;
  toggleQ4: (answer: Q4Answer) => void;
  setQ5: (answer: Q5Answer) => void;
  reset: () => void;
}

const noop = () => {};

const OnboardingContext = createContext<OnboardingContextValue>({
  q1: null,
  q2: null,
  q3: [],
  q4: [],
  q5: null,
  setQ1: noop,
  setQ2: noop,
  toggleQ3: noop,
  toggleQ4: noop,
  setQ5: noop,
  reset: noop,
});

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [q1, setQ1State] = useState<Q1Answer | null>(null);
  const [q2, setQ2State] = useState<Q2Answer | null>(null);
  const [q3, setQ3State] = useState<Q3Answer[]>([]);
  const [q4, setQ4State] = useState<Q4Answer[]>([]);
  const [q5, setQ5State] = useState<Q5Answer | null>(null);

  const setQ1 = useCallback((answer: Q1Answer) => {
    setQ1State(answer);
  }, []);

  const setQ2 = useCallback((answer: Q2Answer) => {
    setQ2State(answer);
  }, []);

  // Q3 is multi-select with a special "all_of_above" semantic — when
  // the user taps it, the other selections clear; tapping any other
  // option while "all_of_above" is selected clears the all_of_above
  // and leaves only the new pick. Standard "All of the above" UX.
  const toggleQ3 = useCallback((answer: Q3Answer) => {
    setQ3State((prev) => {
      if (answer === "all_of_above") {
        return prev.includes("all_of_above") ? [] : ["all_of_above"];
      }
      const filtered = prev.filter((x) => x !== "all_of_above");
      return filtered.includes(answer)
        ? filtered.filter((x) => x !== answer)
        : [...filtered, answer];
    });
  }, []);

  // Q4 — plain multi-select (no "All of the above" mutex; web's
  // DIAGNOSTIC4_OPTIONS doesn't include that option, mobile matches).
  const toggleQ4 = useCallback((answer: Q4Answer) => {
    setQ4State((prev) =>
      prev.includes(answer) ? prev.filter((x) => x !== answer) : [...prev, answer]
    );
  }, []);

  const setQ5 = useCallback((answer: Q5Answer) => {
    setQ5State(answer);
  }, []);

  const reset = useCallback(() => {
    setQ1State(null);
    setQ2State(null);
    setQ3State([]);
    setQ4State([]);
    setQ5State(null);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      q1,
      q2,
      q3,
      q4,
      q5,
      setQ1,
      setQ2,
      toggleQ3,
      toggleQ4,
      setQ5,
      reset,
    }),
    [q1, q2, q3, q4, q5, setQ1, setQ2, toggleQ3, toggleQ4, setQ5, reset]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingState(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
