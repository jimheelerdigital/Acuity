import { beforeEach, describe, expect, it, vi } from "vitest";

const transcribeHandwriting = vi.fn();
vi.mock("@/lib/handwriting", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    transcribeHandwriting: (...a: unknown[]) => transcribeHandwriting(...a),
  };
});
vi.mock("@/lib/mobile-auth", () => ({
  getAnySessionUserId: async () => "user_1",
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ success: true }),
  limiters: { expensiveAi: {}, recordDaily: {}, recordMonthly: {} },
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/paywall", () => ({
  requireEntitlement: async () => ({ ok: true, entitlement: {} }),
}));

function post(body: unknown) {
  return new Request("http://localhost/api/record/transcribe-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  transcribeHandwriting.mockResolvedValue({ ok: true, text: "dear diary" });
});

describe("POST /api/record/transcribe-image", () => {
  it("returns the transcription for a valid image", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ image: "QUJDRA==", mediaType: "image/jpeg" }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "dear diary" });
    expect(transcribeHandwriting).toHaveBeenCalledWith("QUJDRA==", "image/jpeg");
  });

  it("strips a data: prefix before sending", async () => {
    const { POST } = await import("./route");
    await POST(
      post({ image: "data:image/png;base64,QUJDRA==", mediaType: "image/png" }) as never
    );
    expect(transcribeHandwriting).toHaveBeenCalledWith("QUJDRA==", "image/png");
  });

  it("415s on a non-image media type", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ image: "QUJD", mediaType: "application/pdf" }) as never);
    expect(res.status).toBe(415);
    expect(transcribeHandwriting).not.toHaveBeenCalled();
  });

  it("400s on malformed base64", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ image: "not base64!!", mediaType: "image/jpeg" }) as never);
    expect(res.status).toBe(400);
  });

  it("413s when the decoded image exceeds the cap", async () => {
    const { POST } = await import("./route");
    // 4 MB + 1 decoded → base64 length ≈ 5.6M chars
    const big = "A".repeat(Math.ceil(((4 * 1024 * 1024 + 4) * 4) / 3));
    const res = await POST(post({ image: big, mediaType: "image/jpeg" }) as never);
    expect(res.status).toBe(413);
    expect(transcribeHandwriting).not.toHaveBeenCalled();
  });

  it("422s with a code when no writing is found", async () => {
    transcribeHandwriting.mockResolvedValue({ ok: false, reason: "no_text" });
    const { POST } = await import("./route");
    const res = await POST(post({ image: "QUJD", mediaType: "image/jpeg" }) as never);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("no_text");
  });
});
