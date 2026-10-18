import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The iOS widget silently shipped broken for weeks (1.9.3, 1.9.4 build 177)
 * because `@bacons/apple-targets`' native module (`ExtensionStorage`, the
 * only thing that writes to the App Group the widget reads) was never
 * compiled into the app. Its podspec requires iOS 16.4 and the app's
 * Podfile platform was Expo's default 15.1, so Expo autolinking skipped
 * the pod — printing nothing unless `pod install --verbose`. The JS side
 * then falls back to a no-op stub, so every "widget publish" succeeded
 * without writing a byte.
 *
 * This test pins the two facts that have to stay true together:
 *   1. app.json declares an iOS deployment target via expo-build-properties
 *      that is >= every autolinked podspec we depend on for the widget.
 *   2. The @bacons/apple-targets podspec still says what we think it says
 *      (if a package bump raises it again, this fails before EAS
 *      silently succeeds).
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const APP_JSON = join(REPO, "apps", "mobile", "app.json");

function parseVersion(v: string): number[] {
  return v.split(".").map((n) => Number.parseInt(n, 10) || 0);
}

function gte(a: string, b: string): boolean {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

function findPodspec(): string | null {
  const candidates = [
    join(REPO, "node_modules", "@bacons", "apple-targets", "ios", "ExtensionStorage.podspec"),
    join(REPO, "apps", "mobile", "node_modules", "@bacons", "apple-targets", "ios", "ExtensionStorage.podspec"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

describe("iOS deployment target covers the widget's native module", () => {
  const appJson = JSON.parse(readFileSync(APP_JSON, "utf8")) as {
    expo: { plugins?: unknown[] };
  };

  const buildProps = (appJson.expo.plugins ?? []).find(
    (p) => Array.isArray(p) && p[0] === "expo-build-properties"
  ) as [string, { ios?: { deploymentTarget?: string } }] | undefined;

  it("declares expo-build-properties with ios.deploymentTarget", () => {
    expect(buildProps, "expo-build-properties plugin missing from app.json").toBeDefined();
    expect(buildProps?.[1]?.ios?.deploymentTarget).toMatch(/^\d+\.\d+$/);
  });

  it("deployment target is >= 16.4 (ExtensionStorage.podspec minimum)", () => {
    const target = buildProps?.[1]?.ios?.deploymentTarget ?? "0.0";
    expect(gte(target, "16.4"), `ios.deploymentTarget ${target} < 16.4`).toBe(true);
  });

  it("deployment target is >= whatever the installed podspec requires", () => {
    const podspec = findPodspec();
    if (!podspec) return; // mobile deps not installed in this checkout
    const src = readFileSync(podspec, "utf8");
    const m = src.match(/s\.platform\s*=\s*:ios,\s*['"](\d+\.\d+)['"]/);
    expect(m, "could not read s.platform from ExtensionStorage.podspec").not.toBeNull();
    const required = m![1];
    const target = buildProps?.[1]?.ios?.deploymentTarget ?? "0.0";
    expect(
      gte(target, required),
      `ios.deploymentTarget ${target} < podspec minimum ${required}; autolinking would silently drop ExtensionStorage`
    ).toBe(true);
  });
});
