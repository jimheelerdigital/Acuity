/**
 * POST /api/mobile/try-recording/notify
 *
 * "Your list is ready" push for someone who leaves the app while their
 * first debrief is being analysed (2026-10-20, Keenan: "if they close the
 * app, send 'your list is ready' when it finishes").
 *
 * The person has no account yet, so there is no User.pushToken to use. The
 * app calls this the moment it goes to the background with an analysis in
 * flight and notification permission granted, sending the push token with
 * the job. This function then waits for the result and sends the push.
 * The phone is suspended a few seconds later and drops the connection;
 * the function keeps running (the same behaviour the analysis route relies
 * on, seen in prod as TrySessions saved after the phone gave up).
 *
 * Body: { storagePath, anonDeviceId, pushToken }
 *
 * Abuse limits: the job must be a real upload of that device (the object
 * exists, or its TrySession does), the token must be an Expo push token,
 * and the wait is bounded. At most one push per call, only once the
 * result exists. No user data is in the push.
 */

import { NextRequest, NextResponse } from "next/server";

import { checkRateLimit, identifierFromRequest, limiters, rateLimitedResponse } from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";
import { findTryResult, isExpoPushToken, readTryJobBody, waitThenPush } from "@/lib/try-result";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The analysis route can run up to 120s; wait a little longer than that.
export const maxDuration = 150;

export async function POST(req: NextRequest) {
  const ipRl = await checkRateLimit(limiters.tryRecordingByIpMobile, identifierFromRequest(req, "mobile-try-notify"));
  if (!ipRl.success) return rateLimitedResponse(ipRl);

  const job = await readTryJobBody(req);
  if (!job || !isExpoPushToken(job.raw.pushToken)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const pushToken = job.raw.pushToken;

  // Must be a live job of this device before we hold a function open.
  const first = await findTryResult(job);
  if (first.status === "failed") return NextResponse.json({ status: "failed" }, { status: 410 });

  const outcome = await waitThenPush(job, pushToken, { budgetMs: 140_000 });
  safeLog.info("mobile.try-notify.done", { outcome });
  return NextResponse.json({ status: outcome }, { status: 200 });
}
