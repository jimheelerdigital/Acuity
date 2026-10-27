import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.NEW_PRICING_ENABLED = "1";
});

import { paywallWinback1, paywallWinback2, paywallWinback3 } from "./paywall-winback";
import type { TrialVars } from "./types";

const base: TrialVars = {
  firstName: "Sarah",
  appUrl: "https://goripple.io",
  trialEndsAt: "Nov 2",
  trialEndsAtRaw: null,
  totalRecordings: 1,
  topTheme: "Work",
  firstDebriefTaskCount: 4,
  foundingMemberNumber: null,
  unsubscribeUrl: "https://goripple.io/unsub",
  signInUrl: "https://goripple.io/app-signin?t=abc",
  firstDebriefTasks: ["Call the dentist", "Sign the <permission> slip", "Book Mom's appointment"],
};
const noDebrief: TrialVars = { ...base, totalRecordings: 0, topTheme: null, firstDebriefTaskCount: null, firstDebriefTasks: [], signInUrl: null };

describe("paywall win-back emails", () => {
  for (const [name, tpl] of [["#1", paywallWinback1], ["#2", paywallWinback2], ["#3", paywallWinback3]] as const) {
    it(`${name}: every variant renders with and without a first debrief`, () => {
      expect(tpl.variants?.length).toBe(2);
      for (const v of tpl.variants!) {
        for (const vars of [base, noDebrief]) {
          expect(v.subject(vars).length).toBeGreaterThan(5);
          const html = v.html(vars);
          expect(html).toContain("unsub");
          expect(html).not.toMatch(/undefined|null/);
          expect(html).not.toMatch(/brain dump|therap|nightly|60-second/i);
        }
      }
    });
  }

  it("#1 quotes her own to-dos, escaped, and falls back without them", () => {
    const v = paywallWinback1.variants![0];
    expect(v.subject(base)).toBe("Your 4 to-dos are saved");
    const html = v.html(base);
    expect(html).toContain("Call the dentist");
    expect(html).toContain("&lt;permission&gt;");
    expect(html).toContain("https://goripple.io/get?utm_source=email&utm_medium=email&utm_campaign=paywall_winback");
    expect(html).toContain("$0 today");
    const fallback = v.html(noDebrief);
    expect(fallback).toContain("weekly report");
    expect(fallback).not.toContain("app-signin");
    expect(v.subject(noDebrief)).toBe("Your Ripple is saved");
  });

  it("#2 shows live prices, #3 asks for a reply", () => {
    const html2 = paywallWinback2.variants![0].html(base);
    expect(html2).toMatch(/\$\d+\.\d\d\/month/);
    expect(html2).toMatch(/\$\d+\.\d\d\/year/);
    expect(html2).toContain("2 taps");
    const html3 = paywallWinback3.variants![0].html(base);
    expect(html3).toContain("price");
    expect(html3).toContain("hit reply");
  });
});
