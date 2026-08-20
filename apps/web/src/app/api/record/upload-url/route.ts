import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { extensionForMimeType, normalizeAudioMimeType } from "@/lib/audio";
import { getAnySessionUserId } from "@/lib/mobile-auth";
import {
  checkRateLimit,
  identifierFromRequest,
  limiters,
  rateLimitedResponse,
} from "@/lib/rate-limit";
import { safeLog } from "@/lib/safe-log";

/**
 * POST /api/record/upload-url
 *
 * Issues a short-lived Supabase signed upload URL so the CLIENT writes audio
 * bytes straight to storage, and our API only ever handles metadata.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 * Vercel caps serverless request bodies at 4.5MB and the limit is not
 * configurable. Posting audio as multipart meant a ~5 minute recording was
 * rejected AT THE EDGE, before any handler ran — an opaque 413 with no
 * server log. Production evidence: the voice-entries bucket topped out at
 * 4.28MB with 112 files at 4.0-4.5MB and nothing above.
 *
 * Direct-to-storage removes the ceiling entirely rather than raising it:
 * bytes never traverse a serverless function. The real limit becomes the
 * bucket's own 25MB, which is deliberately matched to Whisper's hard cap —
 * a larger file could be stored but never transcribed.
 *
 * ── One endpoint, both buckets ───────────────────────────────────────
 * `target` selects between the authenticated main flow and the anonymous
 * onboarding flow. They have genuinely different auth models, so the
 * distinction is enforced here rather than trusted from the client:
 *
 *   "entry" → voice-entries      requires a session; path is {userId}/{id}
 *   "try"   → voice-entries-try  anonymous; path is {sessionToken}.{ext}
 *
 * A single endpoint means the 413 class is fixed once. Converting only
 * /api/record would have left the onboarding path — the north-star flow —
 * still on multipart.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKETS = {
  entry: "voice-entries",
  try: "voice-entries-try",
} as const;

type UploadTarget = keyof typeof BUCKETS;

/** Matches the bucket ceiling, which matches Whisper's hard limit. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ipId = identifierFromRequest(req, "record-upload-url");
  const rl = await checkRateLimit(limiters.tryRecordingByIpMobile, ipId);
  if (!rl.success) return rateLimitedResponse(rl);

  let body: {
    target?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = body.target === "try" ? "try" : "entry";
  const bucket = BUCKETS[target as UploadTarget];

  const rawMime = typeof body.mimeType === "string" ? body.mimeType : "audio/mp4";
  const mimeType = normalizeAudioMimeType(rawMime);
  if (!mimeType) {
    return NextResponse.json(
      { error: `Unsupported audio type: ${rawMime}` },
      { status: 415 }
    );
  }

  // Advisory pre-check. The bucket enforces the real limit server-side, but
  // rejecting here saves the client a doomed upload of a file we'd refuse.
  if (
    typeof body.sizeBytes === "number" &&
    Number.isFinite(body.sizeBytes) &&
    body.sizeBytes > MAX_UPLOAD_BYTES
  ) {
    return NextResponse.json(
      {
        error: "AUDIO_TOO_LARGE",
        message: "That recording is too long to process.",
        maxBytes: MAX_UPLOAD_BYTES,
      },
      { status: 413 }
    );
  }

  const ext = extensionForMimeType(mimeType);

  // ── Path derivation is SERVER-SIDE ──────────────────────────────────
  // The client never chooses where its bytes land. If it did, a caller
  // could request a signed URL for another user's folder and overwrite
  // their audio — the signed URL grants write access to exactly the path
  // we name here.
  let objectPath: string;
  let userId: string | null = null;

  if (target === "entry") {
    userId = await getAnySessionUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Mirrors uploadAudioBytes' convention: {userId}/{entryId}.{ext}. The id
    // is minted here and returned so the metadata POST can reference the
    // same object.
    objectPath = `${userId}/${randomBytes(16).toString("hex")}.${ext}`;
  } else {
    // Anonymous onboarding. Flat path keyed by an unguessable token, exactly
    // as /api/mobile/try-recording names its objects today.
    objectPath = `${randomBytes(32).toString("hex")}.${ext}`;
  }

  const { supabase } = await import("@/lib/supabase.server");
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);

  if (error || !data) {
    safeLog.error("record.upload-url.sign_failed", {
      bucket,
      err: error?.message ?? "no data",
    });
    return NextResponse.json(
      { error: "Could not prepare the upload. Try again." },
      { status: 502 }
    );
  }

  safeLog.info("record.upload-url.issued", { bucket, target, userId });

  return NextResponse.json(
    {
      // `token` + `path` are what supabase-js `uploadToSignedUrl` needs;
      // `signedUrl` is the raw PUT target for clients that upload without
      // the SDK (e.g. expo-file-system's uploadAsync).
      bucket,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      mimeType,
      maxBytes: MAX_UPLOAD_BYTES,
    },
    { status: 201 }
  );
}
