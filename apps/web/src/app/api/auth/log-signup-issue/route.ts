import { NextResponse } from "next/server";

/**
 * POST /api/auth/log-signup-issue
 * Receives signup failure telemetry from the funnel's CreateAccountScreen.
 * Logs to stdout (visible in Vercel function logs) for debugging.
 * No auth required — fire-and-forget diagnostic beacon.
 * NEVER logs passwords or tokens.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { reason, email } = body;

    // Redact email to first 3 chars + domain for privacy
    const redacted = typeof email === "string" && email.includes("@")
      ? email.slice(0, 3) + "***@" + email.split("@")[1]
      : "unknown";

    console.warn("[SIGNUP_FAIL]", JSON.stringify({
      reason: typeof reason === "string" ? reason.slice(0, 100) : "unknown",
      email: redacted,
      timestamp: new Date().toISOString(),
    }));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
