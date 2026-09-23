/**
 * Search engine ping on publish/unpublish — IndexNow protocol.
 *
 * HISTORY: this module previously used the Google Indexing API, which
 * failed with "Permission denied. Failed to verify the URL ownership"
 * on every call for months (60/60 failures in IndexingLog). Root cause:
 * the Indexing API is officially restricted to JobPosting/BroadcastEvent
 * pages and requires the service account to be a delegated OWNER of the
 * GSC property — regular blog posts are ignored even when it succeeds.
 *
 * IndexNow (Bing, Yandex, Seznam, Naver; Google does not consume it) is
 * the legitimate instant-ping protocol. Google discovery is handled by
 * the sitemap, which GSC re-fetches daily (verified 2026-09-22).
 *
 * Key file: apps/web/public/{INDEXNOW_KEY}.txt must contain the key and
 * be publicly reachable at https://goripple.io/{INDEXNOW_KEY}.txt.
 *
 * Fire-and-forget with retry — never blocks the calling flow.
 * Every call is logged to the IndexingLog table.
 */

// Not a secret: the IndexNow protocol requires this exact value to be
// publicly served at https://goripple.io/{key}.txt as an ownership proof.
const INDEXNOW_KEY = "0b3485c1826f46a391a795f4e3d35833"; // gitleaks:allow
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const HOST = "goripple.io";

interface IndexingResult {
  success: boolean;
  error?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function notify(
  url: string,
  eventType: "URL_UPDATED" | "URL_DELETED"
): Promise<IndexingResult> {
  const backoffMs = [1000, 2000, 4000];
  let lastError = "";
  let attempts = 0;

  for (let i = 0; i < 3; i++) {
    attempts = i + 1;
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
          urlList: [url],
        }),
      });

      // IndexNow: 200/202 = accepted. 4xx = config problem (no retry).
      if (res.ok || res.status === 202) {
        await logIndexing(url, `INDEXNOW_${eventType}`, true, null, attempts);
        return { success: true };
      }

      lastError = `IndexNow HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (i < 2) await sleep(backoffMs[i]);
  }

  await logIndexing(url, `INDEXNOW_${eventType}`, false, lastError, attempts);
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
 * Notify search engines that a URL was published or updated.
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
 * Notify search engines that a URL was removed.
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
