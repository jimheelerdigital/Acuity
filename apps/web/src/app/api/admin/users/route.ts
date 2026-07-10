/**
 * GET /api/admin/users
 *   ?q=<substring>           optional — matches email (case-insensitive)
 *   ?cursor=<userId>         optional — keyset pagination cursor
 *   ?limit=<1..100>          default 50
 *   ?lifecycle=<csv>         optional — filter by lifecycle stage(s)
 *   ?plan=<csv>              optional — filter by subscription status(es)
 *   ?platform=<csv>          optional — filter by platform (ios,web,both,none)
 *   ?sort=<field>&dir=<asc|desc>  optional — sort by field
 *
 * Returns enriched user list with lifecycle stage, accurate entry counts
 * (from COUNT, not totalRecordings), platform detection (web + mobile),
 * and summary stats on first page.
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Lifecycle stage computation ──────────────────────────────────

type LifecycleStage =
  | "Signed up"
  | "Viewed download"
  | "Blocked in webview"
  | "Tapped App Store"
  | "Bounced from store"
  | "Attempted download"
  | "App downloaded"
  | "Downloaded"
  | "First debrief"
  | "Exploring"
  | "Building habit"
  | "Active user"
  | "At risk"
  | "Churned";

// ── Download-stage event names (emitted by the /start DownloadScreen) ──
const DL_SCREEN_VIEWED = "funnel_download_screen_viewed";
const DL_WEBVIEW_BLOCKED = "funnel_inapp_browser_detected";
const DL_APP_STORE_CLICKED = "funnel_app_store_clicked";
const DL_RETURNED = "funnel_download_returned";
const DL_WEB_APP_CLICKED = "funnel_continue_web_app_clicked";
// Legacy aliases still present in older OnboardingEvent rows
const DL_LEGACY_VIEWED = ["funnel_download_viewed", "onboarding_app_store_clicked"];
const DOWNLOAD_STAGE_EVENTS = [
  DL_SCREEN_VIEWED, DL_WEBVIEW_BLOCKED, DL_APP_STORE_CLICKED, DL_RETURNED, DL_WEB_APP_CLICKED, ...DL_LEGACY_VIEWED,
];
const EMPTY_EVENT_SET: Set<string> = new Set();

// ── Recovery ("download rescue") emails ──────────────────────────
// The admin "Recovery" column USED to read User.downloadReminderSentAt, but
// that field is stamped only by recovery_download_reminder — an email that has
// been DISABLED in email-enabled.ts (replaced 2026-06 by the 4 stage-specific
// rescue emails below). So the column showed "Pending" forever even when a real
// rescue email had gone out. It now reads TrialEmailLog for these keys, which is
// where the recovery-email orchestrator actually records every send.
const RECOVERY_EMAIL_KEYS = [
  "rescue_signup_only",
  "rescue_viewed_no_tap",
  "rescue_tapped_app_store",
  "rescue_webview_blocked",
];
// Short label per key for the compact "Recovery" cell (e.g. "webview · Jul 9").
const RECOVERY_EMAIL_LABEL: Record<string, string> = {
  rescue_signup_only: "signup",
  rescue_viewed_no_tap: "viewed",
  rescue_tapped_app_store: "tapped",
  rescue_webview_blocked: "webview",
};

// Most-advanced (most actionable) download sub-step a user reached, derived from
// their funnel events. Ordered so the strongest "got stuck" signal wins: a user
// who tapped the store and came back is more telling than one who only viewed.
function downloadSubstage(ev: Set<string>): LifecycleStage {
  if (ev.has(DL_APP_STORE_CLICKED) && ev.has(DL_RETURNED)) return "Bounced from store";
  if (ev.has(DL_APP_STORE_CLICKED) || ev.has("onboarding_app_store_clicked")) return "Tapped App Store";
  if (ev.has(DL_WEBVIEW_BLOCKED)) return "Blocked in webview";
  if (ev.has(DL_SCREEN_VIEWED) || ev.has(DL_WEB_APP_CLICKED) || ev.has("funnel_download_viewed")) return "Viewed download";
  return "Attempted download";
}

function computeLifecycle(
  entryCount: number,
  lastEntryAt: Date | null,
  appFirstOpenedAt: Date | null,
  downloadEvents: Set<string>,
  now: Date
): LifecycleStage {
  // Users with entries check recency first
  if (entryCount > 0 && lastEntryAt) {
    const daysSince = (now.getTime() - lastEntryAt.getTime()) / 86400000;
    if (daysSince > 14) return "Churned";
    if (daysSince > 7) return "At risk";
    if (entryCount >= 15) return "Active user";
    if (entryCount >= 6) return "Building habit";
    if (entryCount >= 2) return "Exploring";
    return "First debrief";
  }
  // No entries — appFirstOpenedAt is the source of truth for a real app open
  if (appFirstOpenedAt) return "App downloaded";
  // Otherwise surface the most-advanced download sub-step they reached
  if (downloadEvents.size > 0) return downloadSubstage(downloadEvents);
  return "Signed up";
}

// ── Platform computation ─────────────────────────────────────────

function computePlatform(
  appFirstOpenedAt: Date | null,
  entryCount: number,
  devicePlatform: string | null
): "iOS" | "Web" | "Both" | "None" {
  const hasApp = !!appFirstOpenedAt;
  const hasWebEntries = entryCount > 0 && !devicePlatform;
  if (hasApp && hasWebEntries) return "Both";
  if (hasApp) return "iOS";
  if (entryCount > 0 && !hasApp) return "Web";
  return "None";
}

// ── Plan status with trial days ──────────────────────────────────

function computePlanStatus(
  subscriptionStatus: string | null,
  trialEndsAt: Date | null,
  stripeSubscriptionId: string | null,
  stripeCustomerId: string | null,
  now: Date
): string {
  if (subscriptionStatus === "PRO") return "Paid";
  if (subscriptionStatus === "PAST_DUE") return "Past Due";
  if (stripeSubscriptionId && subscriptionStatus === "FREE") return "Churned";
  if (stripeCustomerId && !stripeSubscriptionId && subscriptionStatus === "FREE") return "Churned";
  if (subscriptionStatus === "TRIAL" && trialEndsAt) {
    const daysLeft = Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000);
    if (daysLeft <= 0) return `Trial — Expired ${Math.abs(daysLeft)}d ago`;
    return `Trial — ${daysLeft}d left`;
  }
  if (subscriptionStatus === "TRIAL") return "Trial";
  if (subscriptionStatus === "FREE" && trialEndsAt) {
    const daysAgo = Math.floor((now.getTime() - trialEndsAt.getTime()) / 86400000);
    return `Expired ${daysAgo}d ago`;
  }
  return "None";
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 200);
  const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 200, 1), 500);
  const lifecycleFilter = req.nextUrl.searchParams.get("lifecycle")?.split(",").filter(Boolean) ?? [];
  const sortField = req.nextUrl.searchParams.get("sort") ?? "createdAt";
  const sortDir = req.nextUrl.searchParams.get("dir") === "asc" ? "asc" as const : "desc" as const;

  const where = q
    ? { email: { contains: q, mode: "insensitive" as const } }
    : {};

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  // ── Summary stats (only on first page) ──
  let summaryStats = undefined;
  if (!cursor) {
    try {
    const allUsers = await prisma.user.findMany({
      where,
      select: {
        id: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        appFirstOpenedAt: true,
        devicePlatform: true,
        lastSeenAt: true,
        currentStreak: true,
        _count: { select: {
          entries: { where: { status: "COMPLETE" } },
        }},
        entries: {
          where: { status: "COMPLETE", createdAt: { gte: weekAgo } },
          select: { id: true },
        },
      },
    });

    // Find users with latest entry for recency check
    const latestEntries = await prisma.entry.groupBy({
      by: ["userId"],
      where: { status: "COMPLETE" },
      _max: { createdAt: true },
    });
    const lastEntryMap = new Map(latestEntries.map(e => [e.userId, e._max.createdAt]));

    // Download-stage events for the whole cohort, so the summary can break down
    // where stuck users are in the download stage (viewed / blocked / tapped / bounced).
    const allDownloadEvents = await prisma.onboardingEvent.findMany({
      where: { userId: { in: allUsers.map(u => u.id) }, event: { in: DOWNLOAD_STAGE_EVENTS } },
      select: { userId: true, event: true },
    });
    const allDownloadByUser = new Map<string, Set<string>>();
    for (const e of allDownloadEvents) {
      if (!e.userId) continue;
      let set = allDownloadByUser.get(e.userId);
      if (!set) { set = new Set(); allDownloadByUser.set(e.userId, set); }
      set.add(e.event);
    }

    let totalUsers = 0, downloadedOrWeb = 0, recordedAtLeast1 = 0;
    let activeThisWeek = 0, atRisk = 0, neverRecorded = 0, paying = 0;
    let totalEntriesThisWeek = 0, activeUsersThisWeek = 0;
    // Download-stage breakdown (users with no entries and no app open)
    let dlViewed = 0, dlBlockedWebview = 0, dlTappedAppStore = 0, dlBouncedFromStore = 0;

    for (const u of allUsers) {
      totalUsers++;
      const ec = u._count.entries;
      const etw = u.entries.length;
      const lastEntry = lastEntryMap.get(u.id) ?? null;

      if (u.appFirstOpenedAt || ec > 0) downloadedOrWeb++;
      if (ec > 0) recordedAtLeast1++;
      if (ec === 0) neverRecorded++;
      if (u.subscriptionStatus === "PRO" && u.stripeSubscriptionId) paying++;
      if (etw > 0) { activeThisWeek++; totalEntriesThisWeek += etw; activeUsersThisWeek++; }

      const lifecycle = computeLifecycle(ec, lastEntry, u.appFirstOpenedAt, allDownloadByUser.get(u.id) ?? EMPTY_EVENT_SET, now);
      if (lifecycle === "At risk") atRisk++;
      else if (lifecycle === "Viewed download") dlViewed++;
      else if (lifecycle === "Blocked in webview") dlBlockedWebview++;
      else if (lifecycle === "Tapped App Store") dlTappedAppStore++;
      else if (lifecycle === "Bounced from store") dlBouncedFromStore++;
    }

    summaryStats = {
      totalUsers,
      downloadedOrWeb,
      recordedAtLeast1,
      activeThisWeek,
      atRisk,
      neverRecorded,
      paying,
      avgEntriesPerActiveUser: activeUsersThisWeek > 0 ? Math.round((totalEntriesThisWeek / activeUsersThisWeek) * 10) / 10 : 0,
      downloadStages: {
        viewed: dlViewed,
        blockedWebview: dlBlockedWebview,
        tappedAppStore: dlTappedAppStore,
        bouncedFromStore: dlBouncedFromStore,
      },
    };
    } catch (err) {
      console.error("[admin/users] Summary query failed:", err);
    }
  }

  // ── Sort mapping ──
  // "plan" orders by raw subscriptionStatus so paid / trial / free / churned
  // rows group together; "trialEnds" orders by trial expiry so you can find
  // trials about to lapse (asc) or freshly started (desc).
  const orderBy = sortField === "entries"
    ? { entries: { _count: sortDir } as const }
    : sortField === "lastEntry"
      ? { lastRecordingAt: sortDir }
      : sortField === "lastActive"
        ? { lastSeenAt: sortDir }
        : sortField === "plan"
          ? { subscriptionStatus: sortDir }
          : sortField === "trialEnds"
            ? { trialEndsAt: sortDir }
            : { createdAt: sortDir };

  // ── Main query ──
  let users;
  try {
    users = await prisma.user.findMany({
      where,
      orderBy: orderBy as Record<string, unknown>,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSeenAt: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
        devicePlatform: true,
        appVersion: true,
        appFirstOpenedAt: true,
        downloadReminderSentAt: true,
        signupUtmSource: true,
        signupUtmMedium: true,
        signupLandingPath: true,
        signupMethod: true,
        currentStreak: true,
        lastRecordingAt: true,
        _count: {
          select: {
            entries: { where: { status: "COMPLETE" } },
            weeklyReports: true,
          },
        },
        entries: {
          where: { status: "COMPLETE", createdAt: { gte: weekAgo } },
          select: { id: true },
        },
      },
    });
  } catch (err) {
    // Fallback: if downloadReminderSentAt column doesn't exist yet (needs db push),
    // retry without it to prevent the entire dashboard from breaking
    console.error("[admin/users] Main query failed, retrying without new columns:", err);
    users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: sortDir },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastSeenAt: true,
        subscriptionStatus: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialEndsAt: true,
        devicePlatform: true,
        appVersion: true,
        appFirstOpenedAt: true,
        signupUtmSource: true,
        signupUtmMedium: true,
        signupLandingPath: true,
        signupMethod: true,
        currentStreak: true,
        lastRecordingAt: true,
        _count: {
          select: {
            entries: { where: { status: "COMPLETE" } },
            weeklyReports: true,
          },
        },
        entries: {
          where: { status: "COMPLETE", createdAt: { gte: weekAgo } },
          select: { id: true },
        },
      },
    });
  }

  const hasMore = users.length > limit;
  const page = hasMore ? users.slice(0, limit) : users;

  // Get latest entry dates for the page users
  const userIds = page.map(u => u.id);
  const latestEntries = await prisma.entry.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, status: "COMPLETE" },
    _max: { createdAt: true },
  });
  const lastEntryMap = new Map(latestEntries.map(e => [e.userId, e._max.createdAt]));

  // Pull every download-stage event for these users so we can derive the
  // most-advanced download sub-step each one reached (not just a yes/no click).
  const downloadEvents = await prisma.onboardingEvent.findMany({
    where: {
      userId: { in: userIds },
      event: { in: DOWNLOAD_STAGE_EVENTS },
    },
    select: { userId: true, event: true },
  });
  const downloadEventsByUser = new Map<string, Set<string>>();
  for (const e of downloadEvents) {
    if (!e.userId) continue;
    let set = downloadEventsByUser.get(e.userId);
    if (!set) { set = new Set(); downloadEventsByUser.set(e.userId, set); }
    set.add(e.event);
  }

  // Real recovery-email sends for these users, straight from TrialEmailLog
  // (the orchestrator's source of truth). Ordered newest-first so the first row
  // we see per user is their most recent rescue email.
  const recoveryLogs = await prisma.trialEmailLog.findMany({
    where: { userId: { in: userIds }, emailKey: { in: RECOVERY_EMAIL_KEYS } },
    orderBy: { sentAt: "desc" },
    select: { userId: true, emailKey: true, sentAt: true },
  });
  const latestRecoveryByUser = new Map<string, { emailKey: string; sentAt: Date }>();
  for (const r of recoveryLogs) {
    if (!r.userId || latestRecoveryByUser.has(r.userId)) continue;
    latestRecoveryByUser.set(r.userId, { emailKey: r.emailKey, sentAt: r.sentAt });
  }

  const mappedUsers = page.map((u) => {
    const entryCount = u._count.entries;
    const entriesThisWeek = u.entries.length;
    const lastEntryAt = lastEntryMap.get(u.id) ?? u.lastRecordingAt;
    const platform = computePlatform(u.appFirstOpenedAt, entryCount, u.devicePlatform);
    const userDownloadEvents = downloadEventsByUser.get(u.id) ?? EMPTY_EVENT_SET;
    const lifecycle = computeLifecycle(entryCount, lastEntryAt, u.appFirstOpenedAt, userDownloadEvents, now);
    const planStatus = computePlanStatus(u.subscriptionStatus, u.trialEndsAt, u.stripeSubscriptionId, u.stripeCustomerId, now);

    // Last active: most recent of lastSeenAt, lastEntryAt, appFirstOpenedAt
    const candidates = [u.lastSeenAt, lastEntryAt, u.appFirstOpenedAt].filter(Boolean) as Date[];
    const lastActive = candidates.length > 0 ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null;

    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt,
      signupUtmSource: u.signupUtmSource,
      signupUtmMedium: u.signupUtmMedium,
      signupLandingPath: u.signupLandingPath,
      signupMethod: (u as Record<string, unknown>).signupMethod as string | null ?? null,
      subscriptionStatus: u.subscriptionStatus,
      planStatus,
      platform,
      lifecycle,
      entryCount,
      entriesThisWeek,
      lastEntryAt,
      streak: u.currentStreak ?? 0,
      weeklyReportCount: u._count.weeklyReports,
      lastActive,
      trialEndsAt: u.trialEndsAt,
      downloadReminder: (() => {
        const rec = latestRecoveryByUser.get(u.id);
        if (rec) {
          const label = RECOVERY_EMAIL_LABEL[rec.emailKey] ?? "sent";
          return `${label} · ${new Date(rec.sentAt).toLocaleDateString()}`;
        }
        // No recovery email sent. If they already opened the app there was
        // nothing to recover; otherwise a rescue is still eligible/pending.
        return u.appFirstOpenedAt ? "Not needed" : "Pending";
      })(),
    };
  });

  // Apply lifecycle filter client-side (after computation)
  const filtered = lifecycleFilter.length > 0
    ? mappedUsers.filter(u => lifecycleFilter.includes(u.lifecycle))
    : mappedUsers;

  return NextResponse.json({
    users: filtered,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    ...(summaryStats ? { summary: summaryStats } : {}),
  });
}
