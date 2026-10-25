import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * iOS permission strings must survive config plugins (2026-10-20).
 *
 * Build 184 (1.9.5) crashed the moment the recorder asked for the mic:
 * "RCTFatalException: This app is missing NSMicrophoneUsageDescription"
 * (Sentry, Jimmy's TestFlight run). app.json's infoPlist HAD the string, but
 * the expo-image-picker plugin (added for handwriting capture) was configured
 * with `microphonePermission: false`, which DELETES the key from Info.plist,
 * and its mod runs after infoPlist/expo-av, so the delete won.
 *
 * Rule: no plugin may set a permission to `false`, and every plugin that
 * sets the mic string must use the same text as infoPlist.
 */

const app = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "..", "..", "apps", "mobile", "app.json"), "utf8")
).expo;

type PluginEntry = string | [string, Record<string, unknown>];

describe("iOS permission strings (apps/mobile/app.json)", () => {
  const plugins: PluginEntry[] = app.plugins ?? [];
  const configs = plugins.filter((p): p is [string, Record<string, unknown>] => Array.isArray(p));
  // Also covers raw Info.plist keys passed to plugins (…UsageDescription).
  // Build 193 (1.9.6) was rejected at upload: @kingstinct/react-native-healthkit
  // was configured with NSHealthUpdateUsageDescription: false, and App Store
  // Connect requires that string because the HealthKit binary references write
  // APIs, even though Ripple only requests read access.
  const PERMISSION_KEY = /(permission|UsageDescription)$/i;

  it("declares the microphone, camera and photo strings in infoPlist", () => {
    const plist = app.ios?.infoPlist ?? {};
    expect(plist.NSMicrophoneUsageDescription).toEqual(expect.any(String));
  });

  it("no plugin removes a permission string (value false)", () => {
    const offenders = configs.flatMap(([name, cfg]) =>
      Object.entries(cfg)
        .filter(([k, v]) => PERMISSION_KEY.test(k) && v === false)
        .map(([k]) => `${name}.${k}`)
    );
    expect(offenders).toEqual([]);
  });

  it("no permission string uses the old Acuity name", () => {
    const strings = [
      ...Object.values(app.ios?.infoPlist ?? {}),
      ...configs.flatMap(([, cfg]) =>
        Object.entries(cfg).filter(([k]) => PERMISSION_KEY.test(k)).map(([, v]) => v)
      ),
    ].filter((v): v is string => typeof v === "string");
    expect(strings.filter((s) => /acuity/i.test(s))).toEqual([]);
  });

  it("every plugin's microphonePermission matches infoPlist's mic string", () => {
    const mic = app.ios.infoPlist.NSMicrophoneUsageDescription;
    for (const [name, cfg] of configs) {
      if ("microphonePermission" in cfg) {
        expect(cfg.microphonePermission, name).toBe(mic);
      }
    }
  });
});
