import * as FileSystem from "expo-file-system/legacy";

import { api } from "@/lib/api";

/**
 * Direct-to-storage audio upload.
 *
 * ── Why this exists (production 413, 2026-08-20) ─────────────────────
 * Audio used to be POSTed to our API as multipart. Vercel caps serverless
 * request bodies at 4.5MB and that limit is not configurable, so a
 * full-length recording was rejected AT THE EDGE — before any handler ran,
 * which is why the failure surfaced as an opaque 413 with nothing in our
 * logs. Lowering the bitrate bought headroom; it did not remove the
 * ceiling.
 *
 * This removes it. The device asks the API for a short-lived signed URL,
 * PUTs the bytes straight to Supabase Storage, and then POSTs metadata
 * only. Audio never traverses a serverless function, so the body cap stops
 * applying entirely. The real limit becomes the bucket's own 25MB, which is
 * deliberately matched to Whisper's hard cap.
 *
 * The upload is a native binary transfer (BINARY_CONTENT), so the file is
 * never loaded into JS memory — a long recording won't pressure the heap.
 */

export type UploadTarget = "entry" | "try";

export interface DirectUploadResult {
  /** Object path inside the bucket. This is what the metadata POST sends. */
  storagePath: string;
  /** Canonical MIME the server assigned. Send this back verbatim. */
  mimeType: string;
}

interface SignedUploadTicket {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
  mimeType: string;
  maxBytes: number;
}

/** Thrown when the recording is larger than the pipeline can transcribe. */
export class AudioTooLargeError extends Error {
  constructor() {
    super("That recording is too long to process.");
    this.name = "AudioTooLargeError";
  }
}

/**
 * Upload a recording straight to storage and return the object path.
 *
 * @param uri       local file URI from Audio.Recording
 * @param mimeType  what the OS reports; the server canonicalizes it
 * @param target    "entry" (authenticated) or "try" (anonymous onboarding)
 * @param authToken required for "entry", ignored for "try"
 */
export async function uploadAudioDirect({
  uri,
  mimeType,
  target,
  authToken,
}: {
  uri: string;
  mimeType: string;
  target: UploadTarget;
  authToken?: string | null;
}): Promise<DirectUploadResult> {
  // Size is advisory — it lets the server reject an oversized recording
  // before we spend the user's bandwidth uploading it. The bucket enforces
  // the real limit regardless.
  let sizeBytes: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === "number") sizeBytes = info.size;
  } catch {
    // Non-fatal: proceed without the pre-check.
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const ticketRes = await fetch(`${api.baseUrl()}/api/record/upload-url`, {
    method: "POST",
    headers,
    body: JSON.stringify({ target, mimeType, sizeBytes }),
  });

  if (ticketRes.status === 413) throw new AudioTooLargeError();
  if (!ticketRes.ok) {
    const text = await ticketRes.text().catch(() => "");
    throw new Error(
      `upload-url failed (${ticketRes.status}): ${text.slice(0, 200)}`
    );
  }

  const ticket = (await ticketRes.json()) as SignedUploadTicket;

  if (sizeBytes !== undefined && sizeBytes > ticket.maxBytes) {
    throw new AudioTooLargeError();
  }

  // The signed URL already carries its authorization token as a query
  // param, so this PUT needs no session credentials — which is the point:
  // the device is writing to exactly one path we named, and nothing else.
  const uploadRes = await FileSystem.uploadAsync(ticket.signedUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      "Content-Type": ticket.mimeType,
      "x-upsert": "false",
    },
  });

  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new Error(
      `storage upload failed (${uploadRes.status}): ${String(
        uploadRes.body ?? ""
      ).slice(0, 200)}`
    );
  }

  return { storagePath: ticket.path, mimeType: ticket.mimeType };
}
