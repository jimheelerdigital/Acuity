/**
 * GET /api/entries/[id]/audio
 *
 * Returns a short-lived signed URL for the audio file backing this Entry.
 * Implements SECURITY_AUDIT.md §4 / S4 — audio bucket is private, signed
 * on demand per playback request.
 *
 * Authorization model:
 *   - Session required (401 if missing).
 *   - Entry.userId must equal session.user.id (404 if mismatch — we
 *     deliberately do NOT return 403 so the response doesn't confirm
 *     the entry's existence to a stranger).
 *
 * Returns:
 *   200 { url: string, expiresAt: string (ISO) }
 *   on success. Signed URL TTL is 5 minutes; the client should treat
 *   `expiresAt` as the source of truth and refetch when within ~60s
 *   of expiry.
 *
 * Rate limiting:
 *   60 requests / 60s / user, enforced by the in-process limiter
 *   below. NOTE: serverless instances don't share memory; on Vercel
 *   the effective ceiling is per-instance, so a determined attacker
 *   can spread requests across cold starts. This is a stopgap until
 *   SECURITY_AUDIT.md S5 lands a proper Upstash-Redis-based
 *   rate-limit layer for the whole API surface.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";

const STORAGE_BUCKET = "voice-entries";
const SIGNED_URL_TTL_SECONDS = 5 * 60;

// ── Rate limiter (in-process, per-user) ─────────────────────────────────
// STOPGAP — see file header. Each Vercel instance has its own Map; in
// practice the per-user-per-instance limit is closer to 60 * N where N
// is the number of warm instances. Acceptable for legitimate playback
// usage (ceiling well above any reasonable user behavior); not
// acceptable as a security control for sustained abuse. S5 adds the
// real layer.
const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const userRequestTimes = new Map<string, number[]>();

function consumeRateLimit(userId: string, now: number): boolean {
  const window = now - RATE_LIMIT_WINDOW_MS;
  const times = userRequestTimes.get(userId) ?? [];
  // Drop expired entries from the front (window is FIFO ordered by push)
  let i = 0;
  while (i < times.length && times[i] < window) i++;
  const recent = i === 0 ? times : times.slice(i);
  if (recent.length >= RATE_LIMIT_REQUESTS) {
    userRequestTimes.set(userId, recent); // keep the trim
    return false;
  }
  recent.push(now);
  userRequestTimes.set(userId, recent);
  return true;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const userId = session.user.id;

  // ── Rate limit ──────────────────────────────────────────────────────────
  if (!consumeRateLimit(userId, Date.now())) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)) },
      }
    );
  }

  // ── Ownership lookup ────────────────────────────────────────────────────
  const { prisma } = await import("@/lib/prisma");
  const entry = await prisma.entry.findUnique({
    where: { id: params.id },
    select: { id: true, userId: true, audioPath: true, audioUrl: true },
  });

  // 404 (not 403) on every failure mode below — no information leakage.
  if (!entry || entry.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Some legacy sync-path entries store a pre-signed URL on `audioUrl`
  // and have no `audioPath`. Honour those for the deprecation window
  // (the URL itself is already short-lived from Supabase's signing).
  // Going forward, all entries from the async pipeline write `audioPath`
  // and we sign on demand here.
  if (!entry.audioPath) {
    if (entry.audioUrl) {
      return NextResponse.json(
        {
          url: entry.audioUrl,
          // We don't know the legacy URL's true expiry; pass a
          // conservative client-side hint so the polling loop refetches
          // soon and lands on the new code path even for legacy entries
          // (which will then 404 on storage and be cleaned up).
          expiresAt: new Date(Date.now() + 30_000).toISOString(),
          legacy: true,
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Sign on demand ──────────────────────────────────────────────────────
  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(entry.audioPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error(
      `[entries/${params.id}/audio] sign failed for path=${entry.audioPath}:`,
      error
    );
    // 404 (not 500) — don't leak whether the failure was server-side or
    // a missing object.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000);
  return NextResponse.json(
    { url: data.signedUrl, expiresAt: expiresAt.toISOString() },
    {
      status: 200,
      headers: {
        // Don't let any intermediary cache a per-user signed URL.
        "Cache-Control": "private, no-store, max-age=0",
      },
    }
  );
}
