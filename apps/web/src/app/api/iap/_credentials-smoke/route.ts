/**
 * POST /api/iap/_credentials-smoke
 *
 * Apple App Store Server API JWT credential validator. Built 2026-05-10
 * to gate EAS build 36 — we needed a way to definitively confirm
 * APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY are
 * valid in production env BEFORE burning another build credit.
 *
 * Mechanism: signs the same JWT our verify-receipt path uses, then
 * calls Apple's `POST /inApps/v1/notifications/test` endpoint on
 * BOTH Production and Sandbox environments. That endpoint is
 * specifically designed for this — it returns:
 *   - 200 + { testNotificationToken } if the JWT signature, keyId,
 *     and issuerId are all correct
 *   - 401 if any of those credential pieces is wrong
 *   - Doesn't require any real transaction or product to exist —
 *     pure JWT validation
 *
 * Side effect: a successful 200 ALSO triggers Apple to dispatch a
 * notification of type "TEST" to our configured webhook URL
 * (/api/iap/notifications). Confirms the inbound JWS validation
 * path works too — belt-and-suspenders both directions.
 *
 * Spec: developer.apple.com/documentation/appstoreserverapi/request_a_test_notification
 *
 * Auth: admin-only. The endpoint reveals the validity of Apple
 * credentials and triggers Apple side-effects (test notification
 * webhooks). Not user-facing — operations / debugging only.
 *
 * Apple rate limit: max 1 request per minute. Acceptable for an
 * on-demand smoke test.
 *
 * Safe to keep in production long-term — useful for ongoing
 * credential rotation verification (regenerate keys in App Store
 * Connect → Users and Access → Keys → re-deploy → hit smoke test
 * → confirm both env still 200).
 */

import { NextRequest, NextResponse } from "next/server";

import {
  readAppleApiConfig,
  signAppStoreConnectJwt,
  type AppleEnvironment,
} from "@/lib/apple-iap";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import { safeLog } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APPLE_API_HOST: Record<AppleEnvironment, string> = {
  Production: "api.storekit.itunes.apple.com",
  Sandbox: "api.storekit-sandbox.itunes.apple.com",
};

interface EnvProbeResult {
  env: AppleEnvironment;
  status: number | null;
  ok: boolean;
  message: string;
  testNotificationToken: string | null;
}

async function probeEnvironment(
  env: AppleEnvironment,
  jwt: string
): Promise<EnvProbeResult> {
  const url = `https://${APPLE_API_HOST[env]}/inApps/v1/notifications/test`;
  let status: number | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        // Apple's API expects no body for this endpoint; explicit
        // empty Content-Length keeps it predictable across runtimes.
        "Content-Length": "0",
      },
    });
    status = res.status;
    if (status === 200) {
      const body = (await res.json().catch(() => null)) as {
        testNotificationToken?: unknown;
      } | null;
      const token =
        body && typeof body.testNotificationToken === "string"
          ? body.testNotificationToken
          : null;
      return {
        env,
        status,
        ok: true,
        message: "JWT credentials valid; test notification dispatched.",
        testNotificationToken: token,
      };
    }
    if (status === 401) {
      return {
        env,
        status,
        ok: false,
        message:
          "401 — JWT signing/keyId/issuerId mismatch. Recheck APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY in Vercel env. The .p8 key may have been revoked in App Store Connect.",
        testNotificationToken: null,
      };
    }
    if (status === 429) {
      return {
        env,
        status,
        ok: false,
        message:
          "429 — Apple rate limit hit (max 1 test-notification request per minute). Wait 60s and retry.",
        testNotificationToken: null,
      };
    }
    // Any other status — surface the code as-is. 5xx means Apple's
    // service had a hiccup; not a credentials issue.
    const text = await res.text().catch(() => "");
    return {
      env,
      status,
      ok: false,
      message: `Unexpected status ${status}. Response body (truncated): ${text.slice(0, 200)}`,
      testNotificationToken: null,
    };
  } catch (err) {
    return {
      env,
      status,
      ok: false,
      message: `Network error reaching ${env}: ${err instanceof Error ? err.message : String(err)}`,
      testNotificationToken: null,
    };
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin gate. The smoke endpoint reveals credential validity +
  // triggers Apple side-effects; keep it operations-only.
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, email: true },
  });
  if (!user?.isAdmin) {
    safeLog.warn("iap.credentials-smoke.forbidden", { userId });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let config: ReturnType<typeof readAppleApiConfig>;
  try {
    config = readAppleApiConfig();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        configError: true,
        message:
          err instanceof Error
            ? err.message
            : "APPLE_IAP_* env vars not configured",
      },
      { status: 503 }
    );
  }

  let jwt: string;
  try {
    jwt = await signAppStoreConnectJwt(config);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        signError: true,
        message:
          err instanceof Error
            ? err.message
            : "JWT signing failed — check APPLE_IAP_PRIVATE_KEY format (must be PEM with newlines)",
      },
      { status: 500 }
    );
  }

  const [production, sandbox] = await Promise.all([
    probeEnvironment("Production", jwt),
    probeEnvironment("Sandbox", jwt),
  ]);

  const ok = production.ok && sandbox.ok;

  safeLog.info("iap.credentials-smoke.result", {
    userId,
    ok,
    productionStatus: production.status,
    sandboxStatus: sandbox.status,
    keyIdPreview: config.keyId.slice(0, 4) + "***",
    issuerIdPreview: config.issuerId.slice(0, 8) + "***",
  });

  return NextResponse.json({
    ok,
    production: {
      status: production.status,
      ok: production.ok,
      message: production.message,
      testNotificationToken: production.testNotificationToken,
    },
    sandbox: {
      status: sandbox.status,
      ok: sandbox.ok,
      message: sandbox.message,
      testNotificationToken: sandbox.testNotificationToken,
    },
    credentialsPreview: {
      keyId: config.keyId.slice(0, 4) + "***",
      issuerId: config.issuerId.slice(0, 8) + "***",
      privateKeyPemLength: config.privateKeyPem.length,
    },
    interpretation: ok
      ? "Both Apple environments accepted our JWT. Credentials are valid; safe to proceed with EAS build."
      : production.status === 401 && sandbox.status === 401
        ? "BOTH environments returned 401 — credentials are genuinely invalid. Regenerate the .p8 in App Store Connect → Users and Access → Keys, update APPLE_IAP_PRIVATE_KEY in Vercel env (preserving newlines), redeploy, retry."
        : "Mixed result — see per-environment messages above. May indicate transient Apple API issue (5xx) or per-environment credential quirk.",
  });
}
