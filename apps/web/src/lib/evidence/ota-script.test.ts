import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// apps/mobile/scripts/ota.mjs is the only supported way to publish an OTA
// (it gives `eas update` the same env as a store build). Tested here
// because the web suite is the one CI runs.
import {
  findMissing,
  newExportId,
  parseArgs,
  requiredMarkers,
  resolveProfile,
  shellQuote,
} from "../../../../mobile/scripts/ota.mjs";

const easJson = JSON.parse(
  readFileSync(join(__dirname, "../../../../mobile/eas.json"), "utf8")
);

describe("ota.mjs", () => {
  it("resolves the production profile's env and channel from eas.json", () => {
    const p = resolveProfile(easJson, "production");
    expect(p.channel).toBe("production");
    expect(p.env.EXPO_PUBLIC_HABITS).toBe("true");
    expect(p.env.EXPO_PUBLIC_API_URL).toBe("https://goripple.io");
  });

  it("merges env through extends (child wins)", () => {
    const p = resolveProfile(
      { build: { a: { channel: "c", env: { X: "1", Y: "1" } }, b: { extends: "a", env: { Y: "2" } } } },
      "b"
    );
    expect(p).toMatchObject({ channel: "c", env: { X: "1", Y: "2" } });
  });

  it("requires the export id plus long EXPO_PUBLIC values, not short flags or API_URL", () => {
    const markers = requiredMarkers(resolveProfile(easJson, "production").env, "ota-x");
    const names = markers.map(([k]) => k);
    expect(names[0]).toBe("EXPO_PUBLIC_OTA_EXPORT_ID");
    expect(names).toContain("EXPO_PUBLIC_SENTRY_DSN");
    expect(names).toContain("EXPO_PUBLIC_RC_IOS_KEY");
    expect(names).not.toContain("EXPO_PUBLIC_API_URL");
    expect(names).not.toContain("EXPO_PUBLIC_HABITS");
  });

  it("flags a bundle that lacks the export id (stale cache / env not applied)", () => {
    const markers: [string, string][] = [["EXPO_PUBLIC_OTA_EXPORT_ID", "ota-abc"], ["K", "value-long-enough-123"]];
    expect(findMissing("…value-long-enough-123…", markers)).toEqual(["EXPO_PUBLIC_OTA_EXPORT_ID"]);
    expect(findMissing("ota-abc value-long-enough-123", markers)).toEqual([]);
  });

  it("export ids are unique per run", () => {
    expect(newExportId()).not.toBe(newExportId());
    expect(newExportId(new Date("2026-10-27T15:04:00Z"))).toMatch(/^ota-202610271504-[a-z0-9]+$/);
  });

  it("needs a message unless --dry-run, and validates platform", () => {
    expect(() => parseArgs([])).toThrow(/--message/);
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
    expect(() => parseArgs(["--dry-run", "--platform", "web"])).toThrow(/platform/);
  });

  it("shell-quotes values with quotes", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });
});
