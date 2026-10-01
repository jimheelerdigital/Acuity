import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { goalFor, pickByResults, pickFromJev } from "./email-jev";
import { TRIAL_EMAIL_TEMPLATES } from "@/emails/trial/registry";
import { EMAIL_ENABLED } from "@/lib/email-enabled";
import type { TrialVars } from "@/emails/trial/types";

const vars = (lane: "women" | "men"): TrialVars => ({
  firstName: "Sam",
  appUrl: "https://goripple.io",
  trialEndsAt: "October 8",
  trialEndsAtRaw: new Date("2026-10-08"),
  totalRecordings: 12,
  topTheme: "work",
  firstDebriefTaskCount: 3,
  foundingMemberNumber: null,
  unsubscribeUrl: "https://goripple.io/u",
  signInUrl: "https://goripple.io/app-signin?t=x",
  lane,
});

describe("email-jev", () => {
  it("maps emails to goals", () => {
    expect(goalFor("app_first_record_1")).toBe("record");
    expect(goalFor("never_recorded_24h")).toBe("record");
    expect(goalFor("rescue_webview_blocked")).toBe("app");
    expect(goalFor("trial_ending")).toBe("pay");
    expect(goalFor("milestone_10")).toBe("click");
  });

  it("pickByResults favours the better smoothed rate when not exploring", () => {
    const stats = [
      { id: "a", sent: 40, goals: 4 },
      { id: "b", sent: 40, goals: 12 },
    ];
    expect(pickByResults(stats, () => 0.9)).toBe("b");
  });

  it("pickFromJev follows Jev but keeps exploration", () => {
    const ids = ["a", "b", "c"];
    const probs = { a: 1, b: 0, c: 0 };
    expect(pickFromJev(ids, probs, () => 0.1)).toBe("a");
    // exploration mass (20%/3 each) still reaches b and c at the top end
    expect(pickFromJev(ids, probs, () => 0.999)).toBe("c");
  });

  it("every live email with versions renders for both lanes with unique ids", () => {
    for (const [key, t] of Object.entries(TRIAL_EMAIL_TEMPLATES)) {
      if (!t.variants || !EMAIL_ENABLED[key]) continue;
      const ids = t.variants.map((x) => x.id);
      expect(new Set(ids).size, key).toBe(ids.length);
      for (const x of t.variants) {
        for (const lane of ["women", "men"] as const) {
          const subject = x.subject(vars(lane));
          const html = x.html(vars(lane));
          expect(subject.length, `${key}:${x.id}`).toBeGreaterThan(3);
          expect(html, `${key}:${x.id}`).toContain("Unsubscribe");
          expect(html.toLowerCase(), `${key}:${x.id}`).not.toMatch(/brain dump|nightly|before bed|60.second|90.second/);
        }
      }
    }
  });
});
