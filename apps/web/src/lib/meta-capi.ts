/**
 * Meta Conversions API (CAPI) — server-side event delivery.
 *
 * Sends conversion events directly to Meta's servers, bypassing ad blockers
 * and browser privacy restrictions. Events are deduplicated with the browser
 * pixel using matching event_id values.
 *
 * Env vars: META_ACCESS_TOKEN, META_PIXEL_ID (both in Vercel).
 */

import { createHash, randomUUID } from "crypto";

const GRAPH_API_VERSION = process.env.META_API_VERSION || "v25.0";

// ─── Hashing ────────────────────────────────────────────────────────

/** SHA256 hash a value for Meta's user data parameters. */
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Normalize and hash an email for Meta matching. */
function hashEmail(email: string): string {
  return sha256(email.toLowerCase().trim());
}

/** Normalize and hash a name part (first or last). */
function hashName(name: string): string {
  return sha256(name.toLowerCase().trim());
}

// ─── Event ID generation ────────────────────────────────────────────

/**
 * Generate a unique event_id for pixel–CAPI deduplication.
 * Format: `{event_name}_{timestamp}_{random}` — deterministic enough
 * for debugging, unique enough for dedup.
 */
export function generateEventId(eventName: string): string {
  return `${eventName}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

// ─── Types ──────────────────────────────────────────────────────────

interface UserData {
  email?: string;
  firstName?: string;
  lastName?: string;
  ip?: string;
  userAgent?: string;
  fbclid?: string;
  /** Facebook browser ID — from _fbp cookie */
  fbp?: string;
  /** Facebook click ID cookie — from _fbc cookie */
  fbc?: string;
}

interface ConversionEvent {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: "website" | "app" | "email" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
  userData: UserData;
  customData?: Record<string, unknown>;
}

// ─── Send to Meta ───────────────────────────────────────────────────

/**
 * Send a conversion event to Meta's Conversions API.
 * Non-throwing — logs errors to console and Sentry but never blocks
 * the calling route's response.
 */
export async function sendConversionEvent(event: ConversionEvent): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    console.warn("[meta-capi] Missing META_PIXEL_ID or META_ACCESS_TOKEN — skipping");
    return;
  }

  // Build user_data with hashed PII
  const userData: Record<string, unknown> = {};
  if (event.userData.email) userData.em = [hashEmail(event.userData.email)];
  if (event.userData.firstName) userData.fn = [hashName(event.userData.firstName)];
  if (event.userData.lastName) userData.ln = [hashName(event.userData.lastName)];
  if (event.userData.ip) userData.client_ip_address = event.userData.ip;
  if (event.userData.userAgent) userData.client_user_agent = event.userData.userAgent;
  if (event.userData.fbclid) userData.fbc = event.userData.fbc || `fb.1.${Date.now()}.${event.userData.fbclid}`;
  else if (event.userData.fbc) userData.fbc = event.userData.fbc;
  if (event.userData.fbp) userData.fbp = event.userData.fbp;

  const payload = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime || Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl,
        action_source: event.actionSource || "website",
        user_data: userData,
        ...(event.customData ? { custom_data: event.customData } : {}),
      },
    ],
  };

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`;

  console.log(`[meta-capi] SENDING ${event.eventName} to pixel ${pixelId} | event_id: ${event.eventId} | user_data keys: ${Object.keys(userData).join(",")}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const responseBody = await res.text();
    if (!res.ok) {
      console.error(`[meta-capi] ${event.eventName} FAILED (${res.status}):`, responseBody);
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureMessage(`Meta CAPI ${event.eventName} failed: ${res.status}`, {
          level: "warning",
          extra: { eventId: event.eventId, status: res.status, body: responseBody },
        });
      } catch {}
    } else {
      console.log(`[meta-capi] ${event.eventName} SUCCESS (${res.status}):`, responseBody);
    }
  } catch (err) {
    console.error(`[meta-capi] ${event.eventName} NETWORK ERROR:`, err);
    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(err, {
        tags: { stage: "meta-capi" },
        extra: { eventName: event.eventName, eventId: event.eventId },
      });
    } catch {}
  }
}

// ─── Convenience helpers ────────────────────────────────────────────

/** Extract client IP from Next.js request headers. */
export function getClientIp(headers: Headers): string | undefined {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    undefined
  );
}

/** Extract fbclid, _fbp, _fbc from cookies string. */
export function extractFbCookies(cookieHeader: string | null): {
  fbclid?: string;
  fbp?: string;
  fbc?: string;
} {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key) cookies[key.trim()] = rest.join("=");
  }
  return {
    fbp: cookies._fbp || undefined,
    fbc: cookies._fbc || undefined,
  };
}
