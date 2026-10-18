/**
 * Pre-filled first debrief (2026-10-18, audit 2026-10-10 R-2, per Keenan).
 *
 * The post-payment first debrief used to open on a blank box: 2 submitted,
 * 11 skipped in its first week. By then the funnel has asked what's on her
 * plate and which concrete things are on her list this week. This module
 * turns those answers into the step's opening line and three editable
 * lines, and turns the lines back into the sentence that becomes the entry
 * transcript. Pure, so the composition rule is unit tested.
 */

export interface FirstDebriefPrefill {
  /** Her own answer from the funnel. With saidKind "plate" (v9: the plate
   *  multi-select, already joined: "kids and a demanding job") it renders
   *  "You said <said> is on your plate."; with "quote" (v8: the entry
   *  answer she tapped) it renders "You said: “<said>”". */
  said?: string | null;
  saidKind?: "plate" | "quote";
  /** Up to three concrete items she picked (week-list tasks). */
  lines?: string[];
}

export const PREFILL_LINE_LABELS = ["Work", "Home", "Me"] as const;
export const PREFILL_LINE_COUNT = 3;
/** Server limits on /api/onboarding/first-debrief-text. */
export const FIRST_DEBRIEF_MIN_CHARS = 10;
export const FIRST_DEBRIEF_MAX_CHARS = 2000;

/** Natural-language list: "A", "A and B", "A, B, and C". */
export function joinNatural(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length === 0) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

/** Lower-case the first letter of a funnel label so it reads inside a sentence. */
export function sentenceCase(label: string): string {
  const s = label.trim();
  if (!s) return s;
  // Keep proper nouns / acronyms (two capitals in a row) as they are.
  if (/^[A-Z][A-Z]/.test(s)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** The opening line, or null when the funnel gave us nothing to quote. */
export function saidLine(prefill: FirstDebriefPrefill | null | undefined, brand: "ripple" | "bwk"): string | null {
  const s = (prefill?.said ?? "").trim();
  if (!s) return null;
  if (prefill?.saidKind === "quote") return `You said: “${s.replace(/[.]+$/, "")}.”`;
  const tail = brand === "bwk" ? "is what you're carrying" : "is on your plate";
  return `You said ${s} ${tail}.`;
}

/** Pad / trim to exactly three editable lines. */
export function initialLines(prefill?: FirstDebriefPrefill | null): string[] {
  const given = (prefill?.lines ?? []).map((s) => s.trim()).filter(Boolean).slice(0, PREFILL_LINE_COUNT);
  while (given.length < PREFILL_LINE_COUNT) given.push("");
  return given;
}

/** Did the funnel give us anything to show? Logged on the events. */
export function isPrefilled(prefill?: FirstDebriefPrefill | null): boolean {
  return !!(prefill?.said?.trim() || (prefill?.lines ?? []).some((l) => l.trim()));
}

/**
 * The transcript the entry is created with. Her lines become one sentence
 * the extractor reads like any spoken debrief; free text, if any, follows.
 * Always ≥ MIN_CHARS when at least one line is filled; capped at MAX_CHARS.
 */
export function composeDebriefText(lines: string[], extra = ""): string {
  const filled = lines.map((s) => s.trim()).filter(Boolean);
  const parts: string[] = [];
  if (filled.length > 0) {
    const lead =
      filled.length === 1
        ? "The thing I'd most like off my mind is"
        : filled.length === 2
          ? "The two things I'd most like off my mind are"
          : "The three things I'd most like off my mind are";
    parts.push(`${lead} ${joinNatural(filled.map((l) => sentenceCase(stripTrailingPeriod(l))))}.`);
  }
  const more = extra.trim();
  if (more) parts.push(more);
  return parts.join(" ").slice(0, FIRST_DEBRIEF_MAX_CHARS);
}

function stripTrailingPeriod(s: string): string {
  return s.replace(/[.!]+$/, "");
}

/** Can this be submitted? At least one line, and the composed text clears the server minimum. */
export function canSubmitLines(lines: string[], extra = ""): boolean {
  if (!lines.some((l) => l.trim())) return false;
  return composeDebriefText(lines, extra).length >= FIRST_DEBRIEF_MIN_CHARS;
}
