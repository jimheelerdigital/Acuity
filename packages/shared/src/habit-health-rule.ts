/**
 * Habit auto-complete from Apple Health (1.9.6).
 * Spec: claude/health-habit-autocheck-spec.md (Ripple project).
 *
 * A habit can carry ONE rule: "steps ≥ 10,000" or "exercise minutes ≥ 30".
 * When a day's HealthSnapshot meets it, the server checks the habit off for
 * that day (HabitCheck source "HEALTH"). Additive only: it never un-checks,
 * and a manual or debrief check for the day is left as it is.
 *
 * v1 metrics are the two cumulative daily totals HealthSnapshot already
 * stores (spec's lean, Jimmy didn't override).
 */

export type HealthRuleMetric = "steps" | "activeMinutes";

export type HabitHealthRule = {
  metric: HealthRuleMetric;
  comparator: ">=";
  threshold: number;
};

export const HEALTH_RULE_LIMITS: Record<HealthRuleMetric, { min: number; max: number }> = {
  steps: { min: 500, max: 100_000 },
  activeMinutes: { min: 5, max: 600 },
};

/** Preset choices the app offers. */
export const HEALTH_RULE_PRESETS: Record<HealthRuleMetric, number[]> = {
  steps: [5_000, 7_500, 10_000, 12_500],
  activeMinutes: [15, 30, 45, 60],
};

export function healthRuleLabel(rule: HabitHealthRule): string {
  return rule.metric === "steps"
    ? `${rule.threshold.toLocaleString("en-US")} steps`
    : `${rule.threshold} exercise minutes`;
}

/**
 * Validate an untrusted value (request body, DB JSON). Returns null for
 * "no rule" and throws nothing — callers decide what invalid means.
 */
export function parseHealthRule(raw: unknown): HabitHealthRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.metric !== "steps" && r.metric !== "activeMinutes") return null;
  if (r.comparator !== undefined && r.comparator !== ">=") return null;
  if (typeof r.threshold !== "number" || !Number.isFinite(r.threshold)) return null;
  const threshold = Math.round(r.threshold);
  const { min, max } = HEALTH_RULE_LIMITS[r.metric];
  if (threshold < min || threshold > max) return null;
  return { metric: r.metric, comparator: ">=", threshold };
}

export type HealthDayTotals = { steps?: number | null; activeMinutes?: number | null };

export function healthRuleMet(rule: HabitHealthRule, day: HealthDayTotals): boolean {
  const v = day[rule.metric];
  return typeof v === "number" && v >= rule.threshold;
}
