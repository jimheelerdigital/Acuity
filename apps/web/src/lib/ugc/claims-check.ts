/**
 * Claims check for every UGC outreach draft and creator brief, run before
 * anything reaches Keenan's digest.
 *
 * Two layers:
 *   1. Code checks (deterministic): banned phrases, wrong prices, Ripple
 *      pinned to a time of day, word limits, link count, required lines.
 *   2. Jev (lib/content-factory/jev.ts) for the judgement call: does it
 *      claim Ripple treats, diagnoses, cures or replaces therapy, or promise
 *      a health outcome. A dedicated question set — the ads judge's
 *      policyRisk question also flags "mentions age or life stage", which
 *      creator copy for a midlife persona legitimately does.
 *
 * Unlike every other Jev caller this FAILS CLOSED: if Jev can't answer,
 * the draft is "unchecked" and can't be approved until a re-check passes.
 */
import { askJev, noulOf } from "@/lib/content-factory/jev";
import { CLAIMS_RULE } from "@/lib/positioning";

export type ClaimsStatus = "passed" | "flagged" | "unchecked";

export interface ClaimsResult {
  status: ClaimsStatus;
  issues: string[];
}

const JEV_FLAG_AT = 0.5;

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function linkCount(s: string): number {
  return (s.match(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(io|com|co|app|net|org)\b/gi) ?? []).length;
}

/** Dollar amounts in the text that aren't in the allowed list. */
export function strayPrices(s: string, allowed: number[]): string[] {
  const ok = new Set(allowed.map((n) => n.toFixed(2)));
  return (s.match(/\$\s?\d+(?:[.,]\d{1,2})?/g) ?? []).filter((m) => {
    const n = Number(m.replace(/[$,\s]/g, ""));
    return !ok.has(n.toFixed(2));
  });
}

export interface CodeCheckOptions {
  maxWords?: number;
  maxLinks?: number;
  allowedDollars: number[];
  /** Lines that must appear verbatim. */
  mustInclude?: string[];
  /** "Ripple" must appear in the first N non-empty lines. */
  rippleWithinLines?: number;
}

/** Claim / wording / price checks (run on the text minus quoted rule lines). */
export function contentIssues(text: string, allowedDollars: number[]): string[] {
  const issues: string[] = [];
  if (/mirror[,\s—-]*not a coach/i.test(text)) issues.push('says "mirror, not a coach"');
  if (
    /\b(treats?|treating|diagnos\w*|cures?|curing|heals?)\b[^.]{0,40}\b(anxiety|depression|adhd|ptsd|trauma|insomnia|burnout|disorder|mental (health|illness))/i.test(text) ||
    /\b(replaces?|replacing|instead of|substitute for|better than|cheaper than)\s+(a\s+|your\s+)?(therap\w*|counsel\w*|psychologist)/i.test(text) ||
    /\bripple\s+(is|as)\s+(a\s+|your\s+)?(therap\w*|treatment|cure)\b/i.test(text)
  ) {
    issues.push("treats / diagnoses / cures / replaces-therapy claim");
  }
  if (/\b(nightly|every night|before bed|at bedtime|at \d{1,2}\s?pm)\b/i.test(text) && /ripple/i.test(text)) {
    issues.push("pins Ripple to a time of day");
  }
  if (/\b\d{2,3}[- ]second\b/i.test(text)) issues.push("recording-duration claim");
  const stray = strayPrices(text, allowedDollars);
  if (stray.length) issues.push(`unexpected price(s): ${stray.join(", ")}`);
  return issues;
}

/** Shape checks: word and link limits, required lines, Ripple up top. */
export function formatIssues(text: string, opts: CodeCheckOptions): string[] {
  const issues: string[] = [];
  if (opts.maxWords && wordCount(text) > opts.maxWords) {
    issues.push(`${wordCount(text)} words (max ${opts.maxWords})`);
  }
  if (opts.maxLinks != null && linkCount(text) > opts.maxLinks) {
    issues.push(`${linkCount(text)} links (max ${opts.maxLinks})`);
  }
  for (const line of opts.mustInclude ?? []) {
    if (!text.includes(line)) issues.push(`missing "${line.slice(0, 40)}"`);
  }
  if (opts.rippleWithinLines) {
    const head = text.split("\n").filter((l) => l.trim()).slice(0, opts.rippleWithinLines).join(" ");
    if (!/ripple/i.test(head)) issues.push(`doesn't say it's about Ripple in the first ${opts.rippleWithinLines - 1} lines`);
  }
  return issues;
}

/** Jev's half. Returns null when Jev didn't answer (→ "unchecked"). */
export async function jevClaimsIssues(kind: string, text: string): Promise<string[] | null> {
  const r = await askJev(
    `ugc-claims:${kind}`,
    { kind, text, rule: CLAIMS_RULE },
    {
      therapy: {
        type: "noul",
        instructions:
          "Does this text claim or imply that Ripple (the app) treats, diagnoses, cures, or replaces therapy or a therapist? A person stating their OWN credentials (\"I'm a therapist\") or their own experience is fine and is NOT a claim about Ripple.",
        criteria: { true: "It makes or implies that claim about Ripple", false: "It does not" },
      },
      outcome: {
        type: "noul",
        instructions:
          "Does this text promise a health or mental-health outcome from using Ripple (e.g. less anxiety, cured burnout, better mental health), or use before/after framing?",
        criteria: { true: "It promises such an outcome", false: "It does not" },
      },
    }
  );
  if (!r) return null;
  const issues: string[] = [];
  const therapy = noulOf(r, "therapy");
  const outcome = noulOf(r, "outcome");
  if (therapy == null || outcome == null) return null;
  if (therapy >= JEV_FLAG_AT) issues.push(`Jev: therapy/treatment claim (${therapy.toFixed(2)})`);
  if (outcome >= JEV_FLAG_AT) issues.push(`Jev: health-outcome promise (${outcome.toFixed(2)})`);
  return issues;
}

/**
 * Briefs quote the claims rule itself ("You may not say Ripple treats…").
 * Those rule lines are removed before the claim checks so the rule doesn't
 * flag itself; required-line checks still see the full text.
 */
export function withoutRuleLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/\b(never claim|may not (say|claim)|must not (say|claim)|do not (say|claim)|don't (say|claim))\b.{0,40}\b(treats?|diagnos|cures?|replaces?)/i.test(l))
    .join("\n");
}

export async function claimsCheck(kind: string, text: string, opts: CodeCheckOptions): Promise<ClaimsResult> {
  const claimText = withoutRuleLines(text);
  const issues = [...contentIssues(claimText, opts.allowedDollars), ...formatIssues(text, opts)];
  const jev = await jevClaimsIssues(kind, claimText);
  if (jev == null) {
    return { status: issues.length ? "flagged" : "unchecked", issues: [...issues, "Jev didn't answer — re-check before approving"] };
  }
  issues.push(...jev);
  return { status: issues.length ? "flagged" : "passed", issues };
}
