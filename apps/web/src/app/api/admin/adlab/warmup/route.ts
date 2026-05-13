/**
 * POST /api/admin/adlab/warmup — Make 200 successful read calls to Meta Ads API
 * to build call history and improve the success-rate ratio for Standard Access review.
 *
 * Rotates through 5 read endpoints, 40 calls each, with 500ms delay between calls.
 * Streams progress as newline-delimited JSON so the UI can show live updates.
 */

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // ~100s expected, 300s ceiling

const ENDPOINTS = [
  { label: "account info", path: "?fields=name,account_status,currency,timezone_name" },
  { label: "campaigns", path: "/campaigns?fields=name,status&limit=5" },
  { label: "adsets", path: "/adsets?fields=name,status&limit=5" },
  { label: "ads", path: "/ads?fields=name,status&limit=5" },
  { label: "insights", path: "/insights?fields=impressions,clicks,spend&date_preset=last_30d" },
] as const;

const CALLS_PER_ENDPOINT = 40;
const TOTAL_CALLS = ENDPOINTS.length * CALLS_PER_ENDPOINT;
const DELAY_MS = 500;

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
            console.log(`[warmup] Call ${callNum}/${TOTAL_CALLS} FAIL (${endpoint.label}): ${data.error.message}`);
          } else {
            successes++;
          }
        } catch (err) {
          failures++;
          console.log(`[warmup] Call ${callNum}/${TOTAL_CALLS} ERROR (${endpoint.label}): ${err instanceof Error ? err.message : "unknown"}`);
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
