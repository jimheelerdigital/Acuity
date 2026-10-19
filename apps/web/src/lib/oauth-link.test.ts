import { describe, expect, it, vi } from "vitest";

const revokeAllSessions = vi.fn().mockResolvedValue(new Date());
vi.mock("@/lib/session-revocation", () => ({
  revokeAllSessions: (...a: unknown[]) => revokeAllSessions(...a),
}));

import { secureOAuthLink } from "./oauth-link";

function prismaMock() {
  return {
    user: { update: vi.fn().mockResolvedValue({}) },
    onboardingEvent: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("secureOAuthLink", () => {
  it("attacker pre-registered with a password, never verified → password cleared, sessions revoked, email now verified", async () => {
    const p = prismaMock();
    const r = await secureOAuthLink(
      p as never,
      { id: "u1", passwordHash: "hash", emailVerified: null },
      "google"
    );
    expect(r.supersededPassword).toBe(true);
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: null } });
    expect(revokeAllSessions).toHaveBeenCalledWith(p, "u1", expect.stringContaining("google"));
    expect(p.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { emailVerified: expect.any(Date) },
    });
    expect(p.onboardingEvent.create.mock.calls[0][0].data.event).toBe("password_superseded_by_oauth");
  });

  it("verified password account linking Google keeps its password", async () => {
    revokeAllSessions.mockClear();
    const p = prismaMock();
    const r = await secureOAuthLink(
      p as never,
      { id: "u2", passwordHash: "hash", emailVerified: new Date("2026-01-01") },
      "apple"
    );
    expect(r.supersededPassword).toBe(false);
    expect(p.user.update).not.toHaveBeenCalled();
    expect(revokeAllSessions).not.toHaveBeenCalled();
  });

  it("passwordless unverified account (email-code) just gets verified", async () => {
    revokeAllSessions.mockClear();
    const p = prismaMock();
    const r = await secureOAuthLink(p as never, { id: "u3", passwordHash: null, emailVerified: null }, "google");
    expect(r.supersededPassword).toBe(false);
    expect(revokeAllSessions).not.toHaveBeenCalled();
    expect(p.user.update).toHaveBeenCalledTimes(1);
    expect(p.user.update.mock.calls[0][0].data).toEqual({ emailVerified: expect.any(Date) });
  });
});
