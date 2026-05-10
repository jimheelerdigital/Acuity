/**
 * Apple App Store Server API JWT credential smoke test — CLI form.
 *
 * Run from home network where APPLE_IAP_* env vars are accessible:
 *
 *   cd /Users/jcunningham525/projects/Acuity/apps/web
 *   npx tsx scripts/smoke-iap-credentials.ts
 *
 * Reads APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY
 * from process.env (auto-loads from apps/web/.env.local via dotenv).
 * Signs the same JWT our verify-receipt path uses, then calls Apple's
 * /inApps/v1/notifications/test endpoint on BOTH Production and
 * Sandbox in parallel. Apple's behavior:
 *
 *   - 200 + { testNotificationToken } → JWT valid; Apple ALSO
 *     dispatches a real TEST notification webhook to our configured
 *     /api/iap/notifications URL (verifies inbound JWS validation
 *     end-to-end too).
 *   - 401 → JWT signing/keyId/issuerId mismatch.
 *   - 429 → Apple rate limit (max 1 req/min). Wait 60s, retry.
 *
 * Spec: developer.apple.com/documentation/appstoreserverapi/request_a_test_notification
 *
 * Why this CLI duplicates the /api/iap/credentials-smoke endpoint:
 *   - No auth gate (sign-in cookie / mobile bearer not required).
 *   - No Vercel routing dependency (sidesteps any route-config issue
 *     like the leading-underscore 404 the endpoint hit on first
 *     deploy).
 *   - Reads env from apps/web/.env.local — same source the local
 *     dev server uses, so a "works on CLI but fails on Vercel"
 *     result definitively isolates the issue to the deployed env
 *     vars (vs. credentials being structurally bad).
 *
 * Both tools live alongside each other intentionally: the endpoint
 * is for ongoing operations / credential rotation verification post-
 * launch (admin-gated, in production env); this CLI is for cold-
 * start smoke testing during launch prep.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { importPKCS8, SignJWT } from "jose";

// Load .env.local from apps/web/. The script lives in apps/web/scripts/
// and process.cwd() is wherever the user invoked tsx from — be
// deterministic about the env source.
loadDotenv({ path: resolve(__dirname, "../.env.local") });

// JWT signing logic is INLINED here (rather than imported from
// @/lib/apple-iap) because that module has `import "server-only"` at
// the top, which throws when imported via plain tsx — that import is
// a Next.js sentinel that only resolves correctly in the Next.js
// runtime. Inlining keeps the script self-contained at the cost of a
// few duplicated lines; the duplication is acceptable because (a)
// Apple's JWT contract is fixed and unlikely to change, and (b) the
// CLI exists specifically to bypass the Next.js runtime, so coupling
// it back to a Next-only module defeats the purpose. If the JWT
// claims ever drift, update both this file and apps/web/src/lib/
// apple-iap.ts together — they must produce byte-identical JWTs for
// the smoke result to be a valid signal about production behavior.

type AppleEnvironment = "Production" | "Sandbox";

interface AppleApiJwtConfig {
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
}

function readAppleApiConfig(): AppleApiJwtConfig {
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuerId = process.env.APPLE_IAP_ISSUER_ID;
  const privateKeyPem = process.env.APPLE_IAP_PRIVATE_KEY;
  if (!keyId || !issuerId || !privateKeyPem) {
    throw new Error(
      "Apple IAP env not configured — set APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY"
    );
  }
  return { keyId, issuerId, privateKeyPem };
}

async function signAppStoreConnectJwt(
  config: AppleApiJwtConfig
): Promise<string> {
  const key = await importPKCS8(config.privateKeyPem, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId, typ: "JWT" })
    .setIssuer(config.issuerId)
    .setIssuedAt()
    .setExpirationTime("20m")
    .setAudience("appstoreconnect-v1")
    .sign(key);
}

const APPLE_API_HOST: Record<AppleEnvironment, string> = {
  Production: "api.storekit.itunes.apple.com",
  Sandbox: "api.storekit-sandbox.itunes.apple.com",
};

interface ProbeResult {
  env: AppleEnvironment;
  status: number | null;
  ok: boolean;
  message: string;
  testNotificationToken: string | null;
}

async function probeEnvironment(
  env: AppleEnvironment,
  jwt: string
): Promise<ProbeResult> {
  const url = `https://${APPLE_API_HOST[env]}/inApps/v1/notifications/test`;
  let status: number | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
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
          "401 — JWT signing/keyId/issuerId mismatch. The .p8 key may have been revoked in App Store Connect.",
        testNotificationToken: null,
      };
    }
    if (status === 429) {
      return {
        env,
        status,
        ok: false,
        message:
          "429 — Apple rate limit (max 1 test-notification request per minute). Wait 60s and retry.",
        testNotificationToken: null,
      };
    }
    const text = await res.text().catch(() => "");
    return {
      env,
      status,
      ok: false,
      message: `Unexpected status ${status}. Response (truncated): ${text.slice(0, 200)}`,
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

async function main() {
  console.log("\n[smoke-iap-credentials] Reading APPLE_IAP_* env vars...");

  let config: ReturnType<typeof readAppleApiConfig>;
  try {
    config = readAppleApiConfig();
  } catch (err) {
    console.error("\n❌ Config error:", err instanceof Error ? err.message : err);
    console.error(
      "  Ensure apps/web/.env.local has APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY set."
    );
    process.exit(1);
  }

  console.log(
    `  keyId: ${config.keyId.slice(0, 4)}*** (${config.keyId.length} chars)`
  );
  console.log(
    `  issuerId: ${config.issuerId.slice(0, 8)}*** (${config.issuerId.length} chars)`
  );
  console.log(`  privateKeyPem length: ${config.privateKeyPem.length} chars`);

  console.log("\n[smoke-iap-credentials] Signing JWT...");
  let jwt: string;
  try {
    jwt = await signAppStoreConnectJwt(config);
  } catch (err) {
    console.error(
      "\n❌ JWT signing failed:",
      err instanceof Error ? err.message : err
    );
    console.error(
      "  Common cause: APPLE_IAP_PRIVATE_KEY missing PEM newlines. The .p8 file content must be preserved verbatim with literal newlines (use multi-line env var, NOT a single-line escape)."
    );
    process.exit(1);
  }
  console.log(`  JWT signed (length: ${jwt.length} chars)`);

  console.log("\n[smoke-iap-credentials] Calling Apple in parallel...");
  const [production, sandbox] = await Promise.all([
    probeEnvironment("Production", jwt),
    probeEnvironment("Sandbox", jwt),
  ]);

  console.log("\n=== RESULTS ===\n");
  console.log(
    `Production: ${production.ok ? "✅" : "❌"} status=${production.status} — ${production.message}`
  );
  if (production.testNotificationToken) {
    console.log(
      `  testNotificationToken: ${production.testNotificationToken}`
    );
  }
  console.log(
    `Sandbox:    ${sandbox.ok ? "✅" : "❌"} status=${sandbox.status} — ${sandbox.message}`
  );
  if (sandbox.testNotificationToken) {
    console.log(`  testNotificationToken: ${sandbox.testNotificationToken}`);
  }

  const ok = production.ok && sandbox.ok;
  console.log(
    `\nOverall: ${ok ? "✅ CREDENTIALS VALID — safe to proceed with EAS build" : "❌ CREDENTIALS INVALID — DO NOT EAS BUILD"}\n`
  );

  if (!ok) {
    if (production.status === 401 && sandbox.status === 401) {
      console.log("Both environments returned 401. Steps to recover:");
      console.log(
        "  1. App Store Connect → Users and Access → Keys (In-App Purchase scope)"
      );
      console.log("  2. Revoke the existing .p8, create a new one");
      console.log(
        "  3. Update APPLE_IAP_KEY_ID + APPLE_IAP_PRIVATE_KEY in Vercel env (preserve PEM newlines)"
      );
      console.log("  4. Redeploy");
      console.log("  5. Re-run this smoke test");
    }
    process.exit(2);
  }

  console.log("Side-effect: Apple has dispatched a TEST notification webhook");
  console.log(
    "to our configured /api/iap/notifications URL. Confirm inbound by:"
  );
  console.log(
    "  vercel logs --environment production --since 2m --no-follow --limit 20 -x | grep iap.notifications"
  );
  console.log(
    "(Should show iap.notifications.no-transaction-info — the expected benign log for TEST notifications.)\n"
  );
}

main().catch((err) => {
  console.error("\n💥 Unhandled error:", err);
  process.exit(1);
});
