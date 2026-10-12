import { describe, expect, it } from "vitest";

import {
  WELCOME_TOUR_CARDS,
  isWelcomePhase,
  nextPhase,
  phasesFor,
  progressFor,
  resumePhase,
  setupSteps,
  stepOf,
  tourProgress,
} from "../../../../../apps/mobile/lib/welcome/phases";
import {
  parseWelcomeTourRequest,
  welcomeTourCards,
} from "../../../../../apps/mobile/components/tour/welcome-tour";

const rec = { habitsEnabled: true };
const recNoHabits = { habitsEnabled: false };
const web = { habitsEnabled: true, skipRecord: true };
const webNoHabits = { habitsEnabled: false, skipRecord: true };

describe("welcome flow — order (approved redesign, 2026-10-12)", () => {
  it("recorded here: consent before the recorder, results after setup", () => {
    expect(phasesFor(rec)).toEqual(["hello", "consent", "record", "notify", "habit", "results"]);
  });

  it("web debrief: no recorder, results right after consent", () => {
    expect(phasesFor(web)).toEqual(["hello", "consent", "results", "notify", "habit"]);
  });

  it("habits off and consent on file drop those steps", () => {
    expect(phasesFor(recNoHabits)).not.toContain("habit");
    expect(phasesFor({ ...webNoHabits, skipConsent: true })).toEqual(["hello", "results", "notify"]);
  });

  it("never contains a paywall", () => {
    expect(phasesFor(rec).some((p) => String(p).includes("pay"))).toBe(false);
  });

  it("nextPhase returns null at the end, where the tour takes over", () => {
    expect(nextPhase("consent", web)).toBe("results");
    expect(nextPhase("habit", web)).toBeNull();
    expect(nextPhase("results", rec)).toBeNull();
  });
});

describe("welcome flow — one progress bar across setup and tour", () => {
  it("never 0 on the first screen and keeps rising into the tour", () => {
    const list = phasesFor(web);
    const setup = list.map((p) => progressFor(p, web));
    expect(setup[0]).toBeGreaterThan(0);
    for (let i = 1; i < setup.length; i++) expect(setup[i]).toBeGreaterThan(setup[i - 1]);
    const tour = Array.from({ length: WELCOME_TOUR_CARDS }, (_, i) => tourProgress(list.length, i));
    expect(tour[0]).toBeGreaterThan(setup[setup.length - 1]);
    expect(tour[tour.length - 1]).toBe(1);
  });
});

describe("welcome flow — setup checklist", () => {
  it("lists every step after hello, then the tour", () => {
    expect(setupSteps(web).map((s) => s.key)).toEqual(["consent", "results", "notify", "habit", "tour"]);
    expect(stepOf("consent", web)).toEqual({ n: 1, of: 5 });
    expect(stepOf("tour", webNoHabits)).toEqual({ n: 4, of: 4 });
    expect(stepOf("hello", web)).toBeNull();
  });
});

describe("welcome flow — resume", () => {
  it("starts at hello", () => {
    expect(resumePhase(null, null, rec)).toBe("hello");
  });

  it("recorded here: a sent debrief jumps to setup unless they were further on", () => {
    expect(resumePhase("consent", "e1", rec)).toBe("notify");
    expect(resumePhase("record", "e1", rec)).toBe("notify");
    expect(resumePhase("habit", "e1", rec)).toBe("habit");
    expect(resumePhase("results", "e1", rec)).toBe("results");
  });

  it("recorded here: setup without a debrief goes back to consent (or the recorder)", () => {
    expect(resumePhase("record", null, rec)).toBe("record");
    expect(resumePhase("notify", null, rec)).toBe("consent");
    expect(resumePhase("notify", null, { ...rec, skipConsent: true })).toBe("record");
    expect(resumePhase("consent", null, { ...rec, skipConsent: true })).toBe("record");
  });

  it("habits off: a stored habit with a debrief lands on results", () => {
    expect(resumePhase("habit", "e1", recNoHabits)).toBe("results");
  });

  it("web debrief: resume where they were, or at the start", () => {
    expect(resumePhase(null, "w1", web)).toBe("hello");
    expect(resumePhase("results", "w1", web)).toBe("results");
    expect(resumePhase("notify", "w1", web)).toBe("notify");
    expect(resumePhase("record", "w1", web)).toBe("hello");
  });

  it("rejects junk and retired phases from storage", () => {
    expect(isWelcomePhase("paywall")).toBe(false);
    expect(isWelcomePhase("value")).toBe(false);
    expect(isWelcomePhase(3)).toBe(false);
    expect(isWelcomePhase("notify")).toBe(true);
  });
});

describe("welcome tour (last setup step, on the real tabs)", () => {
  const req = { setupScreens: 5, stepOf: 5, firstName: "Jimmy", checkInTime: "9:00 PM" };

  it("walks Home, Entries, Tasks, Growth, Insights, then a done card on Home", () => {
    const cards = welcomeTourCards(req);
    expect(cards).toHaveLength(WELCOME_TOUR_CARDS);
    // AttachStep targets in components/tour/steps.ts: mic 0, entries 2, tasks 3, insights 4, goals 5.
    expect(cards.map((c) => c.target)).toEqual([0, 2, 3, 5, 4, 0]);
    // Its own count, not the setup step number (build 158 said "4 of 4" on every stop).
    expect(cards.slice(0, 5).map((c) => c.label)).toEqual([1, 2, 3, 4, 5].map((n) => `A quick look around · ${n} of 5`));
    expect(cards[5].title).toBe("Talk to you soon, Jimmy");
    expect(cards[5].body).toContain("9:00 PM");
  });

  it("no check-in time: no promise of one", () => {
    const last = welcomeTourCards({ ...req, checkInTime: null })[5];
    expect(last.title).toBe("You're all set, Jimmy");
    expect(last.body).not.toMatch(/check in/);
  });

  it("parses the stored request defensively", () => {
    expect(parseWelcomeTourRequest(null)).toBeNull();
    expect(parseWelcomeTourRequest("not json")).toBeNull();
    expect(parseWelcomeTourRequest(JSON.stringify(req))).toEqual(req);
    expect(parseWelcomeTourRequest("{}")).toEqual({ setupScreens: 4, stepOf: 4, firstName: null, checkInTime: null });
  });
});
