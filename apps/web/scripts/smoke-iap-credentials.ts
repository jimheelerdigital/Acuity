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
import { importPKCS8, SignJWT, decodeJwt, decodeProtectedHeader } from "jose";

// Bundle ID is REQUIRED in App Store Server API JWT payload as the
// `bid` claim. App Store Connect API (apps/users/builds management)
// does NOT need bid — only App Store Server API does. Missing-bid
// produces 401 from Apple with a generic "signing mismatch" message
// indistinguishable from a genuinely bad .p8 — which is exactly what
// our 2026-05-10 production logs showed. Apple's spec is at
// developer.apple.com/documentation/appstoreserverapi/generating_json_web_tokens_for_api_requests
const APP_BUNDLE_ID = "com.heelerdigital.acuity";

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
  return new SignJWT({ bid: APP_BUNDLE_ID })
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
  // Show truncated bearer so the user can verify it's the JWT they
  // expect without leaking the full signed token to logs/screenshots.
  // The header (alg/kid) + payload (iss/iat/exp/aud/bid) are already
  // logged separately above — those carry the diagnostic info. The
  // signature portion is what we redact.
  const jwtPreview = `${jwt.slice(0, 24)}...${jwt.slice(-12)} (length=${jwt.length})`;
  console.log(`\n[${env}] POST ${url}`);
  console.log(`[${env}] Authorization: Bearer ${jwtPreview}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Length": "0",
      },
    });
    status = res.status;
    const responseText = await res.text().catch(() => "");
    console.log(`[${env}] HTTP ${status}`);
    console.log(`[${env}] Response body: ${responseText || "<empty>"}`);
    if (status === 200) {
      let token: string | null = null;
      try {
        const body = JSON.parse(responseText) as {
          testNotificationToken?: unknown;
        };
        token =
          typeof body.testNotificationToken === "string"
            ? body.testNotificationToken
            : null;
      } catch {
        // 200 with non-JSON body shouldn't happen; surface it via the
        // already-logged responseText.
      }
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
          "401 — Apple rejected the JWT. See response body above for Apple's error code. Common causes: missing `bid` claim, kid mismatch, issuer mismatch, .p8 revoked, key propagation lag (5-15min after key creation).",
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
    return {
      env,
      status,
      ok: false,
      message: `Unexpected status ${status}. See response body above.`,
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

  console.log(`  bundleId (bid claim): ${APP_BUNDLE_ID}`);

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

  // Decode-and-print so the user can verify the exact claims Apple
  // will see. jose's decodeJwt/decodeProtectedHeader don't verify the
  // signature — pure parsing only. Safe: no secret material is
  // exposed (the .p8 isn't in the JWT — only its derived public-key-
  // verifiable signature is, and that's truncated above).
  const header = decodeProtectedHeader(jwt);
  const payload = decodeJwt(jwt);
  const nowSec = Math.floor(Date.now() / 1000);
  console.log("\n[smoke-iap-credentials] Decoded JWT header:");
  console.log(`  ${JSON.stringify(header, null, 2)}`);
  console.log("[smoke-iap-credentials] Decoded JWT payload:");
  console.log(`  ${JSON.stringify(payload, null, 2)}`);
  console.log(
    `[smoke-iap-credentials] Clock check: nowSec=${nowSec} | iat=${payload.iat} (delta=${(payload.iat ?? 0) - nowSec}s) | exp=${payload.exp} (in ${(payload.exp ?? 0) - nowSec}s)`
  );
  console.log("[smoke-iap-credentials] Apple required claims for App Store Server API:");
  console.log("  header.alg = 'ES256'    →", header.alg === "ES256" ? "✓" : `✗ got ${String(header.alg)}`);
  console.log("  header.kid present      →", header.kid ? "✓" : "✗ missing");
  console.log("  header.typ = 'JWT'      →", header.typ === "JWT" ? "✓" : `✗ got ${String(header.typ)}`);
  console.log("  payload.iss present     →", payload.iss ? "✓" : "✗ missing");
  console.log("  payload.iat present     →", payload.iat ? "✓" : "✗ missing");
  console.log("  payload.exp ≤ iat+60min →", payload.iat && payload.exp && payload.exp - payload.iat <= 3600 ? "✓" : "✗ FAILS");
  console.log("  payload.aud = 'appstoreconnect-v1' →", payload.aud === "appstoreconnect-v1" ? "✓" : `✗ got ${String(payload.aud)}`);
  console.log("  payload.bid present     →", typeof payload.bid === "string" ? `✓ (${payload.bid})` : "✗ MISSING — App Store Server API requires this");

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
