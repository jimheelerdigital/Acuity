import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * OTA native-module safety (2026-10-18).
 *
 * The app uses runtimeVersion { policy: "appVersion" }, so an OTA published
 * for "1.9.4" reaches every 1.9.4 binary — including build 183, which was
 * built BEFORE expo-image-picker / expo-image-manipulator were added for
 * handwriting capture. Those packages call requireNativeModule() when their
 * JS is first evaluated, and that throws on a binary without them. A static
 * `import` anywhere in the app would therefore crash the screen (or the app)
 * on 183 the moment the OTA lands.
 *
 * Rule pinned here: native modules newer than the oldest live binary for
 * the current runtime may only be reached through `import()` / a type-only
 * import, behind a requireOptionalNativeModule() check
 * (apps/mobile/lib/handwriting-capture.ts). When 1.9.5 becomes the oldest
 * binary on its runtime, these entries can move out of the list.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const MOBILE = join(REPO, "apps", "mobile");

/** Native packages absent from build 183 (1.9.4). */
const NOT_IN_OLDEST_BINARY = ["expo-image-picker", "expo-image-manipulator"];

const SKIP_DIRS = new Set(["node_modules", "ios", "android", ".expo", "dist", "build", "targets"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

describe("OTA-safe native imports (apps/mobile)", () => {
  const files = sourceFiles(MOBILE);

  it("finds the mobile sources (guard against a silently empty scan)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const pkg of NOT_IN_OLDEST_BINARY) {
    it(`${pkg} is never imported statically`, () => {
      const esc = pkg.replace(/[-/]/g, "\\$&");
      // `import x from "pkg"`, `import * as x from "pkg"`, `import "pkg"`,
      // `export … from "pkg"`, `require("pkg")` — but NOT `import type`
      // (erased at compile time) and NOT `import("pkg")` (lazy).
      const staticImport = new RegExp(
        String.raw`(^|\n)\s*(import(?!\s+type\b)[^;\n]*?from\s*|import\s*|export[^;\n]*?from\s*)["']${esc}(/[^"']*)?["']|require\(\s*["']${esc}(/[^"']*)?["']\s*\)`
      );
      const offenders = files
        .filter((f) => staticImport.test(readFileSync(f, "utf8")))
        .map((f) => relative(REPO, f));
      expect(offenders, `static import of ${pkg} would crash build 183 after an OTA`).toEqual([]);
    });
  }

  it("the handwriting module checks the binary before showing the camera", () => {
    const src = readFileSync(join(MOBILE, "lib", "handwriting-capture.ts"), "utf8");
    expect(src).toMatch(/requireOptionalNativeModule\(PICKER_NATIVE\)/);
    expect(src).toMatch(/requireOptionalNativeModule\(MANIPULATOR_NATIVE\)/);
    expect(src).toMatch(/import\("expo-image-picker"\)/);
    expect(src).toMatch(/import\("expo-image-manipulator"\)/);
    const record = readFileSync(join(MOBILE, "app", "record.tsx"), "utf8");
    expect(record).toMatch(/onAddPhoto=\{handwritingCaptureAvailable\(\) \? promptPhotoSource : undefined\}/);
  });
});
