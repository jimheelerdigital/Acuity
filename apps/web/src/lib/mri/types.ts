// MRI Diagnostic Dashboard — section response types + Snapshot type + zod
// Insight schema. Read-only data contract shared by the API routes, the
// snapshot builder, the Claude insights call, and the React sections.
//
// Reuse sections (web-funnel, activation, acquisition, engagement
// distribution, revenue) re-derive their shapes from the now-exported
// analytics functions in api/admin/metrics/route.ts via Awaited<ReturnType>,
// so a change to those functions can never silently drift from the MRI
// contract. Net-new sections define explicit types here.

import { z } from "zod";

import type {
  getWebOnboardingFunnel,
  getGrowthMetrics,
  getFeatureAdoption,
  getEngagementDistribution,
  getBusinessMetrics,
} from "@/app/api/admin/metrics/route";

// ─── Reuse-section response types (delegated to metrics functions) ──────────

export type WebFunnelResponse = Awaited<ReturnType<typeof getWebOnboardingFunnel>>;
export type AcquisitionResponse = Awaited<ReturnType<typeof getGrowthMetrics>>;
export type RevenueResponse = Awaited<ReturnType<typeof getBusinessMetrics>>;
export type EngagementDistributionResponse = Awaited<
  ReturnType<typeof getEngagementDistribution>
>;
export type FeatureAdoptionResponse = Awaited<ReturnType<typeof getFeatureAdoption>>;

// ─── System Health ──────────────────────────────────────────────────────────

export type SystemHealthResponse = {
  /** % of Entry rows in the last 24h with status COMPLETE (0 if none). */
  entrySuccessRate: number;
  entriesTotal24h: number;
  entriesComplete24h: number;
  /** % of ClaudeCallLog rows in the last 24h with success=true. */
  aiCallSuccessRate: number;
  aiCallsTotal24h: number;
  aiCallsSuccess24h: number;
  /** GenerationJob rows with status FAILED in the last hour. */
  pipelineErrorsLastHour: number;
  /** Current count of users in PAST_DUE (point-in-time, not range-scoped). */
  activePastDue: number;
  /** ISO timestamp of the most recent User.createdAt, or null. */
  lastSuccessfulSignup: string | null;
};

// ─── Activation Funnel ──────────────────────────────────────────────────────

export type ActivationStep = {
  label: string;
  count: number;
  /** % of the previous step (null for the first step). */
  pctOfPrev: number | null;
};

export type ActivationResponse = {
  steps: ActivationStep[];
  /** Time-to-first-entry distribution, in hours. */
  timeToFirstEntry: {
    median: number | null;
    p25: number | null;
    p75: number | null;
    p90: number | null;
    /** Histogram buckets over hours-to-first-entry. */
    histogram: { bucket: string; count: number }[];
  };
};

// ─── Trial → Paid Funnel ────────────────────────────────────────────────────

export type TrialBucket = {
  bucket: string;
  users: number;
  activated: number;
  convertedPaid: number;
  droppedToFree: number;
  paymentFailed: number;
};

export type TrialResponse = {
  buckets: TrialBucket[];
};

// ─── Feature Usage (free-vs-paid + depth) ───────────────────────────────────

export type FeatureFreeVsPaidRow = {
  isPaid: boolean;
  users: number;
  usedTasks: number;
  usedGoals: number;
  usedInsights: number;
  usedLifeAudit: number;
  usedWeeklyReport: number;
  usedReminder: number;
  usedCalendar: number;
};

export type FeatureDepthRow = {
  key: string;
  label: string;
  /** Median per-user count among users who have ≥1 of this feature. */
  median: number;
  /** Average count per activated user (across all activated users). */
  avgPerActiveUser: number;
};

export type FeaturesResponse = {
  /** Reuse: overall adoption from getFeatureAdoption. */
  adoption: FeatureAdoptionResponse;
  /** Net-new: free-vs-paid adoption split. */
  freeVsPaid: FeatureFreeVsPaidRow[];
  /** Net-new: usage depth per feature. */
  depth: FeatureDepthRow[];
};

// ─── Engagement (distribution + retention curve) ────────────────────────────

export type RetentionWeek = {
  weekNum: number;
  cohortSize: number;
  activeInWeek: number;
  pctRetained: number;
};

export type EngagementResponse = {
  /** Reuse: getEngagementDistribution shape. */
  distribution: EngagementDistributionResponse;
  /** Net-new: 12-week retention curve over the trailing-90-day cohort. */
  retentionCurve: RetentionWeek[];
};

// ─── Failure Surfaces ───────────────────────────────────────────────────────

export type FailureRow = {
  source: "Entry failure" | "AI call failure" | "Signup failure";
  message: string;
  occurrences: number;
  usersAffected: number;
  lastSeen: string | null;
};

export type StuckUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  errorCount: number;
};

export type FailuresResponse = {
  surfaces: FailureRow[];
  stuckUsers: StuckUser[];
};

// ─── User Lookup / Timeline ─────────────────────────────────────────────────

export type TimelineEventType =
  | "onboarding"
  | "entry"
  | "trial_email"
  | "ai_call"
  | "red_flag";

export type TimelineEvent = {
  type: TimelineEventType;
  at: string;
  label: string;
  /** Coarse status for color coding: ok | warn | error | info. */
  status: "ok" | "warn" | "error" | "info";
  /** Raw row payload, surfaced on click. */
  raw: Record<string, unknown>;
};

export type UserTimelineResponse = {
  user: {
    id: string;
    email: string;
    name: string | null;
    subscriptionStatus: string;
    subscriptionSource: string | null;
    devicePlatform: string | null;
    signupUtmSource: string | null;
    createdAt: string;
    lastSeenAt: string | null;
  };
  timeline: TimelineEvent[];
};

// ─── Snapshot (the <5KB aggregates-only blob fed to Claude) ─────────────────

export type SnapshotWebFunnelStep = {
  step: number;
  label: string;
  sessions: number;
  pctOfPrev: number | null;
  pctOfTop: number | null;
};

export type SnapshotAcquisitionRow = {
  source: string;
  platform: string;
  signups: number;
  activated: number;
  activationPct: number;
};

export type SnapshotFeatureFreeVsPaid = {
  isPaid: boolean;
  users: number;
  usedTasks: number;
  usedGoals: number;
  usedInsights: number;
  usedLifeAudit: number;
  usedWeeklyReport: number;
  usedReminder: number;
  usedCalendar: number;
};

export type Snapshot = {
  rangeUsed: string;
  generatedAt: string;
  systemHealth: SystemHealthResponse;
  webFunnel: SnapshotWebFunnelStep[];
  activation: {
    steps: { label: string; count: number; pctOfPrev: number | null }[];
    timeToFirstEntry: {
      median: number | null;
      p25: number | null;
      p75: number | null;
      p90: number | null;
    };
  };
  trialFunnel: TrialBucket[];
  acquisition: SnapshotAcquisitionRow[];
  featureUsage: {
    freeVsPaid: SnapshotFeatureFreeVsPaid[];
  };
  engagement: {
    distribution: {
      totalActivated: number;
      oneAndDone: number;
      dabbled: number;
      engaged: number;
      habit: number;
      recorded3PlusDays: number;
      recorded7PlusDays: number;
      avgEntriesPerUser: number;
    };
    retentionCurve: { weekNum: number; pctRetained: number }[];
  };
  failures: { message: string; source: string; occurrences: number; usersAffected: number }[];
  revenue: {
    stalePro: number;
    pastDue: number;
    mrrCents: number;
    payingUsers: number;
  };
};

// ─── Claude insights output (zod-validated) ─────────────────────────────────

export const InsightSeverityEnum = z.enum(["critical", "warning", "info"]);
export const InsightCategoryEnum = z.enum([
  "funnel",
  "errors",
  "conversion",
  "engagement",
  "revenue",
  "acquisition",
]);

export const InsightSchema = z.object({
  severity: InsightSeverityEnum,
  category: InsightCategoryEnum,
  title: z.string().max(120),
  evidence: z.string(),
  affectedUserCount: z.number().nullable(),
  recommendedAction: z.string(),
});

export const InsightsOutputSchema = z.object({
  summary: z.string(),
  insights: z.array(InsightSchema).min(1).max(8),
});

export type InsightSeverity = z.infer<typeof InsightSeverityEnum>;
export type InsightCategory = z.infer<typeof InsightCategoryEnum>;
export type Insight = z.infer<typeof InsightSchema>;
export type InsightsOutput = z.infer<typeof InsightsOutputSchema>;

// ─── Section key union (matches the API contract) ───────────────────────────

export type MRISectionKey =
  | "system-health"
  | "web-funnel"
  | "activation"
  | "trial"
  | "acquisition"
  | "features"
  | "engagement"
  | "failures"
  | "revenue";
