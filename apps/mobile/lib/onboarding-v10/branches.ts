/**
 * Onboarding v10 — the six recognition branches.
 *
 * ONE definition for every branch-dependent string in the flow. The branch
 * chosen on Screen 1 drives Screen 2's mirror line, Screen 3's sub-prompt,
 * Screen 5's fallback observation, and the paywall's testimonial match. Those
 * live together here because the failure mode otherwise is a branch that
 * reads well on one screen and wrong on the next.
 *
 * Copy is VERBATIM from docs/onboarding-v10-spec.md §4. Do not paraphrase —
 * the wording is the product, and the spec's hard rules constrain it:
 *   - the word is "debrief"; never "brain dump", "journal entry", "check-in"
 *   - no bedtime / nightly / morning-routine / ritual framing
 *   - no medical, diagnostic or guaranteed-outcome claims
 *   - no invented metrics or insight unsupported by the transcript
 *
 * This file replaces what `q1` used to do. The legacy flow derived a branch
 * from the q1 diagnostic answer (`q1ToBranch` in paywall.tsx and
 * how-it-works.tsx); v10 asks the branch question directly on Screen 1, so
 * the same personalization arrives one screen in instead of six.
 */

export const V10_BRANCH_KEYS = [
  "overload",
  "patterns",
  "rumination",
  "stuck",
  "mask",
  "open",
] as const;

export type V10Branch = (typeof V10_BRANCH_KEYS)[number];

export function isV10Branch(v: unknown): v is V10Branch {
  return typeof v === "string" && (V10_BRANCH_KEYS as readonly string[]).includes(v);
}

export interface V10BranchConfig {
  key: V10Branch;
  /** Screen 1 card title. */
  card: string;
  /** Screen 1 card support line. */
  support: string;
  /** Screen 2 large branch line. */
  mirror: string;
  /**
   * Screen 5 fallback for the observation card, used when the real
   * observation is too low-confidence to show. NOT a synthetic insight — it
   * makes no claim about the transcript's content, it just acknowledges the
   * debrief happened. That distinction is why these are safe under the
   * no-fabricated-patterns rule.
   */
  observationFallback: string;
}

/** Screen 1 headline. */
export const V10_RECOGNITION_HEADLINE =
  "What's taking up the most space in your head right now?";

/** Screen 2 universal line, shown under the branch line for every branch. */
export const V10_UNIVERSAL_LINE =
  "You don't have to become someone who journals. Just say what's there once — about a minute — and see what comes back.";

/** Screen 2 CTA. Coral, and the first light element on a dark screen. */
export const V10_START_CTA = "Start my debrief";

/** Screen 3 top prompt (branch sub-prompt renders underneath). */
export const V10_RECORDING_PROMPT =
  "What's been taking up the most space in your head?";

export const V10_RECORDING_GUIDANCE =
  "Speak naturally. Pause, ramble, change subjects, stop whenever.";

/**
 * Shown at ~20s and then STAYS. Not a countdown and not a minimum — the spec
 * is explicit that there is no floor, only reassurance that enough has been
 * said to be useful.
 */
export const V10_SOFT_FLOOR_LINE =
  "That's enough for Ripple to begin finding the threads.";

export const V10_SOFT_FLOOR_AT_MS = 20_000;

/** Screen 3 optional chips. Tapping swaps the top prompt; recording never pauses. */
export const V10_RECORDING_CHIPS = [
  { key: "list", label: "what's on my list" },
  { key: "bugging", label: "what's bugging me" },
  { key: "today", label: "how today went" },
] as const;

export type V10ChipKey = (typeof V10_RECORDING_CHIPS)[number]["key"];

export const V10_BRANCHES: Record<V10Branch, V10BranchConfig> = {
  overload: {
    key: "overload",
    card: "The load",
    support: "Everyone's list lives in my head.",
    mirror: "You carry the list for everyone. It never really leaves your head.",
    observationFallback: "{n} things off your head. Nothing lost.",
  },
  patterns: {
    key: "patterns",
    card: "The cycle",
    support: "Same problems. Same week. Again.",
    mirror: "You already know how this week goes. You've lived it before.",
    observationFallback: "First entry down. Patterns need a few more.",
  },
  rumination: {
    key: "rumination",
    card: "The loop",
    support: "I keep replaying it.",
    mirror: "You replay it. Then you replay the replay.",
    observationFallback: "It's out of your head and on the screen.",
  },
  stuck: {
    key: "stuck",
    card: "The treadmill",
    support: "Busy all day. Nothing moves.",
    mirror: "Every day is full. None of it feels like progress.",
    observationFallback: "Here's what actually happened today, in writing.",
  },
  mask: {
    key: "mask",
    card: "The mask",
    support: "Holding it together for everyone else.",
    mirror: "Everyone thinks you've got it. Nobody asks if you do.",
    observationFallback: "This one's just for you.",
  },
  open: {
    key: "open",
    card: "Just let me talk",
    support: "I don't need a category.",
    mirror: "Whatever's there. No category needed.",
    observationFallback: "Said once. Kept.",
  },
};

/** Screen 1 card order, as specified. */
export const V10_BRANCH_ORDER: V10Branch[] = [
  "overload",
  "patterns",
  "rumination",
  "stuck",
  "mask",
  "open",
];

/**
 * Resolve the fallback observation, substituting `{n}` where the branch copy
 * uses it. `n` is a REAL count of extracted tasks — never a placeholder or an
 * invented number. When we have no count, the `{n}` branch degrades to the
 * `open` line rather than rendering a literal "{n}".
 */
export function resolveObservationFallback(
  branch: V10Branch,
  taskCount: number | null
): string {
  const raw = V10_BRANCHES[branch].observationFallback;
  if (!raw.includes("{n}")) return raw;
  if (typeof taskCount !== "number" || taskCount <= 0) {
    return V10_BRANCHES.open.observationFallback;
  }
  return raw.replace("{n}", String(taskCount));
}
