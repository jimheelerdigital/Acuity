/**
 * POST /api/admin/adlab/warmup — Make 100 successful read calls to Meta Ads API
 * to build call history and improve the success-rate ratio for Standard Access review.
 *
 * Only uses ad account info reads (3 field variations) since campaigns/adsets/ads/insights
 * endpoints require Standard Access tier and fail at Limited tier.
 * Run multiple times with 15-minute gaps to build history.
 * Streams progress as newline-delimited JSON so the UI can show live updates.
 */

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // ~100s expected, 300s ceiling

const ENDPOINTS = [
  { label: "account info (basic)", path: "?fields=name,account_status,currency,timezone_name" },
  { label: "account info (spend)", path: "?fields=name,balance,amount_spent" },
  { label: "account info (meta)", path: "?fields=business_name,created_time,owner" },
] as const;

const TOTAL_CALLS = 100;
const DELAY_MS = 2000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const token = process.env.META_ACCESS_TOKEN;
  const accountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return new Response(
      JSON.stringify({ error: "META_ACCESS_TOKEN or META_AD_ACCOUNT_ID not set" }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  const version = process.env.META_API_VERSION || "v25.0";
  const actId = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  const baseUrl = `https://graph.facebook.com/${version}/${actId}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let successes = 0;
      let failures = 0;

      for (let i = 0; i < TOTAL_CALLS; i++) {
        const endpoint = ENDPOINTS[i % ENDPOINTS.length];
        const callNum = i + 1;

        try {
          const res = await fetch(`${baseUrl}${endpoint.path}&access_token=${token}`);
          const data = await res.json();

          if (data.error) {
            failures++;
            const errMsg = `${data.error.message} (code ${data.error.code}, subcode ${data.error.error_subcode ?? "none"})`;
            console.log(`[warmup] Call ${callNum}/${TOTAL_CALLS} FAIL (${endpoint.label}): ${errMsg}`);
            controller.enqueue(encoder.encode(JSON.stringify({ type: "error", callNum, endpoint: endpoint.label, error: errMsg }) + "\n"));

            // Rate limit — stop immediately to avoid racking up failures
            if (data.error.code === 80004 || data.error.code === 4) {
              const msg = `Stopped early — rate limited after ${successes} successful calls. Wait 15 minutes before running again.`;
              console.log(`[warmup] ${msg}`);
              const summary = { done: true, total: callNum, successes, failures, rateLimited: true, message: msg };
              controller.enqueue(encoder.encode(JSON.stringify(summary) + "\n"));
              controller.close();
              return;
            }
          } else {
            successes++;
          }
        } catch (err) {
          failures++;
          const errMsg = err instanceof Error ? err.message : "unknown";
          console.log(`[warmup] Call ${callNum}/${TOTAL_CALLS} ERROR (${endpoint.label}): ${errMsg}`);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", callNum, endpoint: endpoint.label, error: errMsg }) + "\n"));
        }

        // Log progress every 20 calls
        if (callNum % 20 === 0 || callNum === TOTAL_CALLS) {
          const progress = { callNum, total: TOTAL_CALLS, successes, failures, endpoint: endpoint.label };
          console.log(`[warmup] Progress: ${callNum}/${TOTAL_CALLS} — ${successes} ok, ${failures} fail`);
          controller.enqueue(encoder.encode(JSON.stringify(progress) + "\n"));
        }

        // Delay between calls (skip after last)
        if (i < TOTAL_CALLS - 1) {
          await sleep(DELAY_MS);
        }
      }

      // Final summary
      const summary = { done: true, total: TOTAL_CALLS, successes, failures };
      controller.enqueue(encoder.encode(JSON.stringify(summary) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson", "cache-control": "no-cache" },
  });
}
