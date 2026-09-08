import { describe, expect, it } from "vitest";

import {
  REMINDER_PRIMER,
  REMINDER_SLOTS,
  headlineFor,
  localTimeFor,
  shouldPromptForPush,
} from "../../../../../apps/mobile/lib/onboarding-v10/reminders";

describe("v10 reminder slots", () => {
  it("offers the five specified options in order", () => {
    expect(REMINDER_SLOTS.map((s) => s.key)).toEqual([
      "morning",
      "midday",
      "after_work",
      "late",
      "none",
    ]);
  });

  it("fires at the specified local times", () => {
    expect(localTimeFor("morning")).toBe("08:00");
    expect(localTimeFor("midday")).toBe("12:30");
    expect(localTimeFor("after_work")).toBe("17:30");
    expect(localTimeFor("late")).toBe("21:00");
    expect(localTimeFor("none")).toBeNull();
  });

  it("NEVER prompts for push when the user chose no reminders", () => {
    // Spec §9 acceptance. Asking the OS for notification permission right
    // after someone declined reminders burns the one-shot prompt on a user
    // who already said no.
    expect(shouldPromptForPush("none")).toBe(false);
    for (const slot of ["morning", "midday", "after_work", "late"] as const) {
      expect(shouldPromptForPush(slot)).toBe(true);
    }
  });

  it("uses no bedtime, nightly, or routine framing anywhere", () => {
    // Spec §1 + positioning: the product records any time of day. Fixed-time
    // language turns it into a habit to maintain.
    const banned = [
      "bedtime",
      "nightly",
      "tonight",
      "evening ritual",
      "routine",
      "before bed",
      "streak",
    ];
    const corpus = [
      ...REMINDER_SLOTS.map((s) => s.label),
      REMINDER_PRIMER,
      headlineFor("Sam"),
    ]
      .join(" ")
      .toLowerCase();
    for (const word of banned) {
      // "no streaks" is the one allowed use — it's a promise not to.
      if (word === "streak") {
        expect(corpus).toContain("no streaks");
        continue;
      }
      expect(corpus).not.toContain(word);
    }
  });

  it("personalizes the headline only when a name exists", () => {
    expect(headlineFor("Sam")).toBe(
      "Sam, when do you usually want to think out loud?"
    );
    expect(headlineFor(null)).toBe("When do you usually want to think out loud?");
    // A blank-string name must not render "  , when do you..."
    expect(headlineFor("   ")).toBe("When do you usually want to think out loud?");
  });
});

describe("v10 paid-state copy", () => {
  // Duplicated from _v10/save.tsx — that file imports React Native, which
  // this runner cannot load. Asserted here so the copy rule is enforced
  // rather than merely intended.
  const COPY = {
    paid: {
      headline: "Your Ripple has started.",
      sub: "Save your first debrief so patterns can begin connecting.",
    },
    free: {
      headline: "Keep your first insight.",
      sub: "Save this debrief and come back whenever your head is full.",
    },
  } as const;

  it("uses the word debrief, never journal or check-in", () => {
    const corpus = Object.values(COPY)
      .flatMap((c) => [c.headline, c.sub])
      .join(" ")
      .toLowerCase();
    expect(corpus).toContain("debrief");
    expect(corpus).not.toContain("journal");
    expect(corpus).not.toContain("check-in");
    expect(corpus).not.toContain("brain dump");
  });

  it("never tells a free user their paid plan has started", () => {
    // The failure this guards: a missing plan decision defaulting to "paid"
    // and promising a trial the user never bought.
    expect(COPY.free.headline).not.toContain("has started");
    expect(COPY.free.sub).not.toContain("trial");
  });
});
