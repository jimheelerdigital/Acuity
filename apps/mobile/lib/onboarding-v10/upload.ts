import { submitTryRecording } from "@/lib/try-session";

/**
 * v10 debrief upload — deliberately isolated behind ONE function.
 *
 * Direct-to-storage since 2026-08-20. `submitTryRecording` now asks the API
 * for a signed URL, PUTs the audio straight into `voice-entries-try`, and
 * POSTs metadata only. Audio never traverses a serverless function, so
 * Vercel's non-configurable 4.5MB request-body cap — which used to reject
 * full-length debriefs at the edge with an opaque 413 — no longer applies.
 *
 * That the swap needed no change in the v10 screens is what the seam was
 * for: Screens 3-5 hand a URI to this function and know nothing about how
 * the bytes reach the server.
 */

// The recording cap lives in ./limits (dependency-free so it can be
// asserted by a test). Re-exported here because this is the module whose
// upload mechanism used to constrain it.
export { V10_MAX_RECORDING_MS } from "./limits";


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
    await submitTryRecording(uri, "audio/mp4");
    return { ok: true, retryable: false };
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    const message = err instanceof Error ? err.message : String(err);

    // 413 now means the recording is past Whisper's 25MB ceiling, not that
    // it tripped a platform body limit. Either way the same file can never
    // succeed, so don't offer a retry that is guaranteed to fail.
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
