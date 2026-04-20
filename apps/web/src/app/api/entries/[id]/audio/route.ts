/**
 * GET /api/entries/[id]/audio
 *
 * Returns a short-lived signed URL for the audio file backing this Entry.
 * Implements SECURITY_AUDIT.md §4 / S4 — audio bucket is private, signed
 * on demand per playback request.
 *
 * Authorization model:
 *   - Session required (404 if missing — we never disclose the entry's
 *     existence to a stranger).
 *   - Entry.userId must equal session.user.id (404 if mismatch, same
 *     rationale).
 *
 * Returns:
 *   200 { url: string, expiresAt: string (ISO) }
 *   on success. Signed URL TTL is 5 minutes; the client should treat
 *   `expiresAt` as the source of truth and refetch when within ~60s
 *   of expiry.
 *
 * Rate limiting:
 *   60 requests / 60s / userId via Upstash Redis (S5). Fails open when
 *   UPSTASH_REDIS_REST_URL is unset.
 */

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { getAuthOptions } from "@/lib/auth";
import {
  checkRateLimit,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";

const STORAGE_BUCKET = "voice-entries";
const SIGNED_URL_TTL_SECONDS = 5 * 60;

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
  const rl = await checkRateLimit(limiters.audioPlayback, `user:${userId}`);
  if (!rl.success) return rateLimitedResponse(rl);

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
