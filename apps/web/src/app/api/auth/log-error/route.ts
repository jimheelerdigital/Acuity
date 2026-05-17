import { NextResponse } from "next/server";

/**
 * POST /api/auth/log-error
 * Receives auth error telemetry from the /auth/error page.
 * Logs to stdout (visible in Vercel function logs) for debugging.
 * No auth required — this is a fire-and-forget diagnostic beacon.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { error, timestamp, referrer, userAgent } = body;

    // Log to stdout — visible in Vercel Logs and Sentry breadcrumbs
    console.warn("[auth-error-page]", JSON.stringify({
      error: error ?? "Unknown",
      timestamp: timestamp ?? new Date().toISOString(),
      referrer: referrer ?? null,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 200) : null,
    }));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
