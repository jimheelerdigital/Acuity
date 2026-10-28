/**
 * "Your first read" (2026-10-27): a small report for people with a few
 * entries but not yet enough to unlock Pattern Insights
 * (PATTERN_INSIGHTS_MIN_ENTRIES: 5 since 2026-10-27, was 7). 77% of active
 * users sat under 7 entries and mostly saw locked cards.
 *
 * Pure: the route (GET /api/insights/first-read) loads the rows, this
 * decides what's honest to say. Rules:
 *  - Appears from FIRST_READ_MIN_ENTRIES completed entries. The caller
 *    hides it once progression.unlocked.patternInsights is true; the
 *    real report takes over.
 *  - Mood/energy averages need MIN_SCORED_ENTRIES scored entries, or
 *    the section is left out (no averages from one or two data points).
 *  - Themes reuse the emerging-patterns rules (2+ entries each, max 2).
 *  - Tasks: the count Ripple captured from recordings plus up to
 *    MAX_TASK_TITLES recent titles. Left out when there are none; no
 *    "try mentioning a task" nudge.
 */
import { moodLabelForScore } from "@acuity/shared";

export const FIRST_READ_MIN_ENTRIES = 3;
export const MIN_SCORED_ENTRIES = 3;
export const MAX_TASK_TITLES = 3;

export interface FirstReadInput {
  /** Completed entries for the user. */
  completedEntries: { moodScore: number | null; energy: number | null }[];
  /** Tasks created from recordings (Task.entryId set). */
  capturedTaskCount: number;
  /** Most recent captured task titles, newest first. */
  recentTaskTitles: string[];
  /** Output of selectEmergingThemes (already filtered + capped). */
  emergingThemeLabels: string[];
}

export interface FirstRead {
  entriesCount: number;
  mood: { label: string; average: number; basedOn: number } | null;
  energy: { average: number; basedOn: number } | null;
  themes: string[];
  tasks: { count: number; titles: string[] } | null;
}

function avg(xs: number[]): number {
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

const validScore = (n: number | null): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 10;

export function buildFirstRead(input: FirstReadInput): FirstRead | null {
  const entriesCount = input.completedEntries.length;
  if (entriesCount < FIRST_READ_MIN_ENTRIES) return null;

  const moods = input.completedEntries.map((e) => e.moodScore).filter(validScore);
  const energies = input.completedEntries.map((e) => e.energy).filter(validScore);

  const mood =
    moods.length >= MIN_SCORED_ENTRIES
      ? { label: moodLabelForScore(avg(moods)), average: avg(moods), basedOn: moods.length }
      : null;
  const energy =
    energies.length >= MIN_SCORED_ENTRIES
      ? { average: avg(energies), basedOn: energies.length }
      : null;

  const titles = input.recentTaskTitles
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TASK_TITLES);
  const tasks =
    input.capturedTaskCount > 0
      ? { count: input.capturedTaskCount, titles }
      : null;

  const themes = input.emergingThemeLabels.map((t) => t.trim()).filter(Boolean);

  // Nothing worth a card: no averages, no themes, no tasks.
  if (!mood && !energy && themes.length === 0 && !tasks) return null;

  return { entriesCount, mood, energy, themes, tasks };
}
