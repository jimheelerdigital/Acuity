import { describe, expect, it } from "vitest";

import { riskyMotion, SAFE_MYTHIC_MOTION } from "./mythic-motion";

describe("Mythicals motion phrase check (2026-10-27)", () => {
  it("flags the motions that broke 'which beast would your bro turn into?'", () => {
    expect(riskyMotion("The wyvern rises under the falling rider and catches him on its back, its great wings snapping wide open")).toBeTruthy();
    expect(riskyMotion("The bear rears onto its hind legs and roars as the knight raises his tower shield")).toBeTruthy();
    expect(riskyMotion("The basilisk rises to full height and a warlord steps into frame")).toBeTruthy();
    expect(riskyMotion("its crest grows wider and sprouts new spikes")).toBeTruthy();
  });

  it("passes measured, best-era motions", () => {
    expect(riskyMotion("The bear lifts its head and roars, dust drifting off the granite plates on its back, as a slow push-in brings it closer")).toBeNull();
    expect(riskyMotion("The dragon opens its wings and beats them once, breathing a long jet of fire into the sky while embers drift")).toBeNull();
    expect(riskyMotion("The knight tightens his grip on the shield as the beast beside him takes two heavy steps forward")).toBeNull();
  });

  it("keeps the fallback itself safe", () => {
    expect(riskyMotion(SAFE_MYTHIC_MOTION)).toBeNull();
  });
});
