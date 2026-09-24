/**
 * Weekly audit — metrics collector.
 *
 * Runs BEFORE Claude in .github/workflows/weekly-audit.yml and writes
 * audits/data/<week-end-date>.json. Every source is independent and wrapped:
 * a failure is recorded under `blind_spots` and the run keeps going. This
 * script must never exit non-zero because a source failed — only if it
 * cannot write the output file at all.
 *
 * PRIVACY: this file is read by an LLM and committed to the `audits` branch.
 * It must contain aggregates only — never transcripts, summaries, names,
 * emails, user ids, or anything that identifies a user. Entry themes are
 * lower-cased labels with a minimum-distinct-users threshold (k-anonymity).
 * App-store review text is public and allowed; reviewer names are dropped.
 *
 * Reporting week: Sunday 00:00 → Saturday 23:59:59 America/Chicago.
 * Run on a Saturday (the cron) → the current week. Run on any other day
 * (manual test) → the most recently completed week. Override with
 * AUDIT_WEEK_END=YYYY-MM-DD (must be a Saturday).
 *
 * Env (all optional — a missing one becomes a blind spot):
 *   AUDIT_DATABASE_URL        read-only Postgres role (falls back to DIRECT_URL / DATABASE_URL locally)
 *   REVENUECAT_API_KEY        RC v2 secret key, read-only (charts_metrics:*:read)
 *   REVENUECAT_PROJECT_ID
 *   REVENUECAT_INCLUDES_STRIPE  "1"/"0" — force the dedup rule instead of auto-detecting
 *   STRIPE_RESTRICTED_KEY     read-only restricted key (falls back to STRIPE_SECRET_KEY locally)
 *   ANTHROPIC_ADMIN_KEY       sk-ant-admin… for the cost report
 *   OPENAI_ADMIN_KEY          org admin key for /v1/organization/costs
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  for Play reviews (same SA as IAP verification)
 *   APP_STORE_APP_ID (default 6762633410), GOOGLE_PLAY_PACKAGE_NAME (default com.heelerdigital.acuity)
 *   AUDIT_THEME_MIN_USERS (default 2)
 */
import { execSync } from "node:child_process";
import { createSign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const TZ = "America/Chicago";
const DAY = 86_400_000;

type BlindSpot = { source: string; error: string; fix?: string };
const blindSpots: BlindSpot[] = [];
const sourceStatus: Record<string, "ok" | "partial" | "skipped" | "error"> = {};

function blind(source: string, error: unknown, fix?: string) {
  const msg = error instanceof Error ? error.message : String(error);
  blindSpots.push({ source, error: msg.slice(0, 400), ...(fix ? { fix } : {}) });
  console.warn(`[blind-spot] ${source}: ${msg.slice(0, 200)}`);
}

async function safe<T>(source: string, fn: () => Promise<T>, fix?: string): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    blind(source, err, fix);
    return null;
  }
}

// `vercel env pull` writes "[SENSITIVE]" for unreadable vars — treat as unset.
for (const [k, v] of Object.entries(process.env)) if (v === "[SENSITIVE]" || v === "") delete process.env[k];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url.split("?")[0]}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url.split("?")[0]}`);
  }
}

const round = (n: number | null | undefined, dp = 1) =>
  n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp;
const pct = (num: number, den: number) => (den > 0 ? round((num / den) * 100, 1) : null);
const num = (v: unknown) => (v == null ? 0 : Number(v));

// ─── Central-time week math ──────────────────────────────────────────────────

function tzOffsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - at.getTime();
}

/** Midnight at the start of `ymd` in America/Chicago, as a UTC Date. */
function centralMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMs(new Date(guess), TZ);
  t = guess - tzOffsetMs(new Date(t), TZ); // second pass settles DST edges
  return new Date(t);
}

function centralYmd(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(at); // YYYY-MM-DD
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function dowOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

type Win = { label: string; start: Date; end: Date; startYmd: string; endYmd: string };

function weekWindow(weekEndYmd: string, label: string): Win {
  const startYmd = addDaysYmd(weekEndYmd, -6);
  return {
    label,
    start: centralMidnight(startYmd),
    end: centralMidnight(addDaysYmd(weekEndYmd, 1)), // exclusive
    startYmd,
    endYmd: weekEndYmd,
  };
}

function resolveWeekEnd(): { weekEnd: string; partial: boolean } {
  const override = process.env.AUDIT_WEEK_END;
  if (override) {
    if (dowOfYmd(override) !== 6) throw new Error(`AUDIT_WEEK_END=${override} is not a Saturday`);
    return { weekEnd: override, partial: centralMidnight(addDaysYmd(override, 1)) > new Date() };
  }
  const today = centralYmd(new Date());
  const dow = dowOfYmd(today);
  if (dow === 6) return { weekEnd: today, partial: true };
  return { weekEnd: addDaysYmd(today, -(dow + 1)), partial: false };
}

// ─── Database (Supabase Postgres, read-only) ────────────────────────────────

async function connectDb(): Promise<pg.Client | null> {
  const url = process.env.AUDIT_DATABASE_URL || process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    sourceStatus.supabase = "skipped";
    blind("supabase", "No AUDIT_DATABASE_URL set", "Add the AUDIT_DATABASE_URL secret (read-only role connection string)");
    return null;
  }
  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 60_000,
    connectionTimeoutMillis: 20_000,
  });
  await client.connect();
  // Belt and braces: even if the role were writable, this session is not.
  await client.query("SET default_transaction_read_only = on");
  return client;
}

async function q<T = any>(db: pg.Client, sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query(sql, params);
  return r.rows as T[];
}

const NOT_ADMIN = `COALESCE(u."isAdmin", false) = false`;

async function weekActivity(db: pg.Client, w: Win) {
  const [signups] = await q(db, `SELECT count(*)::int n FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2`, [w.start, w.end]);
  const [act] = await q(db, `
    SELECT count(*)::int entries, count(DISTINCT e."userId")::int recorders
    FROM "Entry" e JOIN "User" u ON u.id = e."userId"
    WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2`, [w.start, w.end]);
  const [len] = await q(db, `
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY array_length(regexp_split_to_array(trim(e.transcript), '\\s+'), 1)) AS median_words,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(e."audioDuration", e.duration)) AS median_seconds
    FROM "Entry" e JOIN "User" u ON u.id = e."userId"
    WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2
      AND e.transcript IS NOT NULL AND length(trim(e.transcript)) > 0`, [w.start, w.end]);
  const [habit] = await q(db, `
    SELECT count(*) FILTER (WHERE days >= 3)::int three_plus, count(*)::int total FROM (
      SELECT e."userId", count(DISTINCT (e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE COALESCE(u.timezone, 'America/Chicago'))::date) days
      FROM "Entry" e JOIN "User" u ON u.id = e."userId"
      WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2
      GROUP BY e."userId") t`, [w.start, w.end]);
  return {
    week: `${w.startYmd}..${w.endYmd}`,
    signups: signups.n,
    weekly_active_recorders: act.recorders,
    entries: act.entries,
    entries_per_active_user: act.recorders ? round(act.entries / act.recorders, 2) : null,
    median_entry_words: round(len?.median_words, 0),
    median_entry_seconds: round(len?.median_seconds, 0),
    pct_active_recording_3plus_days: pct(habit.three_plus, habit.total),
  };
}

async function collectSupabase(db: pg.Client, cur: Win, history: Win[]) {
  const out: Record<string, unknown> = {};

  out.weekly_series = await safe("supabase.weekly_series", async () => {
    const rows = [];
    for (const w of [cur, ...history]) rows.push(await weekActivity(db, w));
    return rows; // index 0 = this week, then 1..4 weeks back
  });

  out.definitions = {
    weekly_active_recorders: "Distinct non-admin users with ≥1 Entry created in the week (WAU by recording).",
    weekly_active_seen: "Non-admin users whose lastSeenAt falls in the week (app/web open). Only available for the current week — lastSeenAt is overwritten.",
    pct_active_recording_3plus_days: "Of weekly active recorders, % who recorded on 3+ distinct local calendar days (user timezone).",
    retention_classic: "Dn = % of the cohort with an Entry during day n after signup ([n, n+1) days). Cohort = non-admin signups in the 7 days ending n+1 days before week end, so every member has had the chance.",
    retention_week_window: "D7w = entry in days [7,14); D30w = entry in days [28,35). Less noisy at small cohort sizes.",
    activation: "% of the week's signups with ≥1 Entry so far.",
  };

  out.weekly_active_seen = await safe("supabase.wau_seen", async () => {
    const [r] = await q(db, `SELECT count(*)::int n FROM "User" u WHERE ${NOT_ADMIN} AND u."lastSeenAt" >= $1 AND u."lastSeenAt" < $2`, [cur.start, cur.end]);
    return r.n;
  });

  out.signups_breakdown = await safe("supabase.signups_breakdown", async () => {
    const byPlatform = await q(db, `
      SELECT COALESCE(u."devicePlatform", 'web_or_unknown') platform, count(*)::int n
      FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2 GROUP BY 1 ORDER BY 2 DESC`, [cur.start, cur.end]);
    const byMethod = await q(db, `
      SELECT COALESCE(u."signupMethod", 'unknown') method, count(*)::int n
      FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2 GROUP BY 1 ORDER BY 2 DESC`, [cur.start, cur.end]);
    const bySource = await q(db, `
      SELECT COALESCE(NULLIF(u."signupUtmSource", ''), '(none)') source, COALESCE(NULLIF(u."signupUtmMedium", ''), '(none)') medium, count(*)::int n
      FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2 GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`, [cur.start, cur.end]);
    return { by_platform: byPlatform, by_method: byMethod, by_utm_source_medium: bySource };
  });

  out.activation = await safe("supabase.activation", async () => {
    const [r] = await q(db, `
      SELECT count(*)::int cohort,
        count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Entry" e WHERE e."userId" = u.id))::int activated
      FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2`, [cur.start, cur.end]);
    return { cohort: r.cohort, activated: r.activated, pct: pct(r.activated, r.cohort) };
  });

  const retention = async (fromDay: number, toDay: number) => {
    // Cohort: signups in the 7 days that end `toDay` days before the week end.
    const cohortEnd = new Date(cur.end.getTime() - toDay * DAY);
    const cohortStart = new Date(cohortEnd.getTime() - 7 * DAY);
    const [r] = await q(db, `
      SELECT count(*)::int cohort,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Entry" e WHERE e."userId" = u.id
            AND e."createdAt" >= u."createdAt" + make_interval(days => $3)
            AND e."createdAt" <  u."createdAt" + make_interval(days => $4)))::int retained
      FROM "User" u WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2`,
      [cohortStart, cohortEnd, fromDay, toDay]);
    return { cohort: r.cohort, retained: r.retained, pct: pct(r.retained, r.cohort), cohort_signup_window: `${cohortStart.toISOString().slice(0, 10)}..${cohortEnd.toISOString().slice(0, 10)}` };
  };
  out.retention = await safe("supabase.retention", async () => ({
    d1: await retention(1, 2),
    d7: await retention(7, 8),
    d30: await retention(30, 31),
    d7_week_window: await retention(7, 14),
    d30_week_window: await retention(28, 35),
  }));

  out.pipeline_health = await safe("supabase.pipeline_health", async () =>
    q(db, `SELECT e.status, count(*)::int n FROM "Entry" e WHERE e."createdAt" >= $1 AND e."createdAt" < $2 GROUP BY 1 ORDER BY 2 DESC`, [cur.start, cur.end]));

  out.mood_distribution = await safe("supabase.mood", async () =>
    q(db, `SELECT COALESCE(e.mood, '(none)') mood, count(*)::int n FROM "Entry" e JOIN "User" u ON u.id = e."userId"
           WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2 GROUP BY 1 ORDER BY 2 DESC`, [cur.start, cur.end]));

  out.onboarding = await safe("supabase.onboarding", async () => {
    const since = new Date(cur.end.getTime() - 30 * DAY);
    const appSteps = await q(db, `
      SELECT o."currentStep" step, count(*)::int users, count(o."completedAt")::int completed
      FROM "UserOnboarding" o JOIN "User" u ON u.id = o."userId"
      WHERE ${NOT_ADMIN} AND u."createdAt" >= $1 AND u."createdAt" < $2 GROUP BY 1 ORDER BY 1`, [since, cur.end]);
    const webFunnel = async (w: Win) => q(db, `
      SELECT event, count(*)::int events,
        count(DISTINCT COALESCE("sessionToken", "userId"))::int uniques
      FROM "OnboardingEvent" WHERE "isBot" = false AND "createdAt" >= $1 AND "createdAt" < $2
      GROUP BY 1 ORDER BY 3 DESC LIMIT 60`, [w.start, w.end]);
    return {
      note: "app_onboarding_steps: signups in the last 30 days by UserOnboarding.currentStep (read step meanings from the codebase). web_funnel_events: OnboardingEvent counts (bots excluded), uniques = distinct session/user.",
      app_onboarding_steps_last_30d: appSteps,
      web_funnel_events_this_week: await webFunnel(cur),
      web_funnel_events_last_week: await webFunnel(history[0]),
    };
  });

  out.subscriptions_db = await safe("supabase.subscriptions", async () => {
    const byStatusSource = await q(db, `
      SELECT u."subscriptionStatus" status, COALESCE(u."subscriptionSource", '(none)') source, count(*)::int n
      FROM "User" u WHERE ${NOT_ADMIN} GROUP BY 1, 2 ORDER BY 3 DESC`);
    const productMix = await q(db, `
      SELECT COALESCE(u."subscriptionSource", '(none)') source,
        COALESCE(u."appleProductId", u."googleProductId", '(stripe — see stripe.plan_mix)') product, count(*)::int n
      FROM "User" u WHERE ${NOT_ADMIN} AND u."subscriptionStatus" = 'PRO' GROUP BY 1, 2 ORDER BY 3 DESC`);
    const trialToPaid = async (days: number) => q(db, `
      SELECT COALESCE(u."devicePlatform", 'web_or_unknown') platform,
        count(*)::int trials_ended,
        count(*) FILTER (WHERE u."subscriptionStatus" = 'PRO' AND COALESCE(u."subscriptionSource", '') <> 'comp')::int converted
      FROM "User" u WHERE ${NOT_ADMIN} AND u."trialEndsAt" >= $1 AND u."trialEndsAt" < $2
      GROUP BY 1 ORDER BY 2 DESC`, [new Date(cur.end.getTime() - days * DAY), cur.end]);
    const [newTrials] = await q(db, `
      SELECT count(*)::int n FROM "User" u WHERE ${NOT_ADMIN} AND u."trialEndsAt" IS NOT NULL AND u."createdAt" >= $1 AND u."createdAt" < $2`, [cur.start, cur.end]);
    const [churnProxy] = await q(db, `
      SELECT count(*)::int n FROM "User" u WHERE ${NOT_ADMIN} AND u."subscriptionStatus" = 'FREE'
        AND u."subscriptionSource" IN ('stripe', 'apple', 'google_play') AND u."updatedAt" >= $1 AND u."updatedAt" < $2`, [cur.start, cur.end]);
    return {
      note: "Current state from the User table. Each user row has ONE subscriptionSource, so these counts are inherently de-duplicated across stores. 'comp' = complimentary, never revenue. Channel map: apple=iOS, google_play=Android, stripe=web. trial_to_paid is keyed on the user's last-seen devicePlatform (a proxy for channel). churn_proxy uses updatedAt and over-counts; prefer Stripe/RevenueCat churn when present.",
      by_status_and_source: byStatusSource,
      pro_product_mix: productMix,
      new_trials_this_week: newTrials.n,
      trial_to_paid_7d_by_platform: await trialToPaid(7),
      trial_to_paid_30d_by_platform: await trialToPaid(30),
      churn_proxy_this_week: churnProxy.n,
    };
  });

  out.audio_minutes_this_week = await safe("supabase.audio_minutes", async () => {
    const [r] = await q(db, `SELECT COALESCE(sum(COALESCE("audioDuration", duration)), 0)::bigint secs FROM "Entry" WHERE "createdAt" >= $1 AND "createdAt" < $2`, [cur.start, cur.end]);
    return round(num(r.secs) / 60, 1);
  });

  return out;
}

async function collectThemes(db: pg.Client, cur: Win, prev: Win) {
  const minUsers = Number(process.env.AUDIT_THEME_MIN_USERS ?? 2);
  const themeCounts = async (w: Win) => q<{ theme: string; entries: number; users: number }>(db, `
    SELECT lower(trim(t)) theme, count(*)::int entries, count(DISTINCT e."userId")::int users
    FROM "Entry" e JOIN "User" u ON u.id = e."userId", unnest(e.themes) t
    WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2 AND length(trim(t)) > 0
    GROUP BY 1`, [w.start, w.end]);
  const [thisWeek, lastWeek] = [await themeCounts(cur), await themeCounts(prev)];
  // Anything that could carry an identifier is dropped outright.
  const looksIdentifying = (s: string) => /@|https?:|\d{3,}|\b(mr|mrs|ms|dr)\.?\s/i.test(s) || s.length > 60;
  const last = new Map(lastWeek.map((r) => [r.theme, r]));
  const eligible = thisWeek.filter((r) => r.users >= minUsers && !looksIdentifying(r.theme));
  const top = eligible.sort((a, b) => b.entries - a.entries || b.users - a.users).slice(0, 25).map((r) => {
    const prevEntries = last.get(r.theme)?.entries ?? 0;
    return {
      theme: r.theme,
      entries: r.entries,
      distinct_users: r.users,
      entries_last_week: prevEntries,
      wow_change_pct: prevEntries ? round(((r.entries - prevEntries) / prevEntries) * 100, 0) : null,
    };
  });
  const thisSet = new Set(thisWeek.map((r) => r.theme));
  const faded = lastWeek
    .filter((r) => r.users >= minUsers && !thisSet.has(r.theme) && !looksIdentifying(r.theme))
    .sort((a, b) => b.entries - a.entries).slice(0, 10)
    .map((r) => ({ theme: r.theme, entries_last_week: r.entries }));
  // Theme labels are free-form and rarely repeat verbatim across users, so the
  // exact-label list is thin at small scale. Word-level counts ("work",
  // "routine", "family") carry the real signal and clear the same k threshold.
  const STOP = new Set(["about", "after", "again", "also", "being", "from", "have", "into", "just", "like", "more", "much", "over", "some", "that", "their", "them", "then", "there", "they", "this", "through", "very", "what", "when", "with", "your", "feeling", "feelings", "things", "thing", "general", "overall", "daily", "life"]);
  const wordCounts = async (w: Win) => q<{ word: string; entries: number; users: number }>(db, `
    SELECT w word, count(DISTINCT e.id)::int entries, count(DISTINCT e."userId")::int users
    FROM "Entry" e JOIN "User" u ON u.id = e."userId", unnest(e.themes) t, regexp_split_to_table(lower(t), '[^a-z]+') w
    WHERE ${NOT_ADMIN} AND e."createdAt" >= $1 AND e."createdAt" < $2 AND length(w) >= 4
    GROUP BY 1`, [w.start, w.end]);
  const [wThis, wLast] = [await wordCounts(cur), await wordCounts(prev)];
  const wPrev = new Map(wLast.map((r) => [r.word, r.entries]));
  const topWords = wThis.filter((r) => r.users >= minUsers && !STOP.has(r.word))
    .sort((a, b) => b.entries - a.entries || b.users - a.users).slice(0, 25)
    .map((r) => {
      const p = wPrev.get(r.word) ?? 0;
      return { word: r.word, entries: r.entries, distinct_users: r.users, entries_last_week: p, wow_change_pct: p ? round(((r.entries - p) / p) * 100, 0) : null };
    });
  return {
    note: `Extracted Entry.themes labels, lower-cased. A theme or theme-word is only shown if at least ${minUsers} distinct users mentioned it this week (k-anonymity); labels that look like they carry identifiers are dropped. No entry text is ever included. top_25_theme_words is usually the more useful list — exact labels rarely repeat across users.`,
    distinct_themes_this_week: thisWeek.length,
    suppressed_below_threshold: thisWeek.length - eligible.length,
    top_25: top,
    top_25_theme_words: topWords,
    faded_since_last_week: faded,
  };
}

async function collectMarketingSpend(db: pg.Client, cur: Win, history: Win[]) {
  const rows = [];
  for (const w of [cur, ...history]) {
    const [adlab] = await q(db, `SELECT COALESCE(sum("spendCents"), 0)::bigint c, COALESCE(sum(clicks), 0)::bigint clicks, COALESCE(sum(conversions), 0)::bigint conv
      FROM adlab_daily_metrics WHERE date >= $1::date AND date <= $2::date`, [w.startYmd, w.endYmd]);
    rows.push({
      week: `${w.startYmd}..${w.endYmd}`,
      meta_adlab_spend_usd: round(num(adlab.c) / 100, 2),
      meta_adlab_link_clicks: num(adlab.clicks),
      meta_adlab_conversions: num(adlab.conv),
    });
  }
  return { note: "Paid acquisition (Meta via AdLab daily metrics). Not COGS — used for CAC.", weekly: rows };
}

// ─── RevenueCat (v2) ─────────────────────────────────────────────────────────

async function collectRevenueCat(cur: Win, prev: Win) {
  const key = process.env.REVENUECAT_API_KEY;
  const project = process.env.REVENUECAT_PROJECT_ID;
  if (!key || !project) {
    sourceStatus.revenuecat = "skipped";
    blind("revenuecat", "REVENUECAT_API_KEY / REVENUECAT_PROJECT_ID not set",
      "RevenueCat dashboard → Project settings → API keys → new v2 secret key with read-only Charts & Metrics permissions; project id is in the dashboard URL (proj…)");
    return null;
  }
  const base = `https://api.revenuecat.com/v2/projects/${project}`;
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  // Charts & Metrics domain is limited to 25 req/min.
  const rc = async (p: string) => { await sleep(2600); return fetchJson(`${base}${p}`, { headers }); };
  const out: Record<string, unknown> = {};
  let failures = 0;

  out.overview = await safe("revenuecat.overview", async () => {
    const r = await rc(`/metrics/overview?currency=USD`);
    return Object.fromEntries((r.metrics ?? []).map((m: any) => [m.id, { name: m.name, value: m.value, unit: m.unit, period: m.period }]));
  }) ?? (failures++, null);

  const revenue = async (w: Win) => {
    const r = await rc(`/metrics/revenue?currency=USD&start_date=${w.startYmd}&end_date=${w.endYmd}`);
    return r.value;
  };
  out.revenue_this_week_usd = await safe("revenuecat.revenue", () => revenue(cur)) ?? (failures++, null);
  out.revenue_last_week_usd = await safe("revenuecat.revenue_prev", () => revenue(prev));

  const chartStart = addDaysYmd(cur.endYmd, -7 * 12 + 1);
  const trim = (c: any) => ({
    display_name: c.display_name,
    resolution: c.resolution,
    yaxis: c.yaxis,
    summary: c.summary,
    measures: (c.measures ?? []).map((m: any) => m.display_name ?? m),
    segments: (c.segments ?? []).map((s: any) => s.display_name),
    values: Array.isArray(c.values) ? c.values.slice(-40) : c.values,
  });

  // Discover the weekly resolution id and the store segment from one chart's options.
  const opts = await safe("revenuecat.chart_options", () => rc(`/charts/revenue/options`));
  const weekRes = opts?.resolutions?.find((r: any) => /week/i.test(r.display_name ?? r.id))?.id;
  const storeSeg = opts?.segments?.find((s: any) => /store/i.test(`${s.id} ${s.display_name}`))?.id;
  const chartQs = (segment?: string) =>
    `?currency=USD&start_date=${chartStart}&end_date=${cur.endYmd}` +
    (weekRes != null ? `&resolution=${encodeURIComponent(weekRes)}` : "") +
    (segment ? `&segment=${encodeURIComponent(segment)}` : "");

  const charts = ["mrr", "revenue", "actives", "trials", "trials_new", "trial_conversion_rate",
    "conversion_to_paying", "churn", "refunds", "refund_rate", "subscription_status"];
  const byStore = ["revenue", "trials_new", "trial_conversion_rate", "actives"];
  const chartsOut: Record<string, unknown> = {};
  for (const name of charts) {
    const c = await safe(`revenuecat.chart.${name}`, () => rc(`/charts/${name}${chartQs()}`));
    if (c) chartsOut[name] = trim(c); else failures++;
  }
  const storeOut: Record<string, unknown> = {};
  if (storeSeg) {
    for (const name of byStore) {
      const c = await safe(`revenuecat.chart.${name}.by_store`, () => rc(`/charts/${name}${chartQs(storeSeg)}`));
      if (c) storeOut[name] = trim(c);
    }
  } else {
    blind("revenuecat.store_split", "No store segment found in chart options", "Check /charts/revenue/options segments — store split may need a different segment id");
  }
  out.charts = chartsOut;
  out.charts_by_store = storeOut;
  out.chart_resolution_used = weekRes ?? "default";

  const envFlag = process.env.REVENUECAT_INCLUDES_STRIPE;
  const detected = JSON.stringify(storeOut).toLowerCase().includes("stripe");
  out.includes_stripe = envFlag != null ? envFlag === "1" : detected;
  out.includes_stripe_basis = envFlag != null ? "REVENUECAT_INCLUDES_STRIPE env" : "auto-detected from store segments";

  sourceStatus.revenuecat = failures === 0 ? "ok" : failures > charts.length ? "error" : "partial";
  return out;
}

// ─── Stripe (web) ────────────────────────────────────────────────────────────

async function stripeList(key: string, endpoint: string, params: Record<string, string>, max = 2000): Promise<any[]> {
  const all: any[] = [];
  let startingAfter: string | undefined;
  while (all.length < max) {
    const qs = new URLSearchParams({ limit: "100", ...params, ...(startingAfter ? { starting_after: startingAfter } : {}) });
    const r = await fetchJson(`https://api.stripe.com/v1/${endpoint}?${qs}`, { headers: { Authorization: `Bearer ${key}` } });
    all.push(...r.data);
    if (!r.has_more || r.data.length === 0) break;
    startingAfter = r.data[r.data.length - 1].id;
  }
  return all;
}

async function collectStripe(cur: Win, prev: Win) {
  const key = process.env.STRIPE_RESTRICTED_KEY || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    sourceStatus.stripe = "skipped";
    blind("stripe", "STRIPE_RESTRICTED_KEY not set", "Stripe → Developers → API keys → Create restricted key with Read on Subscriptions, Charges, Refunds, Balance transactions, Prices");
    return null;
  }
  if (/^(sk|rk)_test_/.test(key)) {
    sourceStatus.stripe = "error";
    blind("stripe", "Stripe key is a TEST-mode key — live web subscriptions are invisible", "Use a LIVE restricted key (rk_live_…) for STRIPE_RESTRICTED_KEY");
    return { mode: "test", note: "Test-mode key: no live data collected." };
  }
  const unix = (d: Date) => String(Math.floor(d.getTime() / 1000));
  const inWin = (ts: number | null | undefined, w: Win) => ts != null && ts * 1000 >= w.start.getTime() && ts * 1000 < w.end.getTime();
  const out: Record<string, unknown> = {};

  // The Stripe account is SHARED with Heeler Digital agency clients (retainers
  // etc.). Everything below is scoped to Ripple/Acuity products and the
  // customers who subscribe to them — never count agency revenue as Ripple's.
  const productMatch = new RegExp(process.env.AUDIT_STRIPE_PRODUCT_MATCH || "acuity|ripple", "i");
  const products = await safe("stripe.products", () => stripeList(key, "products", {}));
  const rippleProducts = new Set((products ?? []).filter((p) => productMatch.test(p.name ?? "")).map((p) => p.id));
  if (products && rippleProducts.size === 0) blind("stripe.products", `No Stripe product matches /${productMatch.source}/`, "Set AUDIT_STRIPE_PRODUCT_MATCH to the product-name pattern");
  const allSubs = await safe("stripe.subscriptions", () => stripeList(key, "subscriptions", { status: "all" }));
  const isRipple = (sub: any) => sub.items.data.some((i: any) => rippleProducts.has(i.price?.product));
  const subs = allSubs?.filter(isRipple) ?? null;
  const rippleCustomers = new Set((subs ?? []).map((sub) => sub.customer));
  out.scope = {
    ripple_products: [...rippleProducts].length,
    other_products_excluded: (products?.length ?? 0) - rippleProducts.size,
    non_ripple_subscriptions_excluded: (allSubs?.length ?? 0) - (subs?.length ?? 0),
    note: "Shared Stripe account: only subscriptions on products matching the Ripple/Acuity pattern, and charges/refunds/fees from those customers, are counted.",
  };
  // Heeler Digital side projects on the same account fund Ripple's expenses.
  // Reported separately so the audit can reason about runway — never mixed
  // into Ripple MRR, margin, or unit economics.
  const others = (allSubs ?? []).filter((sub) => !isRipple(sub) && ["active", "past_due"].includes(sub.status));
  out.other_business_revenue = {
    active_subscriptions: others.length,
    mrr_usd: round(others.reduce((sum, sub) => sum + sub.items.data.reduce((a: number, i: any) => {
      const p = i.price ?? {};
      const perMonth = { day: 30.44, week: 4.345, month: 1, year: 1 / 12 }[p.recurring?.interval as string] ?? 0;
      return a + ((p.unit_amount ?? 0) * (i.quantity ?? 1) * perMonth) / (p.recurring?.interval_count ?? 1);
    }, 0), 0) / 100, 2),
    note: "Heeler Digital side-project retainers on the shared Stripe account. They cover Ripple's business expenses. Use only for runway/burn context; NOT Ripple revenue.",
  };
  if (subs) {
    const monthly = (item: any) => {
      const p = item.price ?? item.plan;
      if (!p?.recurring && !p?.interval) return 0;
      const interval = p.recurring?.interval ?? p.interval;
      const count = p.recurring?.interval_count ?? p.interval_count ?? 1;
      const perMonth = { day: 30.44, week: 4.345, month: 1, year: 1 / 12 }[interval as string] ?? 0;
      return ((p.unit_amount ?? p.amount ?? 0) * (item.quantity ?? 1) * perMonth) / count;
    };
    const paying = subs.filter((s) => ["active", "past_due"].includes(s.status));
    const mrrCents = paying.reduce((sum, s) => sum + s.items.data.reduce((a: number, i: any) => a + monthly(i), 0), 0);
    const mix = new Map<string, number>();
    for (const s of paying) for (const i of s.items.data) {
      const p = i.price ?? {};
      const k = `${(p.unit_amount ?? 0) / 100} ${p.currency ?? ""}/${p.recurring?.interval ?? "?"}`;
      mix.set(k, (mix.get(k) ?? 0) + 1);
    }
    const trialConv = (days: number) => {
      const from = cur.end.getTime() - days * DAY;
      const ended = subs.filter((s) => s.trial_end && s.trial_end * 1000 >= from && s.trial_end * 1000 < Math.min(cur.end.getTime(), Date.now()));
      const converted = ended.filter((s) => ["active", "past_due"].includes(s.status) || (s.status === "canceled" && s.ended_at && s.ended_at > s.trial_end + 86400));
      return { trials_ended: ended.length, converted: converted.length, pct: pct(converted.length, ended.length) };
    };
    out.subscriptions = {
      mrr_usd: round(mrrCents / 100, 2),
      active_paying: paying.length,
      past_due: subs.filter((s) => s.status === "past_due").length,
      unpaid: subs.filter((s) => s.status === "unpaid").length,
      active_trials: subs.filter((s) => s.status === "trialing").length,
      new_trials_this_week: subs.filter((s) => s.trial_start && inWin(s.created, cur)).length,
      new_trials_last_week: subs.filter((s) => s.trial_start && inWin(s.created, prev)).length,
      new_paid_no_trial_this_week: subs.filter((s) => !s.trial_start && inWin(s.created, cur)).length,
      trial_to_paid_7d: trialConv(7),
      trial_to_paid_30d: trialConv(30),
      canceled_this_week: subs.filter((s) => inWin(s.canceled_at, cur)).length,
      canceled_last_week: subs.filter((s) => inWin(s.canceled_at, prev)).length,
      set_to_cancel_at_period_end: paying.filter((s) => s.cancel_at_period_end).length,
      with_discounts: paying.filter((s) => s.discount || (s.discounts ?? []).length).length,
      plan_mix: Object.fromEntries(mix),
      note: "MRR = list price of active+past_due subscription items normalised to a month; discounts not subtracted (see with_discounts).",
    };
  }

  const money = async (w: Win) => {
    const range = { "created[gte]": unix(w.start), "created[lt]": unix(w.end) };
    const charges = (await stripeList(key, "charges", range)).filter((c) => rippleCustomers.has(c.customer));
    const ok = charges.filter((c) => c.paid && c.status === "succeeded");
    const refunds = (await stripeList(key, "refunds", { ...range, "expand[]": "data.charge" }))
      .filter((r) => rippleCustomers.has(r.charge?.customer));
    const bts = (await stripeList(key, "balance_transactions", { ...range, "expand[]": "data.source" }))
      .filter((b) => rippleCustomers.has(b.source?.customer));
    const fees = bts.reduce((s, b) => s + (b.fee ?? 0), 0);
    return {
      gross_revenue_usd: round(ok.reduce((s, c) => s + c.amount, 0) / 100, 2),
      successful_charges: ok.length,
      failed_charges: charges.filter((c) => c.status === "failed").length,
      refunds_count: refunds.length,
      refunds_usd: round(refunds.reduce((s, r) => s + r.amount, 0) / 100, 2),
      stripe_fees_usd: round(fees / 100, 2),
      net_usd: round(bts.reduce((s, b) => s + (b.net ?? 0), 0) / 100, 2),
    };
  };
  out.this_week = await safe("stripe.money", () => money(cur));
  out.last_week = await safe("stripe.money_prev", () => money(prev));

  sourceStatus.stripe = subs && out.this_week ? "ok" : subs || out.this_week ? "partial" : "error";
  return out;
}

// ─── Costs ───────────────────────────────────────────────────────────────────

function readManualCosts(): any {
  const p = path.join(repoRoot, "audits", "manual-costs.json");
  if (!existsSync(p)) {
    blind("costs.manual", "audits/manual-costs.json missing");
    return null;
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

async function collectCosts(db: pg.Client | null, cur: Win, audioMinutes: number | null, stripeFeesUsd: number | null, rcRevenueUsd: number | null) {
  const weekly: Record<string, { usd: number | null; basis: string }> = {};
  const manual = readManualCosts();
  const WEEK_OF_MONTH = 7 / 30.44;

  // Anthropic — Admin API if available, else the app's own ClaudeCallLog.
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
  const anthropicApi = adminKey ? await safe("costs.anthropic_admin_api", async () => {
    let cents = 0;
    let page: string | undefined;
    do {
      const qs = new URLSearchParams({ starting_at: cur.start.toISOString(), ending_at: cur.end.toISOString(), bucket_width: "1d", ...(page ? { page } : {}) });
      const r = await fetchJson(`https://api.anthropic.com/v1/organizations/cost_report?${qs}`, {
        headers: { "x-api-key": adminKey, "anthropic-version": "2023-06-01" },
      });
      for (const b of r.data ?? []) for (const x of b.results ?? []) cents += Number(x.amount ?? 0); // decimal string, USD cents
      page = r.has_more ? r.next_page : undefined;
    } while (page);
    return round(cents / 100, 2);
  }) : (blind("costs.anthropic_admin_api", "ANTHROPIC_ADMIN_KEY not set — using app-logged ClaudeCallLog instead (misses Claude Code / this audit / untracked calls)", "Claude Console → Settings → Admin keys → create admin key"), null);

  const claudeLog = db ? await safe("costs.claude_call_log", async () => {
    const byPurpose = await q(db, `
      SELECT split_part(purpose, ':', 1) purpose, sum("costCents")::bigint cents, count(*)::int calls
      FROM "ClaudeCallLog" WHERE "createdAt" >= $1 AND "createdAt" < $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 20`, [cur.start, cur.end]);
    const [userFacing] = await q(db, `SELECT COALESCE(sum("costCents"), 0)::bigint cents FROM "ClaudeCallLog" WHERE "createdAt" >= $1 AND "createdAt" < $2 AND "userId" IS NOT NULL`, [cur.start, cur.end]);
    const total = byPurpose.reduce((s, r) => s + num(r.cents), 0);
    return {
      total_usd: round(total / 100, 2),
      user_attributed_usd: round(num(userFacing.cents) / 100, 2),
      by_purpose: byPurpose.map((r) => ({ purpose: r.purpose, usd: round(num(r.cents) / 100, 2), calls: r.calls })),
    };
  }) : null;
  weekly.anthropic = anthropicApi != null
    ? { usd: anthropicApi, basis: "Anthropic Admin cost_report API" }
    : { usd: claudeLog?.total_usd ?? null, basis: "ClaudeCallLog (app-logged only)" };

  // OpenAI (Whisper + embeddings) — org costs API if available, else estimate from audio minutes.
  const openaiKey = process.env.OPENAI_ADMIN_KEY;
  const openaiApi = openaiKey ? await safe("costs.openai_admin_api", async () => {
    const qs = new URLSearchParams({ start_time: String(Math.floor(cur.start.getTime() / 1000)), end_time: String(Math.floor(cur.end.getTime() / 1000)), bucket_width: "1d", limit: "31" });
    const r = await fetchJson(`https://api.openai.com/v1/organization/costs?${qs}`, { headers: { Authorization: `Bearer ${openaiKey}` } });
    let usd = 0;
    for (const b of r.data ?? []) for (const x of b.results ?? []) usd += Number(x.amount?.value ?? 0);
    return round(usd, 2);
  }) : (blind("costs.openai_admin_api", "OPENAI_ADMIN_KEY not set — Whisper cost is an estimate from audio minutes", "platform.openai.com → Settings → Organization → Admin keys"), null);
  const whisperRate = manual?.openai?.whisper_usd_per_minute ?? 0.006;
  weekly.openai = openaiApi != null
    ? { usd: openaiApi, basis: "OpenAI organization costs API" }
    : { usd: audioMinutes != null ? round(audioMinutes * whisperRate, 2) : null, basis: `ESTIMATE: ${audioMinutes ?? "?"} audio min × $${whisperRate}/min (transcription only)` };

  weekly.stripe_fees = { usd: stripeFeesUsd, basis: "Stripe balance transactions (actual)" };

  const rcCfg = manual?.revenuecat;
  weekly.revenuecat = rcCfg?.monthly_usd != null
    ? { usd: round(rcCfg.monthly_usd * WEEK_OF_MONTH, 2), basis: "manual-costs.json monthly_usd" }
    : rcCfg?.pct_of_revenue != null && rcRevenueUsd != null
      ? { usd: round(rcRevenueUsd * rcCfg.pct_of_revenue, 2), basis: `ESTIMATE: RC-tracked revenue × ${rcCfg.pct_of_revenue}` }
      : { usd: null, basis: "unknown — set revenuecat in audits/manual-costs.json" };

  for (const svc of ["vercel", "supabase", "expo_eas", "resend", "apple_developer", "google_play", "domains", "other"]) {
    const m = manual?.[svc]?.monthly_usd;
    weekly[svc] = m != null ? { usd: round(m * WEEK_OF_MONTH, 2), basis: "manual-costs.json monthly_usd × 7/30.44" } : { usd: null, basis: "unknown — fill audits/manual-costs.json" };
  }
  const missing = Object.entries(weekly).filter(([, v]) => v.usd == null).map(([k]) => k);
  if (missing.length) blind("costs.manual", `No cost figure for: ${missing.join(", ")}`, "Fill monthly_usd for each service in audits/manual-costs.json on main");

  const infra = db ? await safe("costs.infrastructure_cost_table", () =>
    q(db, `SELECT category, label, "amountCents" FROM "InfrastructureCost" WHERE "effectiveAt" <= now() AND ("expiresAt" IS NULL OR "expiresAt" > now())`)) : null;

  const known = Object.values(weekly).reduce((s, v) => s + (v.usd ?? 0), 0);
  return {
    weekly_by_service: weekly,
    weekly_known_total_usd: round(known, 2),
    services_unknown: missing,
    claude_call_log: claudeLog,
    infrastructure_cost_table_rows: infra,
  };
}

// ─── App stores ──────────────────────────────────────────────────────────────

async function googleAccessToken(saJson: string, scope: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const r = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }),
  });
  return r.access_token;
}

async function collectAppStores(cur: Win) {
  const appId = process.env.APP_STORE_APP_ID || "6762633410";
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME || "com.heelerdigital.acuity";
  const out: Record<string, unknown> = {};

  out.app_store = await safe("app_store.lookup", async () => {
    const r = await fetchJson(`https://itunes.apple.com/lookup?id=${appId}&country=us`);
    const a = r.results?.[0];
    if (!a) throw new Error("App not found in iTunes lookup");
    return {
      name: a.trackName, rating: a.averageUserRating ?? null, rating_count: a.userRatingCount ?? 0,
      rating_current_version: a.averageUserRatingForCurrentVersion ?? null, version: a.version,
      current_version_released: a.currentVersionReleaseDate, price: a.formattedPrice, genre: a.primaryGenreName,
    };
  });

  out.app_store_reviews_this_week = await safe("app_store.reviews", async () => {
    const r = await fetchJson(`https://itunes.apple.com/us/rss/customerreviews/page=1/id=${appId}/sortby=mostrecent/json`);
    const entries = [r.feed?.entry ?? []].flat().filter((e: any) => e?.["im:rating"]);
    return entries
      .filter((e: any) => { const t = new Date(e.updated?.label).getTime(); return t >= cur.start.getTime() && t < cur.end.getTime(); })
      .map((e: any) => ({ date: e.updated.label.slice(0, 10), rating: Number(e["im:rating"].label), title: e.title?.label, text: e.content?.label, version: e["im:version"]?.label }));
  });

  const sa = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  out.google_play_reviews_this_week = sa ? await safe("google_play.reviews", async () => {
    const token = await googleAccessToken(sa, "https://www.googleapis.com/auth/androidpublisher");
    const r = await fetchJson(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/reviews?maxResults=100`, { headers: { Authorization: `Bearer ${token}` } });
    return (r.reviews ?? []).map((rv: any) => rv.comments?.[0]?.userComment).filter(Boolean)
      .filter((c: any) => { const t = Number(c.lastModified?.seconds ?? 0) * 1000; return t >= cur.start.getTime() && t < cur.end.getTime(); })
      .map((c: any) => ({ date: new Date(Number(c.lastModified.seconds) * 1000).toISOString().slice(0, 10), rating: c.starRating, text: c.text?.trim(), app_version: c.appVersionName, device: c.deviceMetadata?.productName }));
  }, "Grant the Play service account 'View app information' + 'Reply to reviews' in Play Console → Users and permissions") : (blind("google_play.reviews", "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not set", "Add the same service-account JSON used for Android IAP verification as a GitHub secret"), null);

  // Play has no public ratings API; the store page is the only source. Fragile by nature.
  out.google_play = await safe("google_play.listing", async () => {
    const res = await fetch(`https://play.google.com/store/apps/details?id=${pkg}&hl=en_US&gl=US`, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    // Only the JSON-LD aggregateRating belongs to THIS app — "Rated x stars"
    // aria-labels on the page are mostly the similar-apps carousel.
    const agg = html.match(/"aggregateRating"\s*:\s*\{[^}]*\}/)?.[0];
    const rating = agg?.match(/"ratingValue"\s*:\s*"?([\d.]+)/)?.[1] ?? null;
    const count = agg?.match(/"ratingCount"\s*:\s*"?(\d+)/)?.[1] ?? null;
    const downloads = html.match(/>([\d.,KM]+\+)<\/div><div[^>]*>Downloads/i)?.[1] ?? null;
    if (!agg) return { rating: null, rating_count: null, downloads, note: "No rating on the Play listing (Google hides it until enough ratings exist)" };
    return { rating: rating ? Number(rating) : null, rating_count: count ? Number(count) : null, downloads };
  });

  sourceStatus.app_stores = out.app_store ? "ok" : "error";
  return out;
}

// ─── Codebase activity ───────────────────────────────────────────────────────

function collectShipping(cur: Win) {
  try {
    const log = execSync(`git log --since="${cur.start.toISOString()}" --until="${cur.end.toISOString()}" --no-merges --pretty=format:%h%x09%ad%x09%s --date=short`, { cwd: repoRoot, encoding: "utf8" });
    const commits = log.split("\n").filter(Boolean).map((l) => { const [hash, date, subject] = l.split("\t"); return { hash, date, subject }; });
    const byType: Record<string, number> = {};
    for (const c of commits) { const t = c.subject.match(/^(\w+)(\(.+\))?:/)?.[1] ?? "other"; byType[t] = (byType[t] ?? 0) + 1; }
    return { commits_on_main_this_week: commits.length, by_type: byType, commits: commits.slice(0, 80) };
  } catch (err) {
    blind("git", err, "Checkout needs fetch-depth ≥ 200");
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { weekEnd, partial } = resolveWeekEnd();
  const cur = weekWindow(weekEnd, "this_week");
  const history = [1, 2, 3, 4].map((i) => weekWindow(addDaysYmd(weekEnd, -7 * i), `minus_${i}`));
  const prev = history[0];
  console.log(`[audit] week ${cur.startYmd}..${cur.endYmd} (${cur.start.toISOString()} → ${cur.end.toISOString()})${partial ? " — in progress" : ""}`);

  const db = await safe("supabase.connect", connectDb, "Check AUDIT_DATABASE_URL (use the session pooler or direct host, port 5432)");
  let supabase: Record<string, unknown> | null = null;
  let themes = null;
  let marketing = null;
  if (db) {
    supabase = await collectSupabase(db, cur, history);
    themes = await safe("themes", () => collectThemes(db, cur, prev));
    marketing = await safe("marketing_spend", () => collectMarketingSpend(db, cur, history));
    const dbFailures = blindSpots.filter((b) => b.source.startsWith("supabase")).length;
    sourceStatus.supabase = dbFailures === 0 ? "ok" : "partial";
  } else if (!sourceStatus.supabase) {
    sourceStatus.supabase = "error";
  }

  const revenuecat = await safe("revenuecat", () => collectRevenueCat(cur, prev));
  const stripe = await safe("stripe", () => collectStripe(cur, prev));
  const stripeWeek = (stripe as any)?.this_week;
  const costs = await safe("costs", () => collectCosts(
    db, cur, (supabase?.audio_minutes_this_week as number) ?? null,
    stripeWeek?.stripe_fees_usd ?? null, (revenuecat as any)?.revenue_this_week_usd ?? null));
  sourceStatus.costs = costs && (costs as any).services_unknown.length === 0 ? "ok" : "partial";
  const appStores = await safe("app_stores", () => collectAppStores(cur));
  const shipping = collectShipping(cur);
  if (db) await db.end().catch(() => {});

  // ── Dedup rule + derived unit economics ───────────────────────────────────
  const rcIncludesStripe = (revenuecat as any)?.includes_stripe === true;
  const subsDb = (supabase as any)?.subscriptions_db;
  const paidByChannel: Record<string, number> = { ios: 0, android: 0, web: 0 };
  for (const r of subsDb?.by_status_and_source ?? []) {
    if (r.status !== "PRO") continue;
    if (r.source === "apple") paidByChannel.ios += r.n;
    else if (r.source === "google_play") paidByChannel.android += r.n;
    else if (r.source === "stripe") paidByChannel.web += r.n;
  }
  const paidTotal = paidByChannel.ios + paidByChannel.android + paidByChannel.web;
  const wau = (supabase as any)?.weekly_series?.[0]?.weekly_active_recorders ?? null;
  const weeklyCost = (costs as any)?.weekly_known_total_usd ?? null;
  const rcRev = (revenuecat as any)?.revenue_this_week_usd ?? null;
  const stripeRev = stripeWeek?.gross_revenue_usd ?? null;
  const weeklyRevenue = rcIncludesStripe ? rcRev : rcRev != null || stripeRev != null ? (rcRev ?? 0) + (stripeRev ?? 0) : null;
  const derived = {
    dedup_rule: rcIncludesStripe
      ? "RevenueCat ingests Stripe → RevenueCat is the single revenue/subscriber source; Stripe used only for fees and refunds."
      : "RevenueCat = iOS + Android only; Stripe = web only. Totals are RC + Stripe. The User table (one subscriptionSource per user) is the de-duplicated subscriber count.",
    paid_subscribers_by_channel_db: paidByChannel,
    paid_subscribers_total_db: paidTotal,
    weekly_revenue_usd: weeklyRevenue,
    weekly_revenue_basis: rcRev == null ? "Stripe only (RevenueCat unavailable — mobile revenue missing)" : rcIncludesStripe ? "RevenueCat" : "RevenueCat + Stripe",
    weekly_known_cost_usd: weeklyCost,
    cost_per_weekly_active_user_usd: wau && weeklyCost != null ? round(weeklyCost / wau, 2) : null,
    gross_margin_per_paid_user_week_usd: paidTotal && weeklyRevenue != null && weeklyCost != null ? round((weeklyRevenue - weeklyCost) / paidTotal, 2) : null,
    caveat: "Costs only include services with a known figure (see costs.services_unknown). Treat margin as an upper bound until manual-costs.json is complete.",
  };

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    period: {
      timezone: TZ, week_start: cur.startYmd, week_end: cur.endYmd,
      start_utc: cur.start.toISOString(), end_utc_exclusive: cur.end.toISOString(),
      week_in_progress: partial,
      history_weeks: history.map((w) => `${w.startYmd}..${w.endYmd}`),
    },
    sources_status: sourceStatus,
    derived,
    supabase,
    themes,
    revenuecat,
    stripe,
    costs,
    marketing,
    app_stores: appStores,
    shipping,
    blind_spots: blindSpots,
  };

  const outDir = path.join(repoRoot, "audits", "data");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${cur.endYmd}.json`);
  writeFileSync(outFile, JSON.stringify(report, null, 2));
  // Handy for the workflow: which file / date this run produced.
  writeFileSync(path.join(outDir, "LATEST"), cur.endYmd);
  console.log(`[audit] wrote ${path.relative(repoRoot, outFile)} — ${blindSpots.length} blind spot(s); sources: ${JSON.stringify(sourceStatus)}`);
}

main().catch((err) => {
  // Last resort: still leave a file so the audit + email have something to say.
  console.error("[audit] collector crashed:", err);
  try {
    const outDir = path.join(repoRoot, "audits", "data");
    mkdirSync(outDir, { recursive: true });
    const ymd = centralYmd(new Date());
    writeFileSync(path.join(outDir, `${ymd}.json`), JSON.stringify({ generated_at: new Date().toISOString(), crashed: String(err?.stack ?? err), blind_spots: blindSpots }, null, 2));
    writeFileSync(path.join(outDir, "LATEST"), ymd);
  } catch { /* nothing else to do */ }
  process.exit(0);
});
