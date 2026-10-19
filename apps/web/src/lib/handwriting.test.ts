import { describe, expect, it, vi } from "vitest";

import { NO_TEXT_SENTINEL, transcribeHandwriting } from "./handwriting";

function fakeClient(blocks: Array<{ type: string; text?: string }>) {
  const create = vi.fn().mockResolvedValue({ content: blocks });
  return { client: { messages: { create } } as never, create };
}

describe("transcribeHandwriting", () => {
  it("sends the image as base64 and returns the model's text verbatim", async () => {
    const { client, create } = fakeClient([
      { type: "text", text: "Mon 14th\n- call the vet\n- finish the deck [illegible] by Fri" },
    ]);
    const r = await transcribeHandwriting("QUJD", "image/jpeg", client);
    expect(r).toEqual({
      ok: true,
      text: "Mon 14th\n- call the vet\n- finish the deck [illegible] by Fri",
    });
    const args = create.mock.calls[0][0];
    const img = args.messages[0].content[0];
    expect(img).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJD" },
    });
    expect(args.system).toContain("verbatim");
  });

  it("maps HEIC to JPEG for the API (device converts the bytes)", async () => {
    const { client, create } = fakeClient([{ type: "text", text: "hello there" }]);
    await transcribeHandwriting("QUJD", "image/heic", client);
    expect(create.mock.calls[0][0].messages[0].content[0].source.media_type).toBe(
      "image/jpeg"
    );
  });

  it("reports no_text when the model returns the sentinel", async () => {
    const { client } = fakeClient([{ type: "text", text: NO_TEXT_SENTINEL }]);
    expect(await transcribeHandwriting("QUJD", "image/png", client)).toEqual({
      ok: false,
      reason: "no_text",
    });
  });

  it("reports empty_response when there is no text block", async () => {
    const { client } = fakeClient([]);
    expect(await transcribeHandwriting("QUJD", "image/png", client)).toEqual({
      ok: false,
      reason: "empty_response",
    });
  });
});
