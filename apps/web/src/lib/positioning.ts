/**
 * Ripple positioning, single source of truth (2026-09-29, per Keenan: "we're
 * an AI life optimizer, habit tracker, voice journal, and insight tool to help
 * people change their lives for the better. update across all product
 * information so we spit out the best possible ads and have the best
 * alignment possible").
 *
 * Every AI generator that describes the product (ads, landing pages, social,
 * blog, captions, research memos) imports from here, so the framing can't
 * drift file by file again. The human-readable version lives in
 * docs/acuity-positioning.md; keep the two in sync.
 */
import { displayAnnual, displayMonthly } from "@/lib/pricing";

// ─── Brand + copy rules (2026-10-06, per Keenan) ────────────────────────────
// Replaces the blanket "never brain dump / no medical or clinical claims
// anywhere" rules. docs/acuity-positioning.md has the human-readable version.

/**
 * The claims line. Every ad, creator brief and outreach prompt includes it,
 * and Jev rejects copy that crosses it (lib/adlab/jev-judge.ts policyRisk).
 */
export const CLAIMS_RULE =
  "Never claim Ripple treats, diagnoses, cures, or replaces therapy. A creator may state their own credentials (\"I'm a therapist\") and their personal experience.";

/**
 * Terminology. "Debrief" is the feature's name inside the app; customer
 * words are fine everywhere we are reaching people who don't have it yet.
 */
export const IN_APP_TERM_RULE =
  "In the app, product UI and emails to existing users, the voice entry is a \"debrief\". Never \"brain dump\", \"journal entry\" or \"check-in\" there.";
export const ACQUISITION_TERM_RULE =
  "Customer words are allowed: \"brain dump\" and \"voice journal\" are fine in ads, hooks, SEO pages, outreach emails and creator briefs, because that is how people search and talk. When naming the feature itself, it is a \"debrief\".";

/**
 * Time of day. Ripple's own copy and visuals never pin the product to a
 * time; a creator can describe their own routine however it really goes.
 */
export const TIME_OF_DAY_RULE =
  "Ripple's own copy and visuals never pin the product to a time of day (\"nightly\", \"before bed\", \"at 9pm\"): people use it whenever. A creator describing their own routine can say when they really do it.";

/**
 * Pain branches: a STARTING SET, not a requirement (2026-10-06). Copy may
 * use one of these or name a different pain; every generated ad records
 * the branch it used (`| branch:` in AdLabAngle.researchNotes, parsed by
 * branchFromNotes in lib/adlab/learning.ts) so branches can be ranked by
 * results.
 */
export const PAIN_BRANCH_STARTERS = [
  { key: "load", name: "The Load", pain: "carrying everyone's list in your head; tired from tracking, not from doing" },
  { key: "treadmill", name: "The Treadmill", pain: "busy all day, and none of it feels like moving forward" },
  { key: "loop", name: "The Loop", pain: "the same fights, the same stress, the same week on repeat" },
  { key: "gap", name: "The Gap", pain: "knowing what you should do and not doing it" },
  { key: "planner", name: "The Planner", pain: "planning, rewriting lists and starting new systems instead of making progress" },
] as const;

/** Prompt block listing the starter branches and how to tag. */
export function painBranchMenu(): string {
  return `PAIN BRANCHES (a starting set, not a requirement): ${PAIN_BRANCH_STARTERS.map((b) => `${b.key} = ${b.name}: ${b.pain}`).join("; ")}. Use one of these or name a different pain if it fits the ad better. Set "painBranch" to the key you used, or a 1-3 word lowercase label for a new pain.`;
}

/** Normalize a model's branch label: a starter key, or a short slug. */
export function normalizePainBranch(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const slug = raw.toLowerCase().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  if (!slug) return undefined;
  const starter = PAIN_BRANCH_STARTERS.find((b) => b.key === slug);
  return starter ? starter.key : slug;
}

/** The category line. Use as-is. */
export const PRODUCT_CATEGORY =
  "an AI life optimizer: a habit tracker, voice journal and insight tool that helps people change their lives for the better";

/** One sentence for prompts that need the short version. */
export const PRODUCT_ONE_LINER = `Ripple is ${PRODUCT_CATEGORY}. You talk to it any time of day, and it turns what you said into your to-do list, tracks your habits and mood, shows you what keeps coming up, and sends a weekly report of your week.`;

/** What it concretely does. Ads must show at least one of these, in plain words. */
export const PRODUCT_WHAT_IT_DOES = [
  "turns what you say into your to-do list (with the dates you mentioned)",
  "tracks your habits, checks off the ones you mention and notices the ones you skip",
  "tracks your mood over time",
  "shows you what keeps coming up week after week (your patterns)",
  "scores 6 areas of your life over time (Life Matrix)",
  "sends a weekly report: what happened, what moved, what slipped",
];

/** Full product truth for generators. */
export function productTruth(): string {
  return `Ripple is ${PRODUCT_CATEGORY}.
How it works: you talk to it (a voice journal entry, any time of day, no typing, no blank page). Ripple then:
${PRODUCT_WHAT_IT_DOES.map((x) => `- ${x}`).join("\n")}
The point: help people see what's really going on in their own life and act on it, so they change it for the better.
Price: ${displayAnnual()}/year (lead with this) or ${displayMonthly()}/month, 7-day free trial.
Limits (never claim beyond these): ${CLAIMS_RULE} No guaranteed outcomes. Never claim a specific recording duration.`;
}

/** How the brand talks. Replaces the retired "a mirror, not a coach" rule. */
export const VOICE_PRINCIPLE =
  "Helpful and on their side: show people what's really going on in their own words and help them take the next step. Encouraging and practical, specific over abstract. Never preachy, never lecture, and never claim Ripple treats, diagnoses, cures or replaces therapy.";

/** Meta ad policy still applies to ads even with the life-change framing. */
export const AD_CLAIM_GUARDRAIL =
  "\"Change your life for the better\", \"build better habits\" and \"get your life on track\" are fine. Never promise health or mental-health outcomes, never before/after transformation claims, never imply the reader has a condition. " +
  CLAIMS_RULE;
