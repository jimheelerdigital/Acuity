/**
 * Generates APPLE_CLIENT_SECRET for web "Sign in with Apple" (NextAuth's
 * Apple provider on goripple.io).
 *
 * Apple doesn't issue a static secret. It's a JWT signed with a Sign in with
 * Apple key (.p8), valid for at most 6 months. When it expires, web Apple
 * sign-in quietly stops working, so put a calendar reminder at the printed
 * expiry date.
 *
 * Needs, from developer.apple.com → Certificates, Identifiers & Profiles:
 *   - Team ID (top right of the portal)
 *   - Services ID used for web sign-in (this is APPLE_CLIENT_ID, e.g.
 *     com.heelerdigital.acuity.web). Its "Sign in with Apple" config must list
 *     domain goripple.io and return URL
 *     https://goripple.io/api/auth/callback/apple
 *   - A key with "Sign in with Apple" enabled: its Key ID and the .p8 file
 *
 * Usage (prints the secret; nothing is written or sent anywhere):
 *   npx tsx scripts/generate-apple-client-secret.ts \
 *     --team TEAMID --key KEYID --client com.example.web --p8 ~/Downloads/AuthKey_KEYID.p8
 *
 * Then in Vercel (Production): APPLE_CLIENT_ID = the Services ID,
 * APPLE_CLIENT_SECRET = the printed JWT, and redeploy. The funnel's Apple
 * button appears once https://goripple.io/api/auth/providers lists "apple".
 */
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) {
    console.error(`Missing --${name}. See the usage notes at the top of this file.`);
    process.exit(1);
  }
  return v;
}

const teamId = arg("team");
const keyId = arg("key");
const clientId = arg("client");
const p8Path = arg("p8").replace(/^~(?=\/)/, process.env.HOME ?? "~");

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const now = Math.floor(Date.now() / 1000);
const exp = now + 180 * 24 * 60 * 60 - 60; // Apple's max is 6 months (15777000s)

const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
const payload = b64url(
  JSON.stringify({ iss: teamId, iat: now, exp, aud: "https://appleid.apple.com", sub: clientId }),
);
const key = createPrivateKey(readFileSync(p8Path, "utf8"));
// ES256 JWTs need the raw r||s signature, not DER.
const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });

console.log(`${header}.${payload}.${b64url(signature)}`);
console.error(`\nExpires ${new Date(exp * 1000).toISOString().slice(0, 10)}. Regenerate before then.`);
