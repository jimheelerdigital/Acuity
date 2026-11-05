import { describe, expect, it } from "vitest";

import { measuredMythicLine } from "./living-reel";
import { nonDragonBreath, riskyMotion, SAFE_MYTHIC_MOTION } from "./mythic-motion";

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
    expect(measuredMythicLine("The dragon turns its head", false)).toMatch(/A dragon may breathe/);
  });

  it("asks for unmistakable dragon fire on both paths when a dragon is in the clip", () => {
    expect(measuredMythicLine("The dragon breathes fire", true)).toMatch(/MAKE IT UNMISTAKABLE/);
    expect(measuredMythicLine("It turns its head", false, "a frost wyvern on a cliff")).toMatch(/MAKE IT UNMISTAKABLE/);
  });

  it("never mentions dragons or breath on a clip without a dragon (2026-11-05)", () => {
    for (const line of [
      measuredMythicLine("The knight raises his mirror shield", true, "a knight in white plate"),
      measuredMythicLine("The chimera rears and roars", false, "a chimera in a dark den"),
      measuredMythicLine("He swings the bow", true, "a ranger with a dragon-bone bow in dragon-plate"),
    ]) {
      expect(line).not.toMatch(/dragon|fire|UNMISTAKABLE|jet of/i);
    }
  });
});

describe("Only dragons breathe (2026-11-01)", () => {
  it("blocks breath attacks on other beasts", () => {
    expect(nonDragonBreath("The griffin rears back and breathes a long jet of fire into the sky", "a griffin on a cliff")).toBeTruthy();
    expect(nonDragonBreath("The behemoth breathes fire across the valley", "a horned behemoth")).toBeTruthy();
  });

  it("allows dragon-kind breath and ordinary breathing", () => {
    expect(nonDragonBreath("It opens its jaws and breathes a long jet of ice", "a frost wyvern")).toBeNull();
    expect(nonDragonBreath("The dragon breathes fire into the sky")).toBeNull();
    expect(nonDragonBreath("The griffin breathes slowly as its eyes glow")).toBeNull();
    expect(nonDragonBreath(SAFE_MYTHIC_MOTION)).toBeNull();
  });
});
