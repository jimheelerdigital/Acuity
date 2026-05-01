import { describe, expect, it } from "vitest";

import { TRIAL_EMAIL_TEMPLATES } from "@/emails/trial/registry";
import type { TrialEmailKey } from "@/emails/trial/registry";

import {
  nextEmailForUser,
  type CandidateUser,
  type Track,
} from "./trial-email-orchestrator";

const NOW = new Date("2026-05-15T12:00:00Z");
const SIGNUP = new Date("2026-05-01T12:00:00Z"); // 14 days before NOW
const HOUR = 60 * 60 * 1000;

function makeCandidate(overrides: Partial<CandidateUser> = {}): CandidateUser {
  return {
    id: "u1",
    createdAt: SIGNUP,
    trialEndsAt: NOW, // exactly now by default; overridden per-test
    firstRecordingAt: new Date(SIGNUP.getTime() + HOUR),
    totalRecordings: 7,
    onboardingTrack: "STANDARD",
    onboardingUnsubscribed: false,
    sentKeys: new Set<TrialEmailKey>([
      // Pretend the rest of the standard sequence has already shipped
      // so the day14 / day13 branches aren't masked by an earlier
      // unsent email taking priority.
      "first_debrief_replay",
      "objection_60sec",
      "pattern_tease",
      "user_story",
      "weekly_report_checkin",
      "life_matrix_reveal",
      "value_recap",
    ]),
    firstWeeklyReportAt: new Date(SIGNUP.getTime() + 7 * 24 * HOUR),
    ...overrides,
  };
}

describe("trial_ended_day14 — eligibility window", () => {
  it("returns trial_ended_day14 when trialEndsAt is 1h in the past and email not yet sent", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - HOUR),
    });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).toBe(
      "trial_ended_day14"
    );
  });

  it("returns trial_ended_day14 at the boundary (23h59m past)", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - 23 * HOUR - 59 * 60 * 1000),
    });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).toBe(
      "trial_ended_day14"
    );
  });

  it("does NOT fire trial_ended_day14 when trialEndsAt is 25h in the past (out of window)", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - 25 * HOUR),
    });
    // Trial ended too long ago — we don't send "your trial just ended"
    // a day after the fact. Returns null (or whatever earlier email is
    // pending). Importantly, NOT trial_ended_day14.
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).not.toBe(
      "trial_ended_day14"
    );
  });

  it("does NOT fire trial_ended_day14 when trialEndsAt is in the future", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() + 2 * 24 * HOUR),
    });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).not.toBe(
      "trial_ended_day14"
    );
  });

  it("does NOT fire trial_ended_day14 when trialEndsAt is null", () => {
    const candidate = makeCandidate({ trialEndsAt: null });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).not.toBe(
      "trial_ended_day14"
    );
  });
});

describe("trial_ended_day14 — idempotency", () => {
  it("returns null (or other email) when trial_ended_day14 already sent", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - HOUR),
      sentKeys: new Set<TrialEmailKey>([
        "first_debrief_replay",
        "objection_60sec",
        "pattern_tease",
        "user_story",
        "weekly_report_checkin",
        "life_matrix_reveal",
        "value_recap",
        "trial_ended_day14",
      ]),
    });
    // Once already-sent, the day14 branch is gated off. No other branch
    // matches a just-expired-trial standard user.
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).toBeNull();
  });
});

describe("trial_ended_day14 — mutual exclusion with trial_ending_day13", () => {
  it("trial_ending_day13 fires when trial ends in 12h (still future)", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() + 12 * HOUR),
      sentKeys: new Set<TrialEmailKey>([
        "first_debrief_replay",
        "objection_60sec",
        "pattern_tease",
        "user_story",
        "weekly_report_checkin",
        "life_matrix_reveal",
        "value_recap",
      ]),
    });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).toBe(
      "trial_ending_day13"
    );
  });

  it("trial_ended_day14 fires when trial ended 12h ago (past)", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - 12 * HOUR),
      sentKeys: new Set<TrialEmailKey>([
        "first_debrief_replay",
        "objection_60sec",
        "pattern_tease",
        "user_story",
        "weekly_report_checkin",
        "life_matrix_reveal",
        "value_recap",
        "trial_ending_day13",
      ]),
    });
    expect(nextEmailForUser(candidate, "STANDARD", NOW)).toBe(
      "trial_ended_day14"
    );
  });
});

describe("trial_ended_day14 — REACTIVATION lane unaffected", () => {
  it("REACTIVATION users never see trial_ended_day14 (they get the reactivation sequence instead)", () => {
    const candidate = makeCandidate({
      trialEndsAt: new Date(NOW.getTime() - HOUR),
      firstRecordingAt: null,
      onboardingTrack: "REACTIVATION",
      sentKeys: new Set<TrialEmailKey>([]),
    });
    const next = nextEmailForUser(candidate, "REACTIVATION", NOW);
    // REACTIVATION returns one of its own keys or null — never the
    // standard-lane day14.
    expect(next).not.toBe("trial_ended_day14");
  });
});

describe("trial_ended_day14 — template registry + render", () => {
  it("trial_ended_day14 is registered in TRIAL_EMAIL_TEMPLATES", () => {
    expect(TRIAL_EMAIL_TEMPLATES.trial_ended_day14).toBeDefined();
    expect(typeof TRIAL_EMAIL_TEMPLATES.trial_ended_day14.subject).toBe(
      "function"
    );
    expect(typeof TRIAL_EMAIL_TEMPLATES.trial_ended_day14.html).toBe("function");
  });

  it("subject matches spec", () => {
    const subject = TRIAL_EMAIL_TEMPLATES.trial_ended_day14.subject({
      firstName: "Jim",
      appUrl: "https://www.getacuity.io",
      trialEndsAt: "May 14",
      trialEndsAtRaw: NOW,
      totalRecordings: 12,
      topTheme: null,
      firstDebriefTaskCount: null,
      foundingMemberNumber: null,
      unsubscribeUrl: "https://www.getacuity.io/api/emails/unsubscribe?token=x",
    });
    expect(subject).toBe("Your Acuity trial just ended");
  });

  it("html renders firstName, the new-tier framing, and the Option-C-compliant CTA", () => {
    const html = TRIAL_EMAIL_TEMPLATES.trial_ended_day14.html({
      firstName: "Jim",
      appUrl: "https://www.getacuity.io",
      trialEndsAt: "May 14",
      trialEndsAtRaw: NOW,
      totalRecordings: 12,
      topTheme: null,
      firstDebriefTaskCount: null,
      foundingMemberNumber: null,
      unsubscribeUrl: "https://www.getacuity.io/api/emails/unsubscribe?token=x",
    });
    // Personalization
    expect(html).toContain("Jim");
    // v1.1 free-tier framing keywords
    expect(html).toContain("Recording stays free");
    expect(html).toMatch(/Themes.*weekly insights.*Life Matrix/);
    // CTA copy is Option C compliant — the visible CTA text
    expect(html).toContain("Continue on web to unlock");
    // Routes to the correct upgrade source
    expect(html).toContain("/upgrade?src=trial_end_email");
    // Compliance: forbidden phrases per docs/APPLE_IAP_DECISION.md §C
    expect(html).not.toMatch(/\$\d/); // no "$12.99" etc
    expect(html).not.toMatch(/\/mo\b/);
    expect(html).not.toContain("Subscribe");
    expect(html).not.toContain("Upgrade now");
  });
});

// Sanity: orchestrator types are exported for these tests.
describe("orchestrator type exports", () => {
  it("exports Track + CandidateUser + nextEmailForUser", () => {
    const t: Track = "STANDARD";
    const c: CandidateUser = makeCandidate();
    const out = nextEmailForUser(c, t, NOW);
    // Either null or a TrialEmailKey — type-only assertion via the
    // narrowed union, not a value assertion.
    expect(out === null || typeof out === "string").toBe(true);
  });
});
