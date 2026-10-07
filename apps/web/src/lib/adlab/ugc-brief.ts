/**
 * UGC creator brief format (2026-10-06, per Keenan).
 *
 * Real creators get a loose four-part shape — hook → problem → demo → call
 * to action — and say it in their own words. This is deliberately NOT the
 * in-house animated video script (the fixed per-template scripts in
 * weekly-batch.ts, which Ripple renders itself): a creator reading lines
 * sounds like an ad, a creator talking sounds like a person.
 *
 * Every brief carries the claims rule and the copy rules from
 * lib/positioning.ts, so an outreach email or brief can never drift from
 * them. Used by the UGC outreach system (lib/ugc/brief.ts, 2026-10-06).
 */
import {
  ACQUISITION_TERM_RULE,
  CLAIMS_RULE,
  PAIN_BRANCH_STARTERS,
  PRODUCT_ONE_LINER,
  TIME_OF_DAY_RULE,
} from "@/lib/positioning";

export const UGC_BRIEF_BEATS = [
  {
    key: "hook",
    label: "Hook",
    guide: "Open on a real moment from your own week: something you said, did or caught yourself doing. No intro, no \"hey guys\".",
  },
  {
    key: "problem",
    label: "Problem",
    guide: "Say what that moment is really about, the way you'd tell a friend: too much in your head, the same week on repeat, knowing what to do and not doing it.",
  },
  {
    key: "demo",
    label: "Demo",
    guide: "Show Ripple on your phone: talk to it, then show what it handed back (your to-do list, a habit it tracked, something that keeps coming up, your weekly report).",
  },
  {
    key: "cta",
    label: "Call to action",
    guide: "Tell people where to get it and that there's a 7-day free trial, in your own words.",
  },
] as const;

export interface UgcBriefInput {
  /** Creator's first name, for the greeting. */
  creatorName?: string;
  /** Optional angle to steer the hook. */
  angle?: string;
  /** Optional PAIN_BRANCH_STARTERS key; a suggestion, never a requirement. */
  painBranch?: string;
}

/** Plain-text brief for one creator. Always includes the claims rule. */
export function buildUgcBrief(input: UgcBriefInput = {}): string {
  const branch = PAIN_BRANCH_STARTERS.find((b) => b.key === input.painBranch);
  return [
    input.creatorName ? `Hi ${input.creatorName},` : "Hi,",
    "",
    `What Ripple is: ${PRODUCT_ONE_LINER}`,
    "",
    "The shape (loose; say it your way, no script to read):",
    ...UGC_BRIEF_BEATS.map((b, i) => `${i + 1}. ${b.label}: ${b.guide}`),
    ...(input.angle ? ["", `Angle to start from: ${input.angle}`] : []),
    ...(branch ? ["", `A pain to start from (optional): ${branch.name}, ${branch.pain}.`] : []),
    "",
    "Rules:",
    `- ${CLAIMS_RULE}`,
    `- ${ACQUISITION_TERM_RULE}`,
    `- ${TIME_OF_DAY_RULE}`,
    "- No promises of health or mental-health outcomes, no before/after claims.",
  ].join("\n");
}
