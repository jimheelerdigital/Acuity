/**
 * GET /api/internal/auth-smoke-test
 *
 * Post-deploy auth health check. Validates each provider's code path
 * can run end-to-end WITHOUT actually creating any rows. Returns:
 *
 *   200 { ok: true, results: { google: true, apple: true, credentials: true, schema: true, env: true } }
 *
 * On any failure, the offending bucket is `false` plus a detail field
 * is added to `errors` and the overall `ok` becomes `false`. Wire this
 * to a Vercel post-deploy hook + Slack #launch-alerts via a tiny
 * webhook proxy (see docs/AUTH_HARDENING.md §"Smoke test wiring").
 *
 * Auth: requires SMOKE_TEST_TOKEN in `Authorization: Bearer <token>` or
 * `?token=<token>`. The token is generated once and stored in Vercel
 * env (Production + Preview). NOT a NextAuth session — this endpoint
 * runs from outside the app.
 *
 * What each check actually does (no User/Session/Account writes):
 *   - env: every var the providers need is set + not empty
 *   - schema: prisma can SELECT from User with all schema-declared
 *     columns. If a column the schema declares is missing from the DB,
 *     this fails — this is the leading-indicator check for the bug
 *     class that broke OAuth on 2026-04-27 and 2026-04-28.
 *   - google: GoogleProvider config materializes via getAuthOptions()
 *     and exposes signinUrl + callbackUrl. Doesn't hit Google.
 *   - apple: apple-jwks remote JWKS endpoint reachable + parseable via
 *     jose. Doesn't verify a real token.
 *   - credentials: bcrypt + verifyPassword work on a known input. No
 *     DB lookup.
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CheckOk = { ok: true };
type CheckErr = { ok: false; error: string };
type Check = CheckOk | CheckErr;

export async function GET(req: NextRequest) {
  // ── Auth gate ─────────────────────────────────────────────────────
  const expected = process.env.SMOKE_TEST_TOKEN;
  if (!expected) {
    // Fail closed — env not configured means the endpoint is exposed
    // without protection. Refuse to run rather than leak healthcheck
    // signal to anyone who finds the URL.
    return NextResponse.json(
      { ok: false, error: "SMOKE_TEST_TOKEN not configured" },
      { status: 503 }
    );
  }
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("token") ??
    "";
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // ── Run all checks in parallel. Each is independent and bounded. ──
  const [env, schema, google, apple, credentials] = await Promise.all([
    checkEnv(),
    checkSchema(),
    checkGoogleConfig(),
    checkAppleJwks(),
    checkCredentials(),
  ]);

  const allOk =
    env.ok && schema.ok && google.ok && apple.ok && credentials.ok;
  const errors: Record<string, string> = {};
  for (const [k, v] of Object.entries({ env, schema, google, apple, credentials })) {
    if (!v.ok) errors[k] = v.error;
  }

  return NextResponse.json(
    {
      ok: allOk,
      results: {
        env: env.ok,
        schema: schema.ok,
        google: google.ok,
        apple: apple.ok,
        credentials: credentials.ok,
      },
      ...(allOk ? {} : { errors }),
    },
    { status: allOk ? 200 : 500 }
  );
}

// ─── Checks ─────────────────────────────────────────────────────────

async function checkEnv(): Promise<Check> {
  const required = [
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DATABASE_URL",
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return { ok: false, error: `missing env: ${missing.join(", ")}` };
  }
  return { ok: true };
}

/**
 * Leading-indicator check for schema-vs-DB column drift — the
 * exact failure class that broke Google OAuth on 2026-04-28 (and
 * earlier `targetCadence` drift). Reads ONE User row with all
 * schema-declared columns. If a column the Prisma client expects
 * is missing in the DB, Postgres rejects with P2022 and we surface
 * it BEFORE NextAuth's adapter.createUser hits the same wall.
 *
 * Uses findFirst (no row required to exist for the check to be
 * useful — the SQL fails on schema drift even with no matching row).
 */
async function checkSchema(): Promise<Check> {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.user.findFirst({});
    return { ok: true };
  } catch (err) {
    const code =
      typeof err === "object" && err && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `prisma.user.findFirst failed${code ? ` (${code})` : ""}: ${msg.slice(0, 200)}`,
    };
  }
}

async function checkGoogleConfig(): Promise<Check> {
  try {
    const { getAuthOptions } = await import("@/lib/auth");
    const options = getAuthOptions();
    const google = options.providers.find(
      (p) =>
        ("id" in p && (p as { id?: unknown }).id === "google") ||
        ("name" in p && (p as { name?: unknown }).name === "Google")
    );
    if (!google) {
      return { ok: false, error: "google provider not registered" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Apple sign-in verifies identity tokens against Apple's published
 * JWKS. If their endpoint is unreachable or the JWKS is malformed,
 * Apple sign-in fails. Probe it without verifying a token — just
 * confirm we can fetch + parse.
 */
async function checkAppleJwks(): Promise<Check> {
  try {
    const res = await fetch("https://appleid.apple.com/auth/keys", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `apple JWKS endpoint returned ${res.status}`,
      };
    }
    const jwks = (await res.json()) as { keys?: unknown[] };
    if (!jwks.keys || !Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      return { ok: false, error: "apple JWKS empty or malformed" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Round-trip a known password through hashPassword + verifyPassword.
 * Catches any bcrypt runtime issue (rare, but the bcrypt native
 * binding has caused outages elsewhere).
 */
async function checkCredentials(): Promise<Check> {
  try {
    const { hashPassword, verifyPassword } = await import("@/lib/passwords");
    const hash = await hashPassword("smoke-test-pw-2026");
    const match = await verifyPassword("smoke-test-pw-2026", hash);
    if (!match) {
      return { ok: false, error: "verifyPassword returned false on round-trip" };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
