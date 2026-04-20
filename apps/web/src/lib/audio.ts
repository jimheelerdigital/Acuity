import type { Entry } from "@prisma/client";

const STORAGE_BUCKET = "voice-entries";

/**
 * Map of incoming MIME variants to the canonical form Supabase Storage
 * accepts. iOS's ExtAudio framework reports m4a files as `audio/x-m4a`,
 * some Android recorders emit `audio/aac`, and browser MediaRecorder
 * sends `audio/webm;codecs=opus`. We canonicalize server-side so the
 * Supabase bucket's allowlist only needs to cover our four core types:
 * webm, mp4, wav, mpeg.
 *
 * Anything that maps in here returns the canonical type. Anything that
 * doesn't and isn't already canonical is treated as unsupported.
 */
const MIME_ALIAS_TO_CANONICAL: Record<string, string> = {
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/aac": "audio/mp4",
  "audio/x-aac": "audio/mp4",
  "audio/mp4a-latm": "audio/mp4",
};

const CANONICAL_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/wav",
  "audio/mpeg",
  "audio/ogg",
]);

/**
 * Canonical filename extension for a given MIME. Drives both the
 * Supabase storage object path AND the filename we hand to Whisper's
 * transcription endpoint — Whisper reads format from the extension,
 * not the content-type header, and it's picky about MP4-container
 * audio: `.mp4` sometimes fails because Whisper tries to demux video,
 * whereas `.m4a` (the canonical extension for AAC-in-MP4) works
 * reliably. So we always map audio/mp4 → `m4a`, not `mp4`.
 */
const MIME_TO_EXT: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
};

export function extensionForMimeType(mime: string): string {
  return MIME_TO_EXT[mime] ?? "webm";
}

/**
 * Strip codec params + lowercase + alias-map an incoming MIME to the
 * canonical form. Returns null if the input isn't any audio type we
 * recognize (caller should 415).
 *
 * Example flow:
 *   "audio/webm;codecs=opus"  → "audio/webm"
 *   "AUDIO/X-M4A"             → "audio/mp4"
 *   "audio/aac"               → "audio/mp4"
 *   "audio/mp4"               → "audio/mp4"
 *   "application/octet-stream" → null
 *   ""                        → null
 */
export function normalizeAudioMimeType(rawMime: string): string | null {
  if (!rawMime) return null;
  const base = rawMime.split(";")[0].trim().toLowerCase();
  if (!base.startsWith("audio/")) return null;
  const aliased = MIME_ALIAS_TO_CANONICAL[base];
  if (aliased) return aliased;
  if (CANONICAL_TYPES.has(base)) return base;
  return null;
}

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

  const ext = extensionForMimeType(mimeType);
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

