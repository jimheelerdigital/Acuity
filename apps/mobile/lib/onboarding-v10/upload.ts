import { submitTryRecording } from "@/lib/try-session";

/**
 * v10 debrief upload — deliberately isolated behind ONE function.
 *
 * ⚠️ THIS IS THE SWAP POINT FOR THE 413 FIX.
 *
 * Today this posts multipart audio to /api/mobile/try-recording. That path
 * is being replaced by direct-to-storage (client → Supabase signed URL →
 * metadata-only POST) because full-length recordings exceed Vercel's 4.5MB
 * serverless body cap.
 *
 * ── State of that bug, measured 2026-08-20 ───────────────────────────
 *   MAX_AUDIO_BYTES  25MB   app-level cap (Whisper's limit)
 *   Vercel body cap  4.5MB  platform, rejects BEFORE the handler runs
 *   main recorder    300s ≈ 4.8MB AAC → over the cap
 *   v10 recording    120s ≈ 1.9MB AAC → under it
 *
 * So the app's own 25MB guard can never fire — the platform kills the
 * request first, which is why the 413 shows up as an opaque failure rather
 * than the handler's own tidy 413 at try-recording/route.ts:94.
 *
 * v10 is NOT currently exposed, because Screen 3 caps at 120s. It becomes
 * exposed the moment that cap is raised.
 *
 * ── Two things the 413 branch needs to know ──────────────────────────
 * 1. NO SIGNED-URL ENDPOINT EXISTS on this branch. Nothing matches
 *    createSignedUploadUrl / signedUploadUrl / storagePath anywhere in
 *    apps/web or apps/mobile.
 * 2. v10 does NOT use /api/record. The anonymous onboarding path is
 *    /api/mobile/try-recording, writing to a DIFFERENT bucket
 *    (`voice-entries-try`, not `voice-entries`). A 413 fix that only
 *    converts /api/record leaves this path — the north-star path, first
 *    debrief per fresh install — still on multipart.
 *
 * When the signed-URL flow lands, replace the body of `uploadDebrief` and
 * nothing else in the v10 screens changes.
 */

export interface UploadResult {
  ok: boolean;
  /** True when the failure is worth offering a retry for. */
  retryable: boolean;
  error?: string;
}

/**
 * Upload a recorded debrief for anonymous (pre-account) processing.
 *
 * The audio URI is passed in rather than the bytes, so a failure can be
 * retried WITHOUT re-recording — spec §4 requires that, and it is why
 * Screen 3 hands the URI to Screen 4 instead of uploading itself.
 */
export async function uploadDebrief(uri: string): Promise<UploadResult> {
  try {
    // ── SWAP POINT ──────────────────────────────────────────────────
    // Replace with: request signed URL → PUT audio directly to
    // `voice-entries-try` → POST { storagePath, durationSeconds } metadata.
    await submitTryRecording(uri, "audio/mp4");
    return { ok: true, retryable: false };
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);

    // 413 means the audio never reached the handler. Retrying the same file
    // cannot succeed, so don't offer a retry that is guaranteed to fail.
    if (status === 413) {
      return {
        ok: false,
        retryable: false,
        error: "That debrief was too long to send. A shorter one will work.",
      };
    }

    // Everything else (network blip, 5xx, timeout) is worth another attempt
    // with the SAME audio.
    return { ok: false, retryable: true, error: message };
  }
}
