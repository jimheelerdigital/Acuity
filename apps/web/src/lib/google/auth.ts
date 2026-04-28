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
    const credentials = JSON.parse(raw);
    return new google.auth.JWT(
      credentials.client_email,
      undefined,
      credentials.private_key,
      scopes
    );
  } catch (err) {
    console.error("[google/auth] Failed to parse service account key:", err);
    return null;
  }
}
