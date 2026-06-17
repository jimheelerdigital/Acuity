// MRI Diagnostic Dashboard — per-section data queries.
//
// One exported async function per section key. Net-new sections use
// prisma.$queryRaw with the validated SQL from mri-spec.md (tagged-template
// params, ::int / ::float8 casts, .catch(() => []) guards). Reuse sections
// import + delegate to the now-exported analytics functions in
// api/admin/metrics/route.ts. All queries are READ-ONLY. bigints are cast to
// numbers before leaving this layer.

import type { PrismaClient } from "@prisma/client";

import {
  getWebOnboardingFunnel,
  getGrowthMetrics,
  getFeatureAdoption,
  getEngagementDistribution,
  getBusinessMetrics,
} from "@/app/api/admin/metrics/route";

import type {
  ActivationResponse,
  AcquisitionResponse,
  EngagementResponse,
  FailureRow,
  FailuresResponse,
  FeatureFreeVsPaidRow,
  FeatureDepthRow,
  FeaturesResponse,
  RetentionWeek,
  RevenueResponse,
  StuckUser,
  SystemHealthResponse,
  TrialBucket,
  TrialResponse,
  UserTimelineResponse,
  WebFunnelResponse,
} from "./types";

const num = (v: unknown): number => Number(v ?? 0);

// ─── System Health (net-new) ────────────────────────────────────────────────

export async function getSystemHealth(
  prisma: PrismaClient
): Promise<SystemHealthResponse> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [entryRows, aiRows, pipelineRows, pastDueRows, lastSignupRows] =
    await Promise.all([
      prisma.$queryRaw<Array<{ total: number; complete: number }>>`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE status = 'COMPLETE'))::int AS complete
        FROM "Entry"
        WHERE "createdAt" >= ${dayAgo}
      `.catch(() => []),
      prisma.$queryRaw<Array<{ total: number; success: number }>>`
        SELECT COUNT(*)::int AS total,
               (COUNT(*) FILTER (WHERE success = true))::int AS success
        FROM "ClaudeCallLog"
        WHERE "createdAt" >= ${dayAgo}
      `.catch(() => []),
      prisma.$queryRaw<Array<{ failed: number }>>`
        SELECT COUNT(*)::int AS failed
        FROM "GenerationJob"
        WHERE status = 'FAILED' AND "startedAt" >= ${hourAgo}
      `.catch(() => []),
      prisma.$queryRaw<Array<{ past_due: number }>>`
        SELECT COUNT(*)::int AS past_due
        FROM "User"
        WHERE "subscriptionStatus" = 'PAST_DUE'
      `.catch(() => []),
      prisma.$queryRaw<Array<{ last_signup: Date | null }>>`
        SELECT MAX("createdAt") AS last_signup FROM "User"
      `.catch(() => []),
    ]);

  const entriesTotal = num(entryRows[0]?.total);
  const entriesComplete = num(entryRows[0]?.complete);
  const aiTotal = num(aiRows[0]?.total);
  const aiSuccess = num(aiRows[0]?.success);
  const lastSignup = lastSignupRows[0]?.last_signup ?? null;

  return {
    entrySuccessRate:
      entriesTotal > 0 ? Math.round((entriesComplete / entriesTotal) * 1000) / 10 : 100,
    entriesTotal24h: entriesTotal,
    entriesComplete24h: entriesComplete,
    aiCallSuccessRate:
      aiTotal > 0 ? Math.round((aiSuccess / aiTotal) * 1000) / 10 : 100,
    aiCallsTotal24h: aiTotal,
    aiCallsSuccess24h: aiSuccess,
    pipelineErrorsLastHour: num(pipelineRows[0]?.failed),
    activePastDue: num(pastDueRows[0]?.past_due),
    lastSuccessfulSignup: lastSignup ? new Date(lastSignup).toISOString() : null,
  };
}

// ─── Web Funnel (reuse) ─────────────────────────────────────────────────────

export async function getWebFunnel(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<WebFunnelResponse> {
  return getWebOnboardingFunnel(prisma, start, end);
}

// ─── Activation Funnel (net-new) ────────────────────────────────────────────

export async function getActivation(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<ActivationResponse> {
  const [stepRow, ttfeRows, histRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        signups: number;
        opened: number;
        e1: number;
        e3: number;
        e7: number;
        e15: number;
        days3: number;
        days7: number;
      }>
    >`
      WITH cohort AS (
        SELECT
          u.id,
          (u."lastSeenAt" IS NOT NULL) AS opened,
          COUNT(e.id)::int AS entry_count,
          COUNT(DISTINCT DATE(e."createdAt"))::int AS days_with_entries
        FROM "User" u
        LEFT JOIN "Entry" e ON e."userId" = u.id
        WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
        GROUP BY u.id
      )
      SELECT
        COUNT(*)::int AS signups,
        (COUNT(*) FILTER (WHERE opened))::int AS opened,
        (COUNT(*) FILTER (WHERE entry_count >= 1))::int AS e1,
        (COUNT(*) FILTER (WHERE entry_count >= 3))::int AS e3,
        (COUNT(*) FILTER (WHERE entry_count >= 7))::int AS e7,
        (COUNT(*) FILTER (WHERE entry_count >= 15))::int AS e15,
        (COUNT(*) FILTER (WHERE days_with_entries >= 3))::int AS days3,
        (COUNT(*) FILTER (WHERE days_with_entries >= 7))::int AS days7
      FROM cohort
    `.catch(() => []),
    prisma.$queryRaw<
      Array<{ median: number | null; p25: number | null; p75: number | null; p90: number | null }>
    >`
      WITH first_entry AS (
        SELECT u.id,
          EXTRACT(EPOCH FROM (MIN(e."createdAt") - u."createdAt")) / 3600.0 AS hours_to_first
        FROM "User" u
        JOIN "Entry" e ON e."userId" = u.id
        WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
        GROUP BY u.id, u."createdAt"
      )
      SELECT
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY hours_to_first)::float8 AS median,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY hours_to_first)::float8 AS p25,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY hours_to_first)::float8 AS p75,
        PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY hours_to_first)::float8 AS p90
      FROM first_entry
      WHERE hours_to_first >= 0
    `.catch(() => []),
    prisma.$queryRaw<Array<{ bucket: string; count: number }>>`
      WITH first_entry AS (
        SELECT u.id,
          EXTRACT(EPOCH FROM (MIN(e."createdAt") - u."createdAt")) / 3600.0 AS hours_to_first
        FROM "User" u
        JOIN "Entry" e ON e."userId" = u.id
        WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
        GROUP BY u.id, u."createdAt"
      )
      SELECT bucket, COUNT(*)::int AS count
      FROM (
        SELECT CASE
          WHEN hours_to_first < 1 THEN '< 1h'
          WHEN hours_to_first < 6 THEN '1-6h'
          WHEN hours_to_first < 24 THEN '6-24h'
          WHEN hours_to_first < 72 THEN '1-3d'
          WHEN hours_to_first < 168 THEN '3-7d'
          ELSE '7d+'
        END AS bucket,
        CASE
          WHEN hours_to_first < 1 THEN 1
          WHEN hours_to_first < 6 THEN 2
          WHEN hours_to_first < 24 THEN 3
          WHEN hours_to_first < 72 THEN 4
          WHEN hours_to_first < 168 THEN 5
          ELSE 6
        END AS sort_order
        FROM first_entry
        WHERE hours_to_first >= 0
      ) b
      GROUP BY bucket, sort_order
      ORDER BY sort_order
    `.catch(() => []),
  ]);

  const r = stepRow[0];
  const rawSteps: { label: string; count: number }[] = [
    { label: "Signed up", count: num(r?.signups) },
    { label: "Opened app", count: num(r?.opened) },
    { label: "1st entry", count: num(r?.e1) },
    { label: "3rd entry", count: num(r?.e3) },
    { label: "7th entry", count: num(r?.e7) },
    { label: "15th entry", count: num(r?.e15) },
    { label: "3+ days active", count: num(r?.days3) },
    { label: "7+ days active", count: num(r?.days7) },
  ];

  const steps = rawSteps.map((s, i) => {
    const prev = i > 0 ? rawSteps[i - 1].count : null;
    const pctOfPrev =
      prev && prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : i === 0 ? null : 0;
    return { label: s.label, count: s.count, pctOfPrev };
  });

  const t = ttfeRows[0];
  const round1 = (v: number | null | undefined) =>
    v === null || v === undefined ? null : Math.round(v * 10) / 10;

  return {
    steps,
    timeToFirstEntry: {
      median: round1(t?.median),
      p25: round1(t?.p25),
      p75: round1(t?.p75),
      p90: round1(t?.p90),
      histogram: histRows.map((h) => ({ bucket: h.bucket, count: num(h.count) })),
    },
  };
}

// ─── Trial → Paid Funnel (net-new) ──────────────────────────────────────────

export async function getTrial(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<TrialResponse> {
  const rows = await prisma.$queryRaw<
    Array<{
      trial_bucket: string;
      users: number;
      activated: number;
      converted_paid: number;
      dropped_to_free: number;
      payment_failed: number;
    }>
  >`
    WITH cohort AS (
      SELECT u.id, u."subscriptionStatus",
        DATE_PART('day', NOW() - u."createdAt")::int AS days_since_signup,
        EXISTS(SELECT 1 FROM "Entry" e WHERE e."userId" = u.id) AS activated
      FROM "User" u
      WHERE u."createdAt" >= ${start} AND u."createdAt" <= ${end}
    )
    SELECT
      CASE
        WHEN days_since_signup < 1 THEN 'Day 0'
        WHEN days_since_signup BETWEEN 1 AND 3 THEN 'Day 1-3'
        WHEN days_since_signup BETWEEN 4 AND 7 THEN 'Day 4-7'
        WHEN days_since_signup BETWEEN 8 AND 14 THEN 'Day 8-14'
        ELSE 'Day 15+'
      END AS trial_bucket,
      COUNT(*)::int AS users,
      (COUNT(*) FILTER (WHERE activated))::int AS activated,
      (COUNT(*) FILTER (WHERE "subscriptionStatus" = 'PRO'))::int AS converted_paid,
      (COUNT(*) FILTER (WHERE "subscriptionStatus" = 'FREE'))::int AS dropped_to_free,
      (COUNT(*) FILTER (WHERE "subscriptionStatus" = 'PAST_DUE'))::int AS payment_failed
    FROM cohort
    GROUP BY trial_bucket
    ORDER BY MIN(days_since_signup)
  `.catch(() => []);

  const buckets: TrialBucket[] = rows.map((r) => ({
    bucket: r.trial_bucket,
    users: num(r.users),
    activated: num(r.activated),
    convertedPaid: num(r.converted_paid),
    droppedToFree: num(r.dropped_to_free),
    paymentFailed: num(r.payment_failed),
  }));

  return { buckets };
}

// ─── Acquisition (reuse) ────────────────────────────────────────────────────

export async function getAcquisition(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<AcquisitionResponse> {
  return getGrowthMetrics(prisma, start, end);
}

// ─── Feature Usage (reuse adoption + net-new free-vs-paid + depth) ──────────

export async function getFeatures(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<FeaturesResponse> {
  const [adoption, freeVsPaidRows, depthRows] = await Promise.all([
    getFeatureAdoption(prisma, start, end),
    prisma.$queryRaw<
      Array<{
        is_paid: boolean;
        users: number;
        used_tasks: number;
        used_goals: number;
        used_insights: number;
        used_life_audit: number;
        used_weekly_report: number;
        used_reminder: number;
        used_calendar: number;
      }>
    >`
      WITH activated AS (
        SELECT u.id, (u."subscriptionStatus" = 'PRO') AS is_paid
        FROM "User" u
        WHERE EXISTS(SELECT 1 FROM "Entry" e WHERE e."userId" = u.id)
          AND u."createdAt" >= ${start} AND u."createdAt" <= ${end}
      )
      SELECT is_paid,
        COUNT(*)::int AS users,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "Task" t WHERE t."userId" = activated.id)))::int AS used_tasks,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "Goal" g WHERE g."userId" = activated.id)))::int AS used_goals,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "UserInsight" ui WHERE ui."userId" = activated.id)))::int AS used_insights,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "LifeAudit" la WHERE la."userId" = activated.id)))::int AS used_life_audit,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "WeeklyReport" wr WHERE wr."userId" = activated.id)))::int AS used_weekly_report,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "UserReminder" ur WHERE ur."userId" = activated.id)))::int AS used_reminder,
        (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "CalendarConnection" cc WHERE cc."userId" = activated.id)))::int AS used_calendar
      FROM activated
      GROUP BY is_paid
    `.catch(() => []),
    prisma.$queryRaw<
      Array<{
        feature: string;
        median_count: number;
        avg_per_active: number;
      }>
    >`
      WITH activated AS (
        SELECT u.id
        FROM "User" u
        WHERE EXISTS(SELECT 1 FROM "Entry" e WHERE e."userId" = u.id)
          AND u."createdAt" >= ${start} AND u."createdAt" <= ${end}
      ),
      total AS (SELECT COUNT(*)::float8 AS n FROM activated),
      counts AS (
        SELECT 'tasks' AS feature, a.id, (SELECT COUNT(*)::int FROM "Task" t WHERE t."userId" = a.id) AS c FROM activated a
        UNION ALL
        SELECT 'goals', a.id, (SELECT COUNT(*)::int FROM "Goal" g WHERE g."userId" = a.id) FROM activated a
        UNION ALL
        SELECT 'insights', a.id, (SELECT COUNT(*)::int FROM "UserInsight" ui WHERE ui."userId" = a.id) FROM activated a
        UNION ALL
        SELECT 'lifeAudit', a.id, (SELECT COUNT(*)::int FROM "LifeAudit" la WHERE la."userId" = a.id) FROM activated a
        UNION ALL
        SELECT 'weeklyReport', a.id, (SELECT COUNT(*)::int FROM "WeeklyReport" wr WHERE wr."userId" = a.id) FROM activated a
        UNION ALL
        SELECT 'reminders', a.id, (SELECT COUNT(*)::int FROM "UserReminder" ur WHERE ur."userId" = a.id) FROM activated a
        UNION ALL
        SELECT 'calendar', a.id, (SELECT COUNT(*)::int FROM "CalendarConnection" cc WHERE cc."userId" = a.id) FROM activated a
      )
      SELECT
        counts.feature,
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY counts.c) FILTER (WHERE counts.c > 0), 0)::float8 AS median_count,
        COALESCE(SUM(counts.c)::float8 / NULLIF((SELECT n FROM total), 0), 0)::float8 AS avg_per_active
      FROM counts
      GROUP BY counts.feature
    `.catch(() => []),
  ]);

  const freeVsPaid: FeatureFreeVsPaidRow[] = freeVsPaidRows.map((r) => ({
    isPaid: Boolean(r.is_paid),
    users: num(r.users),
    usedTasks: num(r.used_tasks),
    usedGoals: num(r.used_goals),
    usedInsights: num(r.used_insights),
    usedLifeAudit: num(r.used_life_audit),
    usedWeeklyReport: num(r.used_weekly_report),
    usedReminder: num(r.used_reminder),
    usedCalendar: num(r.used_calendar),
  }));

  const labels: Record<string, string> = {
    tasks: "Tasks",
    goals: "Goals",
    insights: "Insights",
    lifeAudit: "Life Audit",
    weeklyReport: "Weekly Report",
    reminders: "Reminders",
    calendar: "Calendar",
  };
  const depth: FeatureDepthRow[] = depthRows.map((r) => ({
    key: r.feature,
    label: labels[r.feature] ?? r.feature,
    median: Math.round(num(r.median_count) * 10) / 10,
    avgPerActiveUser: Math.round(num(r.avg_per_active) * 10) / 10,
  }));

  return { adoption, freeVsPaid, depth };
}

// ─── Engagement (reuse distribution + net-new retention curve) ──────────────

export async function getEngagement(
  prisma: PrismaClient,
  start: Date,
  end: Date
): Promise<EngagementResponse> {
  const [distribution, retentionRows] = await Promise.all([
    getEngagementDistribution(prisma, start, end),
    prisma.$queryRaw<
      Array<{
        week_num: number;
        cohort_size: number;
        active_in_week: number;
        pct_retained: number;
      }>
    >`
      WITH cohort AS (
        SELECT u.id, u."createdAt" AS signup_at
        FROM "User" u
        WHERE u."createdAt" >= NOW() - INTERVAL '90 days'
      )
      SELECT week_num,
        COUNT(DISTINCT c.id)::int AS cohort_size,
        COUNT(DISTINCT e."userId")::int AS active_in_week,
        ROUND(100.0 * COUNT(DISTINCT e."userId") / NULLIF(COUNT(DISTINCT c.id), 0), 1)::float8 AS pct_retained
      FROM cohort c
      CROSS JOIN generate_series(0, 12) AS week_num
      LEFT JOIN "Entry" e ON e."userId" = c.id
        AND e."createdAt" >= c.signup_at + (week_num * INTERVAL '7 days')
        AND e."createdAt" < c.signup_at + ((week_num + 1) * INTERVAL '7 days')
      GROUP BY week_num
      ORDER BY week_num
    `.catch(() => []),
  ]);

  const retentionCurve: RetentionWeek[] = retentionRows.map((r) => ({
    weekNum: num(r.week_num),
    cohortSize: num(r.cohort_size),
    activeInWeek: num(r.active_in_week),
    pctRetained: num(r.pct_retained),
  }));

  return { distribution, retentionCurve };
}

// ─── Failure Surfaces (net-new) ─────────────────────────────────────────────

export async function getFailures(
  prisma: PrismaClient,
  start: Date,
  _end: Date
): Promise<FailuresResponse> {
  const [surfaceRows, stuckRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        source: string;
        message: string | null;
        occurrences: number;
        users_affected: number;
        last_seen: Date | null;
      }>
    >`
      (SELECT 'Entry failure' AS source, "errorMessage" AS message,
         COUNT(*)::int AS occurrences, COUNT(DISTINCT "userId")::int AS users_affected,
         MAX("createdAt") AS last_seen
       FROM "Entry" WHERE status = 'FAILED' AND "createdAt" >= ${start}
       GROUP BY "errorMessage")
      UNION ALL
      (SELECT 'AI call failure', "errorMessage",
         COUNT(*)::int, COUNT(DISTINCT "userId")::int, MAX("createdAt")
       FROM "ClaudeCallLog" WHERE success = false AND "createdAt" >= ${start}
       GROUP BY "errorMessage")
      UNION ALL
      (SELECT 'Signup failure', COALESCE("value", '(no detail)'),
         COUNT(*)::int, COUNT(DISTINCT "userId")::int, MAX("createdAt")
       FROM "OnboardingEvent" WHERE event = 'funnel_signup_failed' AND "createdAt" >= ${start}
       GROUP BY "value")
      ORDER BY occurrences DESC
      LIMIT 50
    `.catch(() => []),
    // Stuck users: signed up >7d ago, ≥1 Entry failure, never converted to
    // PRO, and no successful entry recorded since.
    prisma.$queryRaw<
      Array<{
        id: string;
        email: string;
        name: string | null;
        created_at: Date;
        error_count: number;
      }>
    >`
      SELECT u.id, u.email, u.name, u."createdAt" AS created_at,
        (SELECT COUNT(*)::int FROM "Entry" e WHERE e."userId" = u.id AND e.status = 'FAILED') AS error_count
      FROM "User" u
      WHERE u."createdAt" < NOW() - INTERVAL '7 days'
        AND u."subscriptionStatus" <> 'PRO'
        AND EXISTS (SELECT 1 FROM "Entry" e WHERE e."userId" = u.id AND e.status = 'FAILED')
        AND NOT EXISTS (SELECT 1 FROM "Entry" e WHERE e."userId" = u.id AND e.status = 'COMPLETE')
      ORDER BY error_count DESC
      LIMIT 50
    `.catch(() => []),
  ]);

  const surfaces: FailureRow[] = surfaceRows.map((r) => ({
    source: r.source as FailureRow["source"],
    message: r.message ?? "(no message)",
    occurrences: num(r.occurrences),
    usersAffected: num(r.users_affected),
    lastSeen: r.last_seen ? new Date(r.last_seen).toISOString() : null,
  }));

  const stuckUsers: StuckUser[] = stuckRows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    createdAt: new Date(r.created_at).toISOString(),
    errorCount: num(r.error_count),
  }));

  return { surfaces, stuckUsers };
}

// ─── Revenue / Subscriptions (reuse) ────────────────────────────────────────

export async function getRevenue(
  prisma: PrismaClient,
  monthStart: Date
): Promise<RevenueResponse> {
  return getBusinessMetrics(prisma, monthStart);
}

// ─── User Timeline (net-new) ────────────────────────────────────────────────

export async function getUserTimeline(
  prisma: PrismaClient,
  userId: string
): Promise<UserTimelineResponse | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptionStatus: true,
      subscriptionSource: true,
      devicePlatform: true,
      signupUtmSource: true,
      createdAt: true,
      lastSeenAt: true,
    },
  });
  if (!user) return null;

  const [onboarding, entries, trialEmails, aiCalls, redFlags] = await Promise.all([
    prisma.onboardingEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.entry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        errorMessage: true,
        mood: true,
        duration: true,
        createdAt: true,
      },
    }),
    prisma.trialEmailLog.findMany({
      where: { userId },
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
    prisma.claudeCallLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.redFlag.findMany({
      where: { affectedUserIds: { has: userId } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const timeline: UserTimelineResponse["timeline"] = [];

  for (const e of onboarding) {
    timeline.push({
      type: "onboarding",
      at: e.createdAt.toISOString(),
      label: e.event,
      status: e.event.includes("failed") ? "error" : "info",
      raw: { ...e, createdAt: e.createdAt.toISOString() },
    });
  }
  for (const e of entries) {
    timeline.push({
      type: "entry",
      at: e.createdAt.toISOString(),
      label: `Entry · ${e.status}`,
      status:
        e.status === "COMPLETE" ? "ok" : e.status === "FAILED" ? "error" : "warn",
      raw: { ...e, createdAt: e.createdAt.toISOString() },
    });
  }
  for (const t of trialEmails) {
    timeline.push({
      type: "trial_email",
      at: t.sentAt.toISOString(),
      label: `Trial email · ${t.emailKey}`,
      status: t.opened ? "ok" : "info",
      raw: {
        ...t,
        sentAt: t.sentAt.toISOString(),
        openedAt: t.openedAt?.toISOString() ?? null,
        clickedAt: t.clickedAt?.toISOString() ?? null,
      },
    });
  }
  for (const c of aiCalls) {
    timeline.push({
      type: "ai_call",
      at: c.createdAt.toISOString(),
      label: `AI · ${c.purpose}`,
      status: c.success ? "ok" : "error",
      raw: { ...c, createdAt: c.createdAt.toISOString() },
    });
  }
  for (const f of redFlags) {
    timeline.push({
      type: "red_flag",
      at: f.createdAt.toISOString(),
      label: `Red flag · ${f.title}`,
      status: f.severity === "CRITICAL" ? "error" : f.severity === "WARNING" ? "warn" : "info",
      raw: {
        ...f,
        createdAt: f.createdAt.toISOString(),
        resolvedAt: f.resolvedAt?.toISOString() ?? null,
      },
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionSource: user.subscriptionSource,
      devicePlatform: user.devicePlatform,
      signupUtmSource: user.signupUtmSource ?? null,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    },
    timeline,
  };
}
