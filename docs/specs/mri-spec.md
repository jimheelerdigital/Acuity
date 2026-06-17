# Acuity MRI Diagnostic Dashboard — Build Spec (agent source of truth)

A single scrolling admin view at `/admin?tab=mri` surfacing the whole health of
the tool: every funnel, error, feature, cohort — with a Claude-powered AI
Insights panel at the top that reads the current state and tells Jimmy what to
fix. **Diagnostic, not descriptive: every panel must answer "if Jimmy reads
this, does he know what to do next?"** A bare number is not done.

Path is `apps/web/src/app/...` (the repo is `src`-rooted). Dark admin theme:
bg `#0A0A0F`, cards `#13131F`, accent `#7C5CFC`, text `white/50–80`. CSS bars /
tables over recharts (admin convention; `SafeChart` wraps recharts only if used).

---

## Reuse map (do NOT reinvent)

- **Auth:** every API route opens with `const guard = await requireAdmin(); if (!guard.ok) return guard.response;` from `@/lib/admin-guard`. Pages need none — `admin/layout.tsx` gates all `/admin/*`.
- **Admin UI components** (`apps/web/src/app/admin/components/`): `MetricCard`, `ChartCard` (`{title, children, className}`), `TimeRangeSelector` (has today/7d/30d/60d/90d/all/mtd/custom + `getDateRange`), `SafeChart`, `SkeletonCard` (`SkeletonMetric/Chart/Table`), `TabError`, `EmptyState`, `DrilldownModal`.
- **Tab data hook:** `useTabData<T>(tabKey, start, end)` → `{data, loading, error, meta, refresh}`, fetches `/api/admin/metrics?tab=…`. The MRI sections instead fetch `/api/admin/mri?section=X&start=…&end=…` — write a tiny analogous hook or fetch inline.
- **Existing analytics query functions in `apps/web/src/app/api/admin/metrics/route.ts`** — currently NOT exported. The foundation step must add `export` to each and import them into the MRI layer (additive, do not change their bodies): `getWebOnboardingFunnel`, `getOverview`, `getGrowthMetrics` (carries `platformAcquisition`), `getFeatureAdoption`, `getEngagementDistribution`, `getBusinessMetrics` (carries `staleStripeRecords` + `pastDueRecovery`), `getRedFlags`.
- **Claude:** model = `CLAUDE_MODEL` (`claude-sonnet-4-6`) from `@acuity/shared`. Model the insights call on `apps/web/src/lib/content-factory/claude-client.ts` `callClaude()` and `apps/web/src/lib/adlab/claude.ts` `callAdLabClaude()` — they wrap `@anthropic-ai/sdk` AND write `ClaudeCallLog` (purpose, model, tokensIn, tokensOut, costCents, durationMs, success, errorMessage). Reuse `extractJson()` from `adlab/claude.ts` to strip ```json fences. Use `purpose: 'admin_insights'` on the ClaudeCallLog row.
- **Inngest** (`apps/web/src/inngest/client.ts`, functions registered in `apps/web/src/app/api/inngest/route.ts` `functions: [...]`): the 4h cron is `inngest.createFunction({...},{ cron: "0 */4 * * *" },async()=>{...})`, registered there. No cron secret needed.
- **Audit:** `logAdminAction(...)` from `@/lib/admin-audit` — call on every user lookup (who looked up whom).
- **DB:** Prisma `$queryRaw` (tagged-template params). `AdminInsight` table + Prisma model already exist (typed `prisma.adminInsight`). Tables available: `OnboardingEvent`, `Entry` (status COMPLETE/FAILED, errorMessage), `User`, `ClaudeCallLog` (success, errorMessage), `GenerationJob` (status), `TrialEmailLog`, `RedFlag` (affectedUserIds), `Task/Goal/UserInsight/LifeAudit/WeeklyReport/StateOfMeReport/UserReminder/CalendarConnection/LifeMapArea`.

All queries READ-ONLY. Only writes: `AdminInsight`, `ClaudeCallLog`, `AdminAuditLog`. No migrations beyond the applied `AdminInsight`. No caching (175 users; queries are fast).

---

## File layout

```
apps/web/src/lib/mri/
  types.ts        # Section response types + Snapshot type + zod Insight schema
  queries.ts      # net-new SQL + re-export/delegate to existing analytics fns
  snapshot.ts     # build the <5KB JSON blob fed to Claude (calls queries)
  insights.ts     # Claude call (callClaude-style) → parse → zod → write AdminInsight + ClaudeCallLog
apps/web/src/app/api/admin/mri/
  route.ts             # GET ?section=X → that section's data (requireAdmin)
  insights/route.ts    # GET latest AdminInsight; ?regenerate=true (rate-limited 5min/admin)
  user/[id]/route.ts   # GET per-user timeline (requireAdmin + logAdminAction)
apps/web/src/inngest/functions/
  generate-insights-cron.ts   # 4h Inngest cron → snapshot → insights
apps/web/src/app/admin/tabs/MRITab.tsx          # the scrolling page, lazy-loads sections
apps/web/src/app/admin/tabs/mri/
  AIInsightsPanel.tsx SystemHealthSection.tsx WebFunnelSection.tsx
  ActivationFunnelSection.tsx TrialFunnelSection.tsx AcquisitionSection.tsx
  FeatureUsageSection.tsx EngagementSection.tsx FailureSurfacesSection.tsx
  RevenueSection.tsx UserLookupSection.tsx
```

Then wire `mri` into `admin-dashboard.tsx` TABS + dynamic import + render (done by the integrator, not agents).

## API contract

`GET /api/admin/mri?section=<key>&start=<iso>&end=<iso>` returns that section's
JSON (bare object). Section keys: `system-health`, `web-funnel`, `activation`,
`trial`, `acquisition`, `features`, `engagement`, `failures`, `revenue`.
(`user-lookup` uses `/api/admin/mri/user/[id]`; insights use `/api/admin/mri/insights`.)
Each section component fetches its own slice lazily (Intersection Observer) so the
page doesn't block on all queries. AI Insights + System Health load first.

---

## Sections (data + UI + the "what do I do next" test)

1. **System Health** (poll 60s): entrySuccessRate (24h: COMPLETE/total), aiCallSuccessRate (24h ClaudeCallLog.success), pipelineErrors (last hour GenerationJob.status='failed'), activePastDue count, lastSuccessfulSignup timestamp. UI: 4-5 stat cards, red if a rate <90% / errors>0.
2. **Web Funnel**: the 18-step validated funnel (SQL below), drop% between steps, bars colored red >25% drop / amber 10-25% / green <10%. Plus in-app-browser vs regular-browser side-by-side (sessions with `funnel_inapp_browser_detected`).
3. **Activation Funnel**: signup → opened (lastSeenAt) → 1st → 3rd → 7th → 15th entry → 3+ days → 7+ days. Plus time-to-first-entry histogram + median/p25/p75/p90. Reuse `getOverview`/`getEngagementDistribution` shapes where possible.
4. **Trial → Paid Funnel**: bucket by days-since-signup (Day 0 / 1-3 / 4-7 / 8-14 / 15+) × users/activated/converted_paid/dropped_free/payment_failed (SQL below).
5. **Acquisition**: source × platform × activation% — reuse `getGrowthMetrics().platformAcquisition`. Embed inline (no tab-switch).
6. **Feature Usage**: reuse `getFeatureAdoption` + add (a) depth per feature (median count, avg per active user) and (b) free-vs-paid adoption split (SQL below). Label user-driven vs auto-seeded.
7. **Engagement**: reuse `getEngagementDistribution` + add a 12-week retention curve (SQL below).
8. **Failure Surfaces**: UNION of Entry failures + ClaudeCallLog failures + funnel_signup_failed, grouped by message, count + users + last_seen, top 50 (SQL below). Clickable to expand affected emails (admin PII). Plus "stuck users": signed up >7d ago, ≥1 error, never converted, never recorded again.
9. **Revenue / Subscriptions**: reuse `getBusinessMetrics` incl. `staleStripeRecords` + `pastDueRecovery`. Embed inline.
10. **User Lookup**: search email/name → `/api/admin/mri/user/[id]` → vertical timeline of OnboardingEvents, Entries, TrialEmailLog, ClaudeCallLog, RedFlags (where in affectedUserIds). `logAdminAction` on each lookup. Click any event for raw JSON.

### Validated SQL

**Web funnel** (param the interval via start/end Dates — use `oe."createdAt" >= ${start} AND oe."createdAt" <= ${end}`):
```sql
WITH funnel_steps AS (
  SELECT * FROM (VALUES
    (1,'funnel_entry_viewed','Landed on funnel'),(2,'funnel_branch_q2_viewed','Reached Q2'),
    (3,'funnel_branch_q4_selected','Finished branch Qs'),(4,'funnel_shared_q9_selected','Finished all Qs'),
    (5,'funnel_mirror_viewed','Saw mirror'),(6,'funnel_mechanism_viewed','Saw mechanism'),
    (7,'funnel_commit_viewed','Reached commit'),(8,'funnel_processing_viewed','Reached processing'),
    (9,'funnel_snapshot_viewed','Saw snapshot'),(10,'funnel_create_account_viewed','Saw create account'),
    (11,'funnel_account_created','Created account'),(12,'funnel_download_viewed','Saw download'),
    (13,'funnel_trial_continued','Continued past trial intro'),(14,'funnel_app_store_clicked','Clicked App Store'),
    (15,'funnel_continue_web_app_clicked','Chose web app'),(16,'funnel_checkout_started','Started checkout'),
    (17,'funnel_signup_completed','Signup completed'),(18,'funnel_signup_failed','SIGNUP FAILED')
  ) AS t(step_num,event,label)
)
SELECT fs.step_num, fs.label, fs.event,
  COUNT(DISTINCT oe."sessionToken") AS sessions,
  ROUND(100.0*COUNT(DISTINCT oe."sessionToken")/NULLIF(LAG(COUNT(DISTINCT oe."sessionToken")) OVER (ORDER BY fs.step_num),0),1) AS pct_of_prev,
  ROUND(100.0*COUNT(DISTINCT oe."sessionToken")/NULLIF(MAX(COUNT(DISTINCT oe."sessionToken")) OVER (),0),1) AS pct_of_top
FROM funnel_steps fs
LEFT JOIN "OnboardingEvent" oe ON oe.event=fs.event AND oe."createdAt">=${start} AND oe."createdAt"<=${end} AND ("isBot"=false OR "isBot" IS NULL)
GROUP BY fs.step_num, fs.label, fs.event ORDER BY fs.step_num;
```

**Trial→Paid:**
```sql
WITH cohort AS (
  SELECT u.id, u."subscriptionStatus", DATE_PART('day', NOW()-u."createdAt")::int AS days_since_signup,
    EXISTS(SELECT 1 FROM "Entry" e WHERE e."userId"=u.id) AS activated
  FROM "User" u WHERE u."createdAt">=${start} AND u."createdAt"<=${end}
)
SELECT CASE WHEN days_since_signup<1 THEN 'Day 0' WHEN days_since_signup BETWEEN 1 AND 3 THEN 'Day 1-3'
  WHEN days_since_signup BETWEEN 4 AND 7 THEN 'Day 4-7' WHEN days_since_signup BETWEEN 8 AND 14 THEN 'Day 8-14' ELSE 'Day 15+' END AS trial_bucket,
  COUNT(*)::int AS users, (COUNT(*) FILTER (WHERE activated))::int AS activated,
  (COUNT(*) FILTER (WHERE "subscriptionStatus"='PRO'))::int AS converted_paid,
  (COUNT(*) FILTER (WHERE "subscriptionStatus"='FREE'))::int AS dropped_to_free,
  (COUNT(*) FILTER (WHERE "subscriptionStatus"='PAST_DUE'))::int AS payment_failed
FROM cohort GROUP BY trial_bucket ORDER BY MIN(days_since_signup);
```

**Free-vs-paid feature** (extend per feature: tasks/goals/insights/lifeAudit/weeklyReport/etc.):
```sql
WITH activated AS (SELECT u.id, (u."subscriptionStatus"='PRO') AS is_paid FROM "User" u
  WHERE EXISTS(SELECT 1 FROM "Entry" e WHERE e."userId"=u.id) AND u."createdAt">=${start} AND u."createdAt"<=${end})
SELECT is_paid, COUNT(*)::int AS users,
  (COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "Task" t WHERE t."userId"=activated.id)))::int AS used_tasks
  -- repeat for Goal, UserInsight, LifeAudit, WeeklyReport, UserReminder, CalendarConnection
FROM activated GROUP BY is_paid;
```

**Retention curve:**
```sql
WITH cohort AS (SELECT u.id, u."createdAt" AS signup_at FROM "User" u WHERE u."createdAt">=NOW()-INTERVAL '90 days')
SELECT week_num, COUNT(DISTINCT c.id)::int AS cohort_size, COUNT(DISTINCT e."userId")::int AS active_in_week,
  ROUND(100.0*COUNT(DISTINCT e."userId")/NULLIF(COUNT(DISTINCT c.id),0),1)::float8 AS pct_retained
FROM cohort c CROSS JOIN generate_series(0,12) AS week_num
LEFT JOIN "Entry" e ON e."userId"=c.id AND e."createdAt">=c.signup_at+(week_num*INTERVAL '7 days') AND e."createdAt"<c.signup_at+((week_num+1)*INTERVAL '7 days')
GROUP BY week_num ORDER BY week_num;
```

**Failure surfaces:**
```sql
(SELECT 'Entry failure' AS source, "errorMessage" AS message, COUNT(*)::int AS occurrences, COUNT(DISTINCT "userId")::int AS users_affected, MAX("createdAt") AS last_seen FROM "Entry" WHERE status='FAILED' AND "createdAt">=${start} GROUP BY "errorMessage")
UNION ALL (SELECT 'AI call failure', "errorMessage", COUNT(*)::int, COUNT(DISTINCT "userId")::int, MAX("createdAt") FROM "ClaudeCallLog" WHERE success=false AND "createdAt">=${start} GROUP BY "errorMessage")
UNION ALL (SELECT 'Signup failure', COALESCE("value",'(no detail)'), COUNT(*)::int, COUNT(DISTINCT "userId")::int, MAX("createdAt") FROM "OnboardingEvent" WHERE event='funnel_signup_failed' AND "createdAt">=${start} GROUP BY "value")
ORDER BY occurrences DESC LIMIT 50;
```

---

## AI Insights panel (headline)

**Snapshot** (`snapshot.ts`): call the section queries, serialize aggregates only
(NO raw rows) into a <5KB JSON blob: `{rangeUsed, generatedAt, systemHealth,
webFunnel[], activation, trialFunnel, acquisition[], featureUsage{freeVsPaid[]},
engagement{distribution,retentionCurve}, failures[], revenue{stalePro,pastDue,mrr}}`.

**insights.ts**: send snapshot to Claude (`CLAUDE_MODEL`, callClaude-style with
ClaudeCallLog purpose `'admin_insights'`), `extractJson` → `JSON.parse` → zod
validate → write `AdminInsight` row (snapshotData, insights, summary, modelUsed,
tokensIn/Out, costCents, rangeUsed, generatedBy). Return the row.

**System prompt (verbatim):**
```
You are the diagnostic analyst for Acuity, a voice journaling iOS/Android/web app. You receive a metrics snapshot and produce 3-5 actionable insights for the founder.

Your role:
- Identify the BIGGEST leaks and frustration signals, in order of business impact
- Surface patterns and themes, not just isolated numbers
- Be specific: cite the exact metric, the affected user count, the location in the funnel
- Recommend a concrete next action for each insight

Rules:
- NEVER recommend generic advice ("improve onboarding"). Always reference specific data from the snapshot.
- If two metrics point at the same root cause, group them as one insight with both as evidence.
- If conversion is healthy in one slice and broken in another (e.g., iOS converts at 71%, web at 19%), call out the gap.
- Severity:
  - "critical" = active revenue loss, customer-facing breakage, >20% of users affected
  - "warning" = friction with material conversion impact, 5-20% of users affected
  - "info" = optimization opportunities, leading indicators worth watching
- Limit to 3-5 insights total. Better to have 3 sharp ones than 8 mediocre.

Output ONLY valid JSON in this shape:
{
  "summary": "One-paragraph synthesis (3-4 sentences) of the top issues right now.",
  "insights": [
    {
      "severity": "critical" | "warning" | "info",
      "category": "funnel" | "errors" | "conversion" | "engagement" | "revenue" | "acquisition",
      "title": "Short headline (under 80 chars)",
      "evidence": "Specific numbers from the snapshot proving this is a real issue",
      "affectedUserCount": <number or null>,
      "recommendedAction": "Concrete next step, ideally something Jimmy can execute this week"
    }
  ]
}
```
User message = the JSON snapshot.

**Triggers:** (1) Inngest cron every 4h; (2) manual `?regenerate=true` rate-limited
once/5min/admin; (3) first load if no row exists. UI always shows the latest
`AdminInsight` by generatedAt; never block page load (show "Generating…" + poll 10s).

**Panel UI:** full-width top of MRI. Header: "🧠 AI INSIGHTS · Generated Xm ago ·
$0.0X · Sonnet · [Regenerate]". Summary paragraph. Then insight cards: 🚨 critical
(red border) / ⚠️ warning (amber) / ℹ️ info (blue), each with title, evidence,
recommendedAction. "Stale" badge if >6h old.

---

## Constraints

- Don't delete the Features/Engagement tabs (leave them).
- Read-only everywhere except AdminInsight/ClaudeCallLog/AdminAuditLog writes.
- tsc-clean; `next.config` has `ignoreBuildErrors` but new files must compile.
- Branch `feat/admin-mri-diagnostic`; PR to main with sections list + Claude prompt + migration SQL.
