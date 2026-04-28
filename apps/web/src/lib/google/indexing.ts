/**
 * Google Indexing API integration.
 *
 * Notifies Google when blog posts are published or unpublished.
 * Fire-and-forget with retry — never blocks the calling flow.
 * Every call is logged to the IndexingLog table.
 */

import { google } from "googleapis";
import { getGoogleAuthClient } from "./auth";

const SCOPE = "https://www.googleapis.com/auth/indexing";

interface IndexingResult {
  success: boolean;
  error?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify(
  url: string,
  type: "URL_UPDATED" | "URL_DELETED"
): Promise<IndexingResult> {
  const auth = getGoogleAuthClient([SCOPE]);
  if (!auth) {
    return { success: false, error: "No auth client — GA4_SERVICE_ACCOUNT_KEY not set" };
  }

  const backoffMs = [1000, 2000, 4000];
  let lastError = "";
  let attempts = 0;

  for (let i = 0; i < 3; i++) {
    attempts = i + 1;
    try {
      const indexing = google.indexing({ version: "v3", auth });
      await indexing.urlNotifications.publish({
        requestBody: { url, type },
      });

      // Success — log and return
      await logIndexing(url, type, true, null, attempts);
      return { success: true };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      lastError = message;

      // Only retry on 429 or 5xx
      const status =
        (err as { code?: number })?.code ??
        (err as { status?: number })?.status;
      if (status && status < 500 && status !== 429) {
        break;
      }

      if (i < 2) await sleep(backoffMs[i]);
    }
  }

  // All retries exhausted or non-retryable error
  await logIndexing(url, type, false, lastError, attempts);
  return { success: false, error: lastError };
}

async function logIndexing(
  url: string,
  eventType: string,
  success: boolean,
  errorMessage: string | null,
  attemptCount: number
) {
  try {
    const { prisma } = await import("@/lib/prisma");
    await prisma.indexingLog.create({
      data: { url, eventType, success, errorMessage, attemptCount },
    });
  } catch (err) {
    console.error("[indexing] Failed to log to IndexingLog:", err);
  }
}

/**
 * Notify Google that a URL was published or updated.
 * Fire-and-forget — catches all errors internally.
 */
export async function notifyPublish(url: string): Promise<IndexingResult> {
  try {
    return await notify(url, "URL_UPDATED");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[indexing] notifyPublish unexpected error:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Notify Google that a URL was removed.
 * Fire-and-forget — catches all errors internally.
 */
export async function notifyUnpublish(url: string): Promise<IndexingResult> {
  try {
    return await notify(url, "URL_DELETED");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[indexing] notifyUnpublish unexpected error:", msg);
    return { success: false, error: msg };
  }
}
