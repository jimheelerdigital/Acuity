import { describe, expect, it } from "vitest";

import {
  RECORD_AUTOSTART_URL,
  shouldAutostartRecording,
} from "../../../../../apps/mobile/lib/record-deeplink";

describe("record deep-link autostart", () => {
  it("arms on the exact documented value", () => {
    expect(shouldAutostartRecording("1")).toBe(true);
  });

  it("does NOT arm on '0'", () => {
    // A truthy check would treat the string "0" as true — the opposite of
    // what anyone writing ?autostart=0 intends.
    expect(shouldAutostartRecording("0")).toBe(false);
  });

  it("does NOT arm on an ambiguous or empty value", () => {
    // Ambiguity must never resolve toward switching on a microphone.
    expect(shouldAutostartRecording("")).toBe(false);
    expect(shouldAutostartRecording("true")).toBe(false);
    expect(shouldAutostartRecording("yes")).toBe(false);
  });

  it("does NOT arm when the param is absent", () => {
    // The in-app tap path reaches /record with no param and must keep
    // waiting for a deliberate tap.
    expect(shouldAutostartRecording(undefined)).toBe(false);
  });

  it("does NOT arm on a repeated param", () => {
    // ?autostart=1&autostart=0 is ambiguous; expo-router hands back an
    // array. Refuse rather than pick one.
    expect(shouldAutostartRecording(["1", "0"])).toBe(false);
    expect(shouldAutostartRecording(["1"])).toBe(false);
  });

  it("publishes a URL that matches the scheme and route", () => {
    // The scheme is `acuity` and stays that way — renaming it breaks live
    // Meta deep links and the magic-link callback (see rename-denylist).
    expect(RECORD_AUTOSTART_URL).toBe("acuity://record?autostart=1");
  });
});
