"use client";

/**
 * Browser-side direct-to-storage audio upload.
 *
 * ── Why this exists (production 413, 2026-08-20) ─────────────────────
 * Audio used to be POSTed to our API as multipart. Vercel caps serverless
 * request bodies at 4.5MB and that limit is not configurable, so a
 * long recording was rejected AT THE EDGE — before any handler ran, which
 * is why the failure surfaced as an opaque 413 with nothing in our logs.
 *
 * This is the browser twin of apps/mobile/lib/direct-upload.ts and hits the
 * same endpoint. Both platforms had the same ceiling, so both get the same
 * fix — a web-only or mobile-only version would just leave the bug alive on
 * the other surface.
 */

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
 * Upload a recorded Blob straight to storage and return the object path.
 *
 * @param blob    the MediaRecorder output
 * @param target  "entry" (authenticated) or "try" (anonymous)
 */
export async function uploadAudioDirect(
  blob: Blob,
  target: "entry" | "try"
): Promise<DirectUploadResult> {
  const ticketRes = await fetch("/api/record/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target,
      mimeType: blob.type || "audio/webm",
      sizeBytes: blob.size,
    }),
  });

  if (ticketRes.status === 413) throw new AudioTooLargeError();
  if (!ticketRes.ok) {
    const text = await ticketRes.text().catch(() => "");
    throw new Error(
      `upload-url failed (${ticketRes.status}): ${text.slice(0, 200)}`
    );
  }

  const ticket = (await ticketRes.json()) as SignedUploadTicket;
  if (blob.size > ticket.maxBytes) throw new AudioTooLargeError();

  // The signed URL carries its own authorization token as a query param,
  // so this PUT needs no session credentials — the browser can write to
  // exactly the one path the server named, and nothing else.
  const uploadRes = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": ticket.mimeType, "x-upsert": "false" },
    body: blob,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => "");
    throw new Error(
      `storage upload failed (${uploadRes.status}): ${text.slice(0, 200)}`
    );
  }

  return { storagePath: ticket.path, mimeType: ticket.mimeType };
}
