import { describe, expect, it } from "vitest";

import { measuredMythicLine } from "./living-reel";
import { riskyMotion, SAFE_MYTHIC_MOTION } from "./mythic-motion";

describe("Mythicals motion phrase check (loosened 2026-10-27)", () => {
  it("still blocks the two hard limits: things appearing, and figures meeting mid-action", () => {
    expect(riskyMotion("The wyvern rises under the falling rider and catches him on its back")).toBeTruthy();
    expect(riskyMotion("A warlord steps into frame beside the basilisk")).toBeTruthy();
    expect(riskyMotion("The rider leaps onto the dragon's back")).toBeTruthy();
    expect(riskyMotion("A dragon emerges from the clouds behind them")).toBeTruthy();
  });

  it("allows bold action again", () => {
    expect(riskyMotion("The bear rears onto its hind legs and roars as the knight raises his tower shield")).toBeNull();
    expect(riskyMotion("The raider and the chimera charge forward a few heavy strides, the axe swinging overhead")).toBeNull();
    expect(riskyMotion("The dragon spreads its wings wide and breathes a long jet of fire into the sky")).toBeNull();
  });

  it("keeps the fallback itself safe", () => {
    expect(riskyMotion(SAFE_MYTHIC_MOTION)).toBeNull();
  });
});

describe("Mythicals clip direction around the Action", () => {
  it("lets grounded clips follow the Action with powers, but nothing new arriving", () => {
    const line = measuredMythicLine("The paladin swings his greatsword", true);
    expect(line).toMatch(/full energy/);
    expect(line).toMatch(/Nothing new arrives in the sky or background/);
    expect(line).not.toMatch(/no charging/);
  });

  it("keeps the measured best-era line for ungrounded clips", () => {
    expect(measuredMythicLine("anything", false)).toMatch(/A dragon may breathe/);
  });
});
