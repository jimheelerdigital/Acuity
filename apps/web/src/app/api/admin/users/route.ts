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
  | "Downloaded"
  | "First debrief"
  | "Exploring"
  | "Building habit"
  | "Active user"
  | "At risk"
  | "Churned";

function computeLifecycle(
  entryCount: number,
  lastEntryAt: Date | null,
  appFirstOpenedAt: Date | null,
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
  // No entries
  if (appFirstOpenedAt) return "Downloaded";
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
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Math.min(Math.max(isFinite(limitRaw) ? limitRaw : 50, 1), 100);
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

    let totalUsers = 0, downloadedOrWeb = 0, recordedAtLeast1 = 0;
    let activeThisWeek = 0, atRisk = 0, neverRecorded = 0, paying = 0;
    let totalEntriesThisWeek = 0, activeUsersThisWeek = 0;

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

      const lifecycle = computeLifecycle(ec, lastEntry, u.appFirstOpenedAt, now);
      if (lifecycle === "At risk") atRisk++;
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
    };
    } catch (err) {
      console.error("[admin/users] Summary query failed:", err);
    }
  }

  // ── Sort mapping ──
  const orderBy = sortField === "entries"
    ? { entries: { _count: sortDir } as const }
    : sortField === "lastEntry"
      ? { lastRecordingAt: sortDir }
      : sortField === "lastActive"
        ? { lastSeenAt: sortDir }
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

  const mappedUsers = page.map((u) => {
    const entryCount = u._count.entries;
    const entriesThisWeek = u.entries.length;
    const lastEntryAt = lastEntryMap.get(u.id) ?? u.lastRecordingAt;
    const platform = computePlatform(u.appFirstOpenedAt, entryCount, u.devicePlatform);
    const lifecycle = computeLifecycle(entryCount, lastEntryAt, u.appFirstOpenedAt, now);
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
      downloadReminder: (u as Record<string, unknown>).downloadReminderSentAt
        ? `Sent ${new Date((u as Record<string, unknown>).downloadReminderSentAt as string).toLocaleDateString()}`
        : u.appFirstOpenedAt ? "Not needed" : "Pending",
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
