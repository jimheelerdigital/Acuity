import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Typed entries on POST /api/record (2026-10-17).
 *
 * Pins the contract the mobile composer relies on:
 *   - `{ text }` creates an Entry whose transcript IS the text, marked
 *     inputMode="typed", with no audio, and dispatches the pipeline
 *     with `transcriptProvided: true` (NOT `skipTranscribe`, which
 *     carries edit-reprocess semantics).
 *   - Too-short text is rejected before anything is created.
 *   - text + storagePath together is rejected (one wire shape per request).
 *   - The paywall / rate-limit gates still run (they're mocked as
 *     passing here; the ordering assertion is that create only happens
 *     once, after validation).
 */

const entryCreate = vi.fn();
const inngestSend = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { entry: { create: (...a: unknown[]) => entryCreate(...a) } },
}));
vi.mock("@/inngest/client", () => ({
  inngest: { send: (...a: unknown[]) => inngestSend(...a) },
}));
vi.mock("@/lib/mobile-auth", () => ({
  getAnySessionUserId: async () => "user_1",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  limiters: { expensiveAi: {}, recordDaily: {}, recordMonthly: {} },
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/paywall", () => ({
  requireEntitlement: async () => ({
    ok: true,
    entitlement: { canExtractEntries: true },
  }),
}));
vi.mock("@/lib/feature-flags", () => ({ isEnabled: async () => false }));
vi.mock("@/lib/audio", () => ({
  normalizeAudioMimeType: (m: string) => m,
  uploadAudioBytes: vi.fn(),
  verifyStoredAudio: vi.fn(),
}));
vi.mock("@/lib/pipeline", () => ({ processEntry: vi.fn() }));

function post(body: unknown) {
  return new Request("http://localhost/api/record", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  entryCreate.mockResolvedValue({ id: "entry_typed_1" });
  inngestSend.mockResolvedValue({ ids: ["evt"] });
});

describe("POST /api/record — typed entry", () => {
  it("creates the entry with the text as transcript and dispatches transcriptProvided", async () => {
    const { POST } = await import("./route");
    const text = "  Long day. Shipped the widget fix, finally.\r\nNeed to call the vet tomorrow.  ";
    const res = await POST(post({ text }) as never);
    expect(res.status).toBe(202);
    const json = (await res.json()) as { entryId: string; status: string };
    expect(json).toEqual({ entryId: "entry_typed_1", status: "QUEUED" });

    expect(entryCreate).toHaveBeenCalledTimes(1);
    const data = entryCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.userId).toBe("user_1");
    expect(data.status).toBe("QUEUED");
    expect(data.inputMode).toBe("typed");
    // Trimmed, CRLF normalised, otherwise verbatim.
    expect(data.transcript).toBe(
      "Long day. Shipped the widget fix, finally.\nNeed to call the vet tomorrow."
    );
    expect(data.audioPath).toBeUndefined();

    expect(inngestSend).toHaveBeenCalledTimes(1);
    expect(inngestSend.mock.calls[0][0]).toEqual({
      name: "entry/process.requested",
      data: { entryId: "entry_typed_1", userId: "user_1", transcriptProvided: true },
    });
    // Must NOT masquerade as an edit-reprocess.
    expect(inngestSend.mock.calls[0][0].data.skipTranscribe).toBeUndefined();
  });

  it("rejects text that is too short without creating anything", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ text: "ok" }) as never);
    expect(res.status).toBe(400);
    expect(entryCreate).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("rejects text over the ceiling with 413", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ text: "x".repeat(30_001) }) as never);
    expect(res.status).toBe(413);
    expect(entryCreate).not.toHaveBeenCalled();
  });

  it("rejects text and storagePath in the same request", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      post({ text: "A perfectly fine entry body.", storagePath: "user_1/x.m4a" }) as never
    );
    expect(res.status).toBe(400);
    expect(entryCreate).not.toHaveBeenCalled();
  });

  it("still requires storagePath when no text is sent", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ mimeType: "audio/mp4" }) as never);
    expect(res.status).toBe(400);
    expect(entryCreate).not.toHaveBeenCalled();
  });

  it("forwards goalId/dimensionContext for typed entries", async () => {
    const { POST } = await import("./route");
    await POST(
      post({ text: "Thinking about the move and money.", dimensionContext: "finances" }) as never
    );
    const data = entryCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.dimensionContext).toBe("finances");
    expect(data.goalId).toBeNull();
  });
});
