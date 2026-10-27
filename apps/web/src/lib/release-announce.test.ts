import { describe, expect, it, vi } from "vitest";

import { releaseEmailFor } from "@/emails/announcements/releases";

import {
  buildReleaseRecipients,
  fetchResendSuppressions,
  liveAppStoreVersion,
  releaseEmailKey,
  sendReleaseLive,
  type ReleaseRecipient,
} from "./release-announce";

const release = releaseEmailFor("1.9.6")!;

// Unsubscribe links are HMAC-signed; a fixed test secret, not production's.
vi.stubEnv("NEXTAUTH_SECRET", "test-secret-for-release-announce");

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("fetchResendSuppressions", () => {
  it("pages with `after` until has_more is false and lower-cases emails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ has_more: true, data: [{ id: "s1", email: "A@x.com" }] }))
      .mockResolvedValueOnce(jsonRes({ has_more: false, data: [{ id: "s2", email: "b@x.com" }] }));
    const set = await fetchResendSuppressions("key", fetchImpl as unknown as typeof fetch);
    expect([...set]).toEqual(["a@x.com", "b@x.com"]);
    expect(fetchImpl.mock.calls[0][0]).toContain("/suppressions?limit=100");
    expect(fetchImpl.mock.calls[1][0]).toContain("after=s1");
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe("Bearer key");
  });

  it("throws when Resend can't be read (a live send must not proceed)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonRes({}, false, 401));
    await expect(fetchResendSuppressions("key", fetchImpl as unknown as typeof fetch)).rejects.toThrow(/401/);
  });
});

describe("liveAppStoreVersion", () => {
  it("reads the lookup version, null on failure", async () => {
    const ok = vi.fn().mockResolvedValue(jsonRes({ results: [{ version: "1.9.6" }] }));
    expect(await liveAppStoreVersion(ok as unknown as typeof fetch)).toBe("1.9.6");
    const bad = vi.fn().mockRejectedValue(new Error("x"));
    expect(await liveAppStoreVersion(bad as unknown as typeof fetch)).toBeNull();
  });
});

describe("buildReleaseRecipients", () => {
  it("drops suppressed addresses and flags already-sent users", async () => {
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "u1", email: "one@x.com", name: "Ann Lee", createdAt: new Date() },
          { id: "u2", email: "Bounced@x.com", name: null, createdAt: new Date() },
          { id: "u3", email: "three@x.com", name: "", createdAt: new Date() },
        ]),
      },
      trialEmailLog: { findMany: vi.fn().mockResolvedValue([{ userId: "u3" }]) },
    };
    const { recipients, suppressedCount } = await buildReleaseRecipients(
      db as never,
      release,
      new Set(["bounced@x.com"])
    );
    expect(suppressedCount).toBe(1);
    expect(recipients.map((r) => [r.userId, r.firstName, r.alreadySent])).toEqual([
      ["u1", "Ann", false],
      ["u3", null, true],
    ]);
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      onboardingUnsubscribed: false,
      OR: [{ devicePlatform: "ios" }, { pushTokenPlatform: "ios" }],
    });
    expect(db.trialEmailLog.findMany.mock.calls[0][0].where.emailKey).toBe("release_1.9.6");
  });
});

describe("sendReleaseLive", () => {
  const rec = (id: string, alreadySent = false): ReleaseRecipient => ({
    userId: id,
    email: `${id}@x.com`,
    firstName: null,
    createdAt: new Date(),
    alreadySent,
  });

  it("claims before sending, skips claimed users, records resend ids and failures", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({}) // u1 claimed
      .mockRejectedValueOnce(new Error("unique")) // u2 claimed elsewhere
      .mockResolvedValueOnce({}); // u3 claimed
    const update = vi.fn().mockResolvedValue({});
    const send = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "re_1" } })
      .mockResolvedValueOnce({ error: { message: "nope" } });
    const r = await sendReleaseLive({
      db: { trialEmailLog: { create, update } } as never,
      mailer: { emails: { send } },
      release,
      recipients: [rec("u1"), rec("u2"), rec("u3"), rec("u4", true)],
      sleep: async () => {},
    });
    expect(r).toMatchObject({ sent: 1, skipped: 1, failed: 1, remaining: 0, failures: ["u3@x.com"] });
    expect(create).toHaveBeenCalledTimes(3); // u4 already sent: never touched
    expect(create.mock.calls[0][0].data.emailKey).toBe(releaseEmailKey("1.9.6"));
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.resendId).toBe("re_1");
    expect(send.mock.calls[0][0].headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("stops at the deadline and reports what's left", async () => {
    const r = await sendReleaseLive({
      db: { trialEmailLog: { create: vi.fn(), update: vi.fn() } } as never,
      mailer: { emails: { send: vi.fn() } },
      release,
      recipients: [rec("u1"), rec("u2")],
      deadline: Date.now() - 1,
    });
    expect(r).toMatchObject({ sent: 0, remaining: 2 });
  });
});
