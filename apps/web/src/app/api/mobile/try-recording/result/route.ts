/**
 * POST /api/mobile/try-recording/result
 *
 * Collect the result of a first (anonymous) debrief whose analysis request
 * the PHONE lost (2026-10-20, Keenan: 29% of people who finish the first
 * recording never see results).
 *
 * /api/mobile/try-recording does the whole analysis inside one request
 * (~15-50s). When someone leaves the app, iOS suspends it and the request
 * dies on the phone, but the function keeps running and saves the
 * TrySession anyway (prod 2026-10-20: three TrySessions created with no
 * result ever shown). The app keeps the upload's storagePath and asks here.
 *
 * Body: { storagePath, anonDeviceId }  — both must match the TrySession.
 * The storagePath is an unguessable object name minted for this upload and
 * the anonDeviceId is the install's random UUID; together they are what
 * the original caller already held, so this reveals nothing new.
 *
 * 200 { sessionToken, extraction, expiresAt }  — same shape as the
 *     original route's success, so the app stores it identically.
 * 202 { status: "pending" }  — not saved (yet).
 * 410 { status: "failed" }   — no result and the audio is gone: the
 *     analysis failed (the route deletes the audio on every failure), so
 *     nothing is coming. The app stops waiting.
 */

import { NextRequest, NextResponse } from "next/server";

import { findTryResult, readTryJobBody } from "@/lib/try-result";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const job = await readTryJobBody(req);
  if (!job) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const r = await findTryResult(job);
  if (r.status === "ready") {
    return NextResponse.json(
      { sessionToken: r.sessionToken, extraction: r.extraction, expiresAt: r.expiresAt },
      { status: 200 }
    );
  }
  if (r.status === "failed") return NextResponse.json({ status: "failed" }, { status: 410 });
  return NextResponse.json({ status: "pending" }, { status: 202 });
}
