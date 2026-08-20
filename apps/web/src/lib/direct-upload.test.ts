import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Direct-to-storage upload contract.
 *
 * These cover the two things that actually keep the 413 fix safe:
 *   1. verifyStoredAudio — the metadata POST is a CLAIM that bytes landed
 *      in the bucket. Nothing else proves it, because the bytes no longer
 *      pass through our API.
 *   2. /api/record/upload-url path derivation — the signed URL grants write
 *      access to exactly one path. If the client could choose that path,
 *      it could overwrite another user's audio.
 */

const storageMock = {
  info: vi.fn(),
  createSignedUploadUrl: vi.fn(),
};

vi.mock("@/lib/supabase.server", () => ({
  supabase: { storage: { from: () => storageMock } },
}));

const getAnySessionUserId = vi.fn();
vi.mock("@/lib/mobile-auth", () => ({
  getAnySessionUserId: (...args: unknown[]) => getAnySessionUserId(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  identifierFromRequest: () => "test-id",
  limiters: { tryRecordingByIpMobile: {} },
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));

vi.mock("@/lib/safe-log", () => ({
  safeLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.createSignedUploadUrl.mockResolvedValue({
    data: { path: "unused", token: "tok", signedUrl: "https://example/signed" },
    error: null,
  });
});

describe("verifyStoredAudio", () => {
  it("reports missing when the object is not in the bucket", async () => {
    storageMock.info.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });
    const { verifyStoredAudio } = await import("@/lib/audio");
    const r = await verifyStoredAudio("voice-entries", "u1/abc.m4a");
    expect(r).toEqual({ ok: false, reason: "missing" });
  });

  it("reports empty for a zero-byte object", async () => {
    // A half-finished upload can leave a 0-byte object behind. Accepting it
    // would create an Entry that transcription can only fail on.
    storageMock.info.mockResolvedValue({ data: { size: 0 }, error: null });
    const { verifyStoredAudio } = await import("@/lib/audio");
    const r = await verifyStoredAudio("voice-entries", "u1/abc.m4a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("rejects anything past Whisper's 25MB ceiling", async () => {
    const { MAX_STORED_AUDIO_BYTES, verifyStoredAudio } = await import(
      "@/lib/audio"
    );
    storageMock.info.mockResolvedValue({
      data: { size: MAX_STORED_AUDIO_BYTES + 1 },
      error: null,
    });
    const r = await verifyStoredAudio("voice-entries", "u1/abc.m4a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });

  it("accepts a normal recording and reports its size", async () => {
    storageMock.info.mockResolvedValue({
      data: { size: 2_400_000 },
      error: null,
    });
    const { verifyStoredAudio } = await import("@/lib/audio");
    const r = await verifyStoredAudio("voice-entries", "u1/abc.m4a");
    expect(r).toEqual({ ok: true, sizeBytes: 2_400_000 });
  });

  it("matches the bucket limit exactly — 25MB, not 50", async () => {
    // Both voice-entries and voice-entries-try are set to 26214400. A
    // mismatch here would let us accept a file the bucket refuses (or
    // refuse one it would have taken).
    const { MAX_STORED_AUDIO_BYTES } = await import("@/lib/audio");
    expect(MAX_STORED_AUDIO_BYTES).toBe(26_214_400);
  });
});

describe("POST /api/record/upload-url", () => {
  const post = async (body: unknown) => {
    const { POST } = await import("@/app/api/record/upload-url/route");
    const req = new Request("https://x/api/record/upload-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req as never);
  };

  it("refuses an entry upload without a session", async () => {
    getAnySessionUserId.mockResolvedValue(null);
    const res = await post({ target: "entry", mimeType: "audio/mp4" });
    expect(res.status).toBe(401);
    expect(storageMock.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("scopes an entry path to the caller's own folder", async () => {
    getAnySessionUserId.mockResolvedValue("user-123");
    const res = await post({ target: "entry", mimeType: "audio/mp4" });
    expect(res.status).toBe(201);
    const signedPath = storageMock.createSignedUploadUrl.mock.calls[0][0];
    expect(signedPath.startsWith("user-123/")).toBe(true);
    expect(signedPath.endsWith(".m4a")).toBe(true);
  });

  it("ignores a client-supplied path — the server always derives it", async () => {
    // The whole point: a caller who could name the path could request a
    // signed URL for someone else's object and overwrite their audio.
    getAnySessionUserId.mockResolvedValue("user-123");
    const res = await post({
      target: "entry",
      mimeType: "audio/mp4",
      path: "victim-user/steal.m4a",
      storagePath: "victim-user/steal.m4a",
    });
    expect(res.status).toBe(201);
    const signedPath = storageMock.createSignedUploadUrl.mock.calls[0][0];
    expect(signedPath).not.toContain("victim-user");
    expect(signedPath.startsWith("user-123/")).toBe(true);
  });

  it("issues an anonymous try upload with a flat unguessable path", async () => {
    getAnySessionUserId.mockResolvedValue(null);
    const res = await post({ target: "try", mimeType: "audio/mp4" });
    expect(res.status).toBe(201);
    const signedPath = storageMock.createSignedUploadUrl.mock.calls[0][0];
    expect(signedPath).not.toContain("/");
    // 32 random bytes → 64 hex chars, then the extension.
    expect(signedPath).toMatch(/^[0-9a-f]{64}\.m4a$/);
  });

  it("rejects an oversized recording before the client uploads it", async () => {
    getAnySessionUserId.mockResolvedValue("user-123");
    const res = await post({
      target: "entry",
      mimeType: "audio/mp4",
      sizeBytes: 30 * 1024 * 1024,
    });
    expect(res.status).toBe(413);
    expect(storageMock.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("rejects an unsupported audio type", async () => {
    getAnySessionUserId.mockResolvedValue("user-123");
    const res = await post({ target: "entry", mimeType: "video/mp4" });
    expect(res.status).toBe(415);
  });
});
