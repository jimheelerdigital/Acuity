/**
 * Shared Google service account auth for Search Console + Indexing API.
 *
 * Reads the same GA4_SERVICE_ACCOUNT_KEY env var used by the GA4
 * integration in research.ts. The GA4 SDK (@google-analytics/data)
 * handles its own auth internally, so this helper is only used by
 * the googleapis-based modules (Search Console, Indexing API).
 */

import { google } from "googleapis";

export function getGoogleAuthClient(scopes: string[]) {
  const raw = process.env.GA4_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    console.warn("[google/auth] GA4_SERVICE_ACCOUNT_KEY not set — skipping");
    return null;
  }

  try {
    // Support both raw JSON and base64-encoded JSON (base64 avoids
    // newline corruption when pasting into Vercel env vars).
    let jsonStr = raw.trim();
    if (!jsonStr.startsWith("{")) {
      jsonStr = Buffer.from(jsonStr, "base64").toString("utf-8");
    }

    const credentials = JSON.parse(jsonStr);

    // Vercel may convert literal \n in the private_key to actual newlines,
    // or strip them entirely. Normalise so the PEM is always valid.
    let privateKey: string = credentials.private_key ?? "";
    if (privateKey && !privateKey.includes("\n")) {
      // Re-insert newlines around PEM header/footer and every 64 chars
      privateKey = privateKey
        .replace(/-----BEGIN [A-Z ]+-----/, "$&\n")
        .replace(/-----END [A-Z ]+-----/, "\n$&")
        .replace(/(.{64})(?!-)/g, "$1\n");
    }

    console.log(
      `[google/auth] Using service account: ${credentials.client_email}, ` +
      `key starts with: ${privateKey.slice(0, 30)}...`
    );

    return new google.auth.JWT({
      email: credentials.client_email,
      key: privateKey,
      scopes,
    });
  } catch (err) {
    console.error("[google/auth] Failed to parse service account key:", err);
    return null;
  }
}
