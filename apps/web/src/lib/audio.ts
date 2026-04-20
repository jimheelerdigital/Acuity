import type { Entry } from "@prisma/client";

const STORAGE_BUCKET = "voice-entries";

/**
 * Resolve the audio reference on an Entry. Prefers the new `audioPath`
 * (Supabase Storage object path; sign on demand). Falls back to the
 * legacy `audioUrl` (pre-signed URL from the sync pipeline, 1-hour TTL).
 *
 * Returns `null` when neither is populated (e.g. an upload-failed entry).
 *
 * Usage notes:
 * - Server callers that need a playable URL must sign `audioPath` on
 *   demand — don't hand the raw path back to clients.
 * - Clients can treat `audioUrl` as directly playable (legacy) and
 *   `audioPath` as a "fetch a signed URL first" token.
 */
export function getEntryAudioPath(
  entry: Pick<Entry, "audioPath" | "audioUrl">
): string | null {
  return entry.audioPath ?? entry.audioUrl ?? null;
}

/**
 * Upload audio bytes to Supabase Storage at the canonical per-user
 * per-entry path and return the object path.
 *
 * Unlike `lib/pipeline.ts::uploadAudio`, this does NOT create a signed
 * URL — the caller persists the object path on `Entry.audioPath` and
 * signing happens on playback, per SECURITY_AUDIT.md §4.
 */
export async function uploadAudioBytes(
  buffer: Buffer,
  userId: string,
  entryId: string,
  mimeType: string
): Promise<string> {
  const { supabase } = await import("@/lib/supabase.server");

  const ext = mimeType.split("/")[1]?.replace("x-m4a", "m4a") ?? "webm";
  const objectPath = `${userId}/${entryId}.${ext}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, buffer, { contentType: mimeType, upsert: false });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return objectPath;
}

/**
 * Guess a MIME type from an audio object-path extension. Whisper + the
 * Anthropic SDK are lenient about mime advisories, but we pass a
 * reasonable default so audio/webm (the browser's default MediaRecorder
 * output) round-trips correctly.
 */
export function mimeTypeFromAudioPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "webm";
  const map: Record<string, string> = {
    webm: "audio/webm",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    mp3: "audio/mpeg",
    mpga: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };
  return map[ext] ?? "audio/webm";
}
