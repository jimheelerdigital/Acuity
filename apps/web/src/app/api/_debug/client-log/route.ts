/**
 * POST /api/_debug/client-log
 *
 * Mobile diagnostic-instrumentation sink (2026-05-07). Build 30 fix
 * for the SecureStore-race didn't land it; we've burned three EAS
 * builds on hypothesis-driven fixes that didn't match the real
 * mechanism. This endpoint exists to capture the actual timeline
 * of events on Jim's device — every interesting auth call site
 * fire-and-forgets a POST here with `{ event, timestamp, payload }`,
 * which we surface to Vercel logs as `client.<event>` with the
 * mobile session id in the payload. We then filter Vercel logs by
 * sessionId to reconstruct exactly what the device did, instead of
 * speculating from server-side 401s.
 *
 * SECURITY:
 *   - No auth required by design — the mobile client is sending
 *     pre-auth events (sign-in attempts, token presence checks).
 *     Adding auth would defeat the purpose.
 *   - Body size capped at 8 KB to prevent log bloat / DoS via giant
 *     payloads. A typical event is ~200-500 bytes.
 *   - safeLog redacts known-sensitive fields (email, name,
 *     transcript, audioPath/Url, phoneNumber) before emit. Mobile
 *     callers should not include token contents — only lengths and
 *     presence flags. Server-side redaction is defense-in-depth.
 *   - Endpoint should be REMOVED or gated once we have the
 *     diagnosis. Leaving an open log-injection sink in production
 *     long-term is unwise; mark with TODO so it's findable.
 *
 * TODO(2026-05-07): remove this endpoint after Jim reports a
 * working build OR add a build-version gate so only the
 * instrumented build can hit it.
 */

import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;

export async function POST(req: NextRequest) {
  // Cap body size before parsing to prevent log-injection bloat.
  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Body too large" },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "Body must be an object" },
      { status: 400 }
    );
  }

  const { event, timestamp, payload } = body as {
    event?: unknown;
    timestamp?: unknown;
    payload?: unknown;
  };

  if (typeof event !== "string" || event.length === 0 || event.length > 64) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid event" },
      { status: 400 }
    );
  }

  const eventName = `client.${event}`;
  const ts =
    typeof timestamp === "string" ? timestamp : new Date().toISOString();
  const data: Record<string, unknown> =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : {};
  data.clientTimestamp = ts;

  safeLog.info(eventName, data);

  return NextResponse.json({ ok: true });
}
