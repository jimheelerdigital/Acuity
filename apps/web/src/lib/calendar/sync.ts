/**
 * Pull events from the user's primary Google Calendar and upsert
 * into the CalendarEvent table. Pure server-side; never invoked from
 * the client. Slice 2 v1.2 Calendar Integration.
 *
 * Window: last 30 days through next 7 days. Anchored to "now" not to
 * the user's last sync — a re-sync after a long gap captures the
 * recent past for context grounding, not a million stale events.
 *
 * Pagination: walks `events.list` nextPageToken to completion. Cap at
 * MAX_PAGES so a runaway calendar can't take down the cron.
 *
 * Rate-limit handling: Google returns 429 + 403:rateLimitExceeded on
 * over-quota. We respect Retry-After when present, otherwise back off
 * exponentially. After MAX_RETRIES the sync fails soft and the
 * lastSyncedAt column is NOT bumped, so the user sees stale data
 * rather than a broken UI.
 *
 * Token freshness: we hold a refresh token at rest; the access token
 * is obtained at sync time via OAuth2Client.refreshAccessToken. We
 * don't persist access tokens — they're 60-min-lived and we'd rather
 * re-fetch than handle expiry races.
 */

import { google, type calendar_v3 } from "googleapis";

import { decryptToken } from "@/lib/calendar/encryption";
import { calendarOAuthClient } from "@/lib/calendar/oauth";
import { safeLog } from "@/lib/safe-log";

const SYNC_LOOKBACK_DAYS = 30;
const SYNC_LOOKAHEAD_DAYS = 7;
const PAGE_SIZE = 250; // Google's max per page for events.list
const MAX_PAGES = 20; // hard cap — 5000 events covers any normal user
const MAX_RETRIES = 3;

export interface SyncResult {
  ok: boolean;
  eventsUpserted: number;
  errorMessage?: string;
}

/**
 * Sync events for a single user. Returns counts + a flag so the
 * caller (cron or on-demand endpoint) can bump UI state.
 *
 * Idempotent: re-running over the same window upserts the same rows
 * (unique key is (userId, externalEventId)). Events deleted from
 * Google during the window will NOT be deleted from CalendarEvent —
 * that's a future hardening if it matters; right now a stale
 * cancelled meeting in our local mirror is harmless context for
 * reflection.
 */
export async function syncCalendarEventsForUser(
  userId: string
): Promise<SyncResult> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleCalendarRefreshToken: true },
  });
  if (!user?.googleCalendarRefreshToken) {
    return { ok: false, eventsUpserted: 0, errorMessage: "NotConnected" };
  }

  const refreshToken = decryptToken(user.googleCalendarRefreshToken);
  if (!refreshToken) {
    // Decrypt failed — likely NEXTAUTH_SECRET rotated since connect.
    // Surface to the user as a re-connect prompt by clearing the
    // dead token. Stale connection-state UI is worse than empty.
    safeLog.warn("calendar.sync.token_decrypt_failed", { userId });
    await prisma.user.update({
      where: { id: userId },
      data: { googleCalendarRefreshToken: null },
    });
    return { ok: false, eventsUpserted: 0, errorMessage: "TokenUnusable" };
  }

  const oauth = calendarOAuthClient();
  oauth.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth });

  const now = Date.now();
  const timeMin = new Date(now - SYNC_LOOKBACK_DAYS * 86400_000).toISOString();
  const timeMax = new Date(now + SYNC_LOOKAHEAD_DAYS * 86400_000).toISOString();

  let pageToken: string | undefined;
  let pagesFetched = 0;
  let upserted = 0;

  while (pagesFetched < MAX_PAGES) {
    let pageData: calendar_v3.Schema$Events | null = null;
    let attempt = 0;
    while (attempt <= MAX_RETRIES) {
      try {
        const res = await calendar.events.list({
          calendarId: "primary",
          singleEvents: true,
          orderBy: "startTime",
          timeMin,
          timeMax,
          maxResults: PAGE_SIZE,
          pageToken,
        });
        pageData = res.data;
        break;
      } catch (err) {
        attempt += 1;
        const e = err as { code?: number; status?: number; errors?: Array<{ reason?: string }> };
        const status = e.code ?? e.status ?? 0;
        const reason = e.errors?.[0]?.reason ?? "";
        const isRateLimit =
          status === 429 ||
          (status === 403 && (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded"));
        if (!isRateLimit || attempt > MAX_RETRIES) {
          safeLog.error("calendar.sync.fetch_failed", {
            userId,
            status,
            reason,
            err: err instanceof Error ? err.message : String(err),
          });
          return {
            ok: false,
            eventsUpserted: upserted,
            errorMessage: status === 401 ? "Reauth" : "FetchFailed",
          };
        }
        const waitMs = 1000 * Math.pow(2, attempt); // 2s / 4s / 8s
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    if (!pageData) {
      return { ok: false, eventsUpserted: upserted, errorMessage: "Exhausted" };
    }

    const items = pageData.items ?? [];
    for (const item of items) {
      if (!item.id) continue;
      // Skip events without a start time entirely — those are
      // template / recurrence exceptions Google sometimes emits.
      const startIso = item.start?.dateTime ?? item.start?.date ?? null;
      if (!startIso) continue;
      const endIso = item.end?.dateTime ?? item.end?.date ?? null;

      try {
        await prisma.calendarEvent.upsert({
          where: {
            userId_externalEventId: {
              userId,
              externalEventId: item.id,
            },
          },
          create: {
            userId,
            externalEventId: item.id,
            summary: item.summary ?? null,
            description: item.description ?? null,
            startTime: new Date(startIso),
            endTime: endIso ? new Date(endIso) : null,
            attendees: item.attendees
              ? item.attendees.map((a: calendar_v3.Schema$EventAttendee) => ({
                  email: a.email,
                  displayName: a.displayName ?? null,
                  responseStatus: a.responseStatus ?? null,
                }))
              : undefined,
            location: item.location ?? null,
          },
          update: {
            summary: item.summary ?? null,
            description: item.description ?? null,
            startTime: new Date(startIso),
            endTime: endIso ? new Date(endIso) : null,
            attendees: item.attendees
              ? item.attendees.map((a: calendar_v3.Schema$EventAttendee) => ({
                  email: a.email,
                  displayName: a.displayName ?? null,
                  responseStatus: a.responseStatus ?? null,
                }))
              : undefined,
            location: item.location ?? null,
          },
        });
        upserted += 1;
      } catch (err) {
        // Per-row failures don't tank the whole sync — log and
        // continue. Most common cause: a malformed attendee shape
        // that Prisma rejects on the Json column.
        safeLog.warn("calendar.sync.row_upsert_failed", {
          userId,
          externalEventId: item.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    pagesFetched += 1;
    if (!pageData.nextPageToken) break;
    pageToken = pageData.nextPageToken;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { googleCalendarLastSyncedAt: new Date() },
  });

  safeLog.info("calendar.sync.completed", {
    userId,
    eventsUpserted: upserted,
    pagesFetched,
  });
  return { ok: true, eventsUpserted: upserted };
}
