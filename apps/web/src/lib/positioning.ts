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
Price: ${displayMonthly()}/month or ${displayAnnual()}/year, 7-day free trial.
Limits (never claim beyond these): not therapy, does not diagnose or treat anything, no guaranteed outcomes. Never claim a specific recording duration.`;
}

/** How the brand talks. Replaces the retired "a mirror, not a coach" rule. */
export const VOICE_PRINCIPLE =
  "Helpful and on their side: show people what's really going on in their own words and help them take the next step. Encouraging and practical, specific over abstract. Never preachy, never lecture, never medical.";

/** Meta ad policy still applies to ads even with the life-change framing. */
export const AD_CLAIM_GUARDRAIL =
  "\"Change your life for the better\", \"build better habits\" and \"get your life on track\" are fine. Never promise health or mental-health outcomes, never before/after transformation claims, never imply the reader has a condition.";
