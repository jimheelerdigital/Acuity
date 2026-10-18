import { describe, expect, it, vi } from "vitest";

import {
  cameBackCutoff,
  isDueNow,
  runDay2Nudge,
  type Day2Candidate,
  type Day2NudgeDeps,
} from "./day2-nudge";

vi.mock("@/lib/safe-log", () => ({ safeLog: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// 2026-10-20 17:30 UTC. For a user in UTC with the 17:30 default slot this
// is inside the send hour.
const NOW = new Date("2026-10-20T17:30:00Z");
const H = 60 * 60 * 1000;

function user(over: Partial<Day2Candidate> = {}): Day2Candidate {
  return {
    id: over.id ?? "u1",
    email: over.email ?? "someone@example.com",
    // 2.5 days old → inside the 2–3 day band.
    createdAt: over.createdAt ?? new Date(NOW.getTime() - 60 * H),
    timezone: over.timezone ?? "UTC",
    notificationTime: over.notificationTime ?? null,
    pushToken: over.pushToken ?? null,
  };
}

function deps(
  candidates: Day2Candidate[],
  over: Partial<Day2NudgeDeps> = {}
): Day2NudgeDeps & {
  sendPush: ReturnType<typeof vi.fn>;
  sendEmail: ReturnType<typeof vi.fn>;
  logSent: ReturnType<typeof vi.fn>;
} {
  return {
    now: NOW,
    loadCandidates: async () => candidates,
    sendPush: vi.fn(async () => true),
    hasEntrySince: async () => false,
    hasEmailSince: async () => false,
    sendEmail: vi.fn(async () => ({ sent: true })),
    isInternalEmail: (e: string | null) => !!e && e.endsWith("@heelerdigital.com"),
    logSent: vi.fn(async () => undefined),
    ...over,
  } as never;
}

describe("isDueNow", () => {
  it("2–3 days old, inside the local hour → due", () => {
    expect(isDueNow(user(), NOW)).toBe("due");
  });

  it("outside the age band is never due (too young, too old)", () => {
    expect(isDueNow(user({ createdAt: new Date(NOW.getTime() - 47 * H) }), NOW)).toBe("outside_band");
    expect(isDueNow(user({ createdAt: new Date(NOW.getTime() - 72 * H) }), NOW)).toBe("outside_band");
  });

  it("inside the band but not their hour → outside_hour", () => {
    expect(isDueNow(user({ notificationTime: "21:00" }), NOW)).toBe("outside_hour");
    // Same wall-clock slot, different zone: 17:30 UTC is 12:30 in Chicago.
    expect(isDueNow(user({ timezone: "America/Chicago" }), NOW)).toBe("outside_hour");
    expect(isDueNow(user({ timezone: "America/Chicago", notificationTime: "12:00" }), NOW)).toBe("due");
  });

  it("cameBackCutoff is 24h after signup", () => {
    const c = new Date("2026-10-18T05:00:00Z");
    expect(cameBackCutoff(c).toISOString()).toBe("2026-10-19T05:00:00.000Z");
  });
});

describe("runDay2Nudge — channel split", () => {
  it("pushToken → push only, no email; logs push", async () => {
    const d = deps([user({ pushToken: "ExponentPushToken[x]" })]);
    const s = await runDay2Nudge(d);
    expect(s.push).toBe(1);
    expect(s.email).toBe(0);
    expect(d.sendPush).toHaveBeenCalledWith("u1");
    expect(d.sendEmail).not.toHaveBeenCalled();
    expect(d.logSent).toHaveBeenCalledWith("u1", "push");
  });

  it("no pushToken → email only, no push; logs email", async () => {
    const d = deps([user()]);
    const s = await runDay2Nudge(d);
    expect(s.email).toBe(1);
    expect(s.push).toBe(0);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(d.sendEmail).toHaveBeenCalledWith("u1");
    expect(d.logSent).toHaveBeenCalledWith("u1", "email");
  });

  it("a push that did not leave is not logged", async () => {
    const d = deps([user({ pushToken: "t" })], { sendPush: vi.fn(async () => false) });
    const s = await runDay2Nudge(d);
    expect(s.push).toBe(0);
    expect(d.logSent).not.toHaveBeenCalled();
  });
});

describe("runDay2Nudge — email skip rules", () => {
  it("skips users outside their hour without touching either channel", async () => {
    const d = deps([user({ notificationTime: "09:00" }), user({ id: "u2", pushToken: "t", notificationTime: "09:00" })]);
    const s = await runDay2Nudge(d);
    expect(s.skippedHour).toBe(2);
    expect(d.sendPush).not.toHaveBeenCalled();
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("already came back (recorded >24h after signup) → no email", async () => {
    const u = user();
    const hasEntrySince = vi.fn(async (_id: string, since: Date) => since.getTime() === cameBackCutoff(u.createdAt).getTime());
    const d = deps([u], { hasEntrySince });
    const s = await runDay2Nudge(d);
    expect(hasEntrySince).toHaveBeenCalledWith("u1", cameBackCutoff(u.createdAt));
    expect(s.skippedCameBack).toBe(1);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("another lifecycle email in the last 24h → throttled, no email", async () => {
    const d = deps([user()], {
      hasEmailSince: vi.fn(async (_id: string, since: Date) => since.getTime() === NOW.getTime() - 24 * H),
    });
    const s = await runDay2Nudge(d);
    expect(s.skippedThrottled).toBe(1);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("internal mailboxes never get the email", async () => {
    const d = deps([user({ email: "jim@heelerdigital.com" })]);
    const s = await runDay2Nudge(d);
    expect(s.skippedInternal).toBe(1);
    expect(d.sendEmail).not.toHaveBeenCalled();
  });

  it("second run: sendTrialEmail dedupes on TrialEmailLog → not counted, not logged", async () => {
    const d = deps([user()], { sendEmail: vi.fn(async () => ({ sent: false, reason: "already_sent" })) });
    const s = await runDay2Nudge(d);
    expect(s.email).toBe(0);
    expect(s.emailNotSent).toEqual({ already_sent: 1 });
    expect(d.logSent).not.toHaveBeenCalled();
  });

  it("unsubscribed / disabled reasons are surfaced, not sent", async () => {
    const d = deps([user(), user({ id: "u2" })], {
      sendEmail: vi
        .fn()
        .mockResolvedValueOnce({ sent: false, reason: "unsubscribed" })
        .mockResolvedValueOnce({ sent: false, reason: "disabled" }),
    });
    const s = await runDay2Nudge(d);
    expect(s.emailNotSent).toEqual({ unsubscribed: 1, disabled: 1 });
  });
});
