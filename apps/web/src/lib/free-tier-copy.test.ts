import { describe, expect, it } from "vitest";

import {
  FREE_TIER_LOCKED_COPY,
  freeTierUpgradeUrl,
  type FreeTierLockedSurfaceId,
} from "@acuity/shared";

describe("FREE_TIER_LOCKED_COPY — Apple Review compliance (Option C)", () => {
  // Each entry's copy must NOT contain banned tokens that would trip
  // §3.1.1 review (no $, no /mo, no Subscribe, no Upgrade as a verb).
  // The CTA label "Continue on web →" is the canonical single CTA.
  const BANNED = ["$", "/mo", "Subscribe", "Upgrade"];

  for (const id of Object.keys(FREE_TIER_LOCKED_COPY) as FreeTierLockedSurfaceId[]) {
    const entry = FREE_TIER_LOCKED_COPY[id];
    it(`${id} body has no banned tokens`, () => {
      for (const token of BANNED) {
        expect(entry.body).not.toContain(token);
        if (entry.title) expect(entry.title).not.toContain(token);
        if (entry.eyebrow) expect(entry.eyebrow).not.toContain(token);
      }
    });
    it(`${id} CTA label is "Continue on web →"`, () => {
      expect(entry.ctaLabel).toBe("Continue on web →");
    });
  }
});

describe("FREE_TIER_LOCKED_COPY — surface coverage", () => {
  it("includes all six §B.2 surfaces", () => {
    const expected: FreeTierLockedSurfaceId[] = [
      "pro_pulse_home",
      "life_matrix_locked",
      "goals_suggestions_locked",
      "tasks_empty_state",
      "theme_map_locked",
      "entry_detail_footer",
    ];
    for (const id of expected) {
      expect(FREE_TIER_LOCKED_COPY[id]).toBeDefined();
      expect(FREE_TIER_LOCKED_COPY[id].id).toBe(id);
    }
  });

  it("entry_detail_footer is body-only (no eyebrow, no title — inline footer)", () => {
    const entry = FREE_TIER_LOCKED_COPY.entry_detail_footer;
    expect(entry.eyebrow).toBeUndefined();
    expect(entry.title).toBeUndefined();
    expect(entry.body.length).toBeGreaterThan(0);
  });

  it("tasks_empty_state has no eyebrow (it IS the empty state, not an overlay)", () => {
    expect(FREE_TIER_LOCKED_COPY.tasks_empty_state.eyebrow).toBeUndefined();
  });

  it("Pro-eyebrowed surfaces all use 'Pro' (not 'PRO' / 'Premium')", () => {
    const proEyebrowSurfaces: FreeTierLockedSurfaceId[] = [
      "pro_pulse_home",
      "life_matrix_locked",
      "goals_suggestions_locked",
      "theme_map_locked",
    ];
    for (const id of proEyebrowSurfaces) {
      expect(FREE_TIER_LOCKED_COPY[id].eyebrow).toBe("Pro");
    }
  });
});

describe("freeTierUpgradeUrl", () => {
  it("appends ?src= per surface id for funnel attribution", () => {
    const url = freeTierUpgradeUrl(
      "https://app.getacuity.io",
      "pro_pulse_home"
    );
    expect(url).toBe("https://app.getacuity.io/upgrade?src=pro_pulse_home");
  });

  it("trims trailing slashes on baseUrl to keep a canonical shape", () => {
    const a = freeTierUpgradeUrl("https://app.getacuity.io/", "tasks_empty_state");
    const b = freeTierUpgradeUrl("https://app.getacuity.io//", "tasks_empty_state");
    const c = freeTierUpgradeUrl("https://app.getacuity.io", "tasks_empty_state");
    expect(a).toBe(c);
    expect(b).toBe(c);
  });
});
