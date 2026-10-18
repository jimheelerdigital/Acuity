import { describe, expect, it } from "vitest";

import {
  canSubmitLines,
  composeDebriefText,
  FIRST_DEBRIEF_MAX_CHARS,
  FIRST_DEBRIEF_MIN_CHARS,
  initialLines,
  isPrefilled,
  joinNatural,
  saidLine,
  sentenceCase,
} from "./first-debrief-prefill";

describe("joinNatural / sentenceCase", () => {
  it("reads like a sentence", () => {
    expect(joinNatural([])).toBe("");
    expect(joinNatural(["Kids"])).toBe("Kids");
    expect(joinNatural(["Kids", "A demanding job"])).toBe("Kids and A demanding job");
    expect(joinNatural(["Kids", "A demanding job", "My own health"])).toBe("Kids, A demanding job, and My own health");
    expect(sentenceCase("A demanding job")).toBe("a demanding job");
    expect(sentenceCase("Mom's appointment")).toBe("mom's appointment");
    expect(sentenceCase("PTA meeting")).toBe("PTA meeting");
  });
});

describe("saidLine", () => {
  it("plate (v9) and quote (v8) framings; null when empty", () => {
    expect(saidLine({ said: "kids and a demanding job", saidKind: "plate" }, "ripple")).toBe("You said kids and a demanding job is on your plate.");
    expect(saidLine({ said: "training and money pressure", saidKind: "plate" }, "bwk")).toBe("You said training and money pressure is what you're carrying.");
    expect(saidLine({ said: "My head’s too full and I keep forgetting things", saidKind: "quote" }, "ripple")).toBe(
      "You said: “My head’s too full and I keep forgetting things.”"
    );
    expect(saidLine({ said: "" }, "ripple")).toBeNull();
    expect(saidLine(null, "ripple")).toBeNull();
  });
});

describe("initialLines / isPrefilled", () => {
  it("always three lines; prefilled only when the funnel gave something", () => {
    expect(initialLines(undefined)).toEqual(["", "", ""]);
    expect(initialLines({ lines: ["Sign the school form"] })).toEqual(["Sign the school form", "", ""]);
    expect(initialLines({ lines: ["a", "b", "c", "d"] })).toEqual(["a", "b", "c"]);
    expect(isPrefilled(undefined)).toBe(false);
    expect(isPrefilled({ said: " " })).toBe(false);
    expect(isPrefilled({ said: "kids" })).toBe(true);
    expect(isPrefilled({ lines: ["", "Pay the bills"] })).toBe(true);
  });
});

describe("composeDebriefText", () => {
  it("one, two and three lines become one spoken-sounding sentence", () => {
    expect(composeDebriefText(["Book the dentist", "", ""])).toBe("The thing I'd most like off my mind is book the dentist.");
    expect(composeDebriefText(["Book the dentist", "Pay the bills.", ""])).toBe(
      "The two things I'd most like off my mind are book the dentist and pay the bills."
    );
    expect(composeDebriefText(["Sign the school form", "Book Mom’s appointment", "Block an hour for yourself"])).toBe(
      "The three things I'd most like off my mind are sign the school form, book Mom’s appointment, and block an hour for yourself."
    );
  });

  it("appends the free-text tail and respects the server cap", () => {
    expect(composeDebriefText(["Pay the bills", "", ""], "  Also I haven't slept well. ")).toBe(
      "The thing I'd most like off my mind is pay the bills. Also I haven't slept well."
    );
    const long = composeDebriefText(["x", "", ""], "y".repeat(5000));
    expect(long.length).toBe(FIRST_DEBRIEF_MAX_CHARS);
  });

  it("canSubmitLines: needs a line, and the result clears the server minimum", () => {
    expect(canSubmitLines(["", "", ""])).toBe(false);
    expect(canSubmitLines(["", "", ""], "free text alone is not enough")).toBe(false);
    expect(canSubmitLines(["x", "", ""])).toBe(true); // lead phrase carries it past 10 chars
    expect(composeDebriefText(["x", "", ""]).length).toBeGreaterThanOrEqual(FIRST_DEBRIEF_MIN_CHARS);
  });
});
