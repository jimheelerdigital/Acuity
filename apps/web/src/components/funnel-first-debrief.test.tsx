import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// lucide-react resolves a second copy of React from the workspace root in
// this symlinked checkout; icons are not what this test is about.
vi.mock("lucide-react", () => ({
  Keyboard: () => createElement("i", { "data-icon": "keyboard" }),
  Mic: () => createElement("i", { "data-icon": "mic" }),
}));

import { FunnelFirstDebrief } from "./funnel-first-debrief";

/**
 * Server-render smoke test of the pre-filled first debrief (no jsdom in this
 * suite). Pins the structure the audit asked for: her answer up top, three
 * labelled lines when typing, Skip demoted to a quiet "Not now" at the end.
 */
function html(props: Partial<Parameters<typeof FunnelFirstDebrief>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(FunnelFirstDebrief, {
      brand: "ripple",
      firstName: "Sarah",
      track: () => {},
      onDone: () => {},
      ...props,
    })
  );
}

describe("FunnelFirstDebrief markup", () => {
  it("opens with her plate answer and the three-things ask; Skip is a small 'Not now' at the end", () => {
    const out = html({ prefill: { said: "kids and a demanding job", saidKind: "plate", lines: ["Sign the school form", "Book the dentist"] } });
    expect(out).toContain("You said kids and a demanding job is on your plate.");
    expect(out).toContain("Name the three things you");
    // Voice mode shows the picks as chips above the mic.
    expect(out).toContain("Sign the school form");
    expect(out).toContain("Book the dentist");
    expect(out).not.toContain("Skip, I");
    expect(out).toContain("Not now");
    expect(out.lastIndexOf("Not now")).toBeGreaterThan(out.lastIndexOf("Start recording"));
  });

  it("v8 quote framing", () => {
    const out = html({ prefill: { said: "My head’s too full and I keep forgetting things", saidKind: "quote" } });
    expect(out).toContain("You said: “My head’s too full and I keep forgetting things.”");
  });

  it("no prefill → no 'You said' line, still three-things ask and Not now", () => {
    const out = html();
    expect(out).not.toContain("You said");
    expect(out).toContain("Name the three things you");
    expect(out).toContain("Not now");
  });

  it("copy rules: debrief wording, no time-of-day words, no duration claims, no therapy claims, no escape links", () => {
    const out = html({ prefill: { said: "kids", saidKind: "plate", lines: ["a", "b", "c"] } });
    expect(out).toContain("first debrief");
    expect(out).not.toMatch(/brain dump|tonight|this morning|this evening|bedtime/i);
    expect(out).not.toMatch(/\b\d+ ?(seconds?|minutes?)\b/i);
    expect(out).not.toMatch(/therap|diagnos|cure/i);
    expect(out).not.toMatch(/open in safari|open in browser|x-safari|googlechrome:/i);
  });
});
