import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * App-wide keyboard handling (1.9.5, 2026-10-19).
 *
 * Jimmy on build 183: "keyboard over buttons and stuff. Hate that. Need UI
 * to be more considerate of when keyboard pops up." Root cause: 25 screens
 * with text fields, each handling the keyboard its own way — React Native
 * KeyboardAvoidingView with hand-guessed `keyboardVerticalOffset`s (the
 * typed composer guessed 96 and left Save under the keyboard), iOS-only
 * `automaticallyAdjustKeyboardInsets`, or nothing.
 *
 * The rule pinned here: one system. react-native-keyboard-controller's
 * <KeyboardProvider> at the root, and screens use
 *   - components/keyboard/keyboard-scroll.tsx  (scrolling forms), or
 *   - components/keyboard/keyboard-safe-view.tsx (pinned buttons / sheets).
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");
const MOBILE = join(REPO, "apps", "mobile");
const SKIP_DIRS = new Set(["node_modules", "ios", "android", ".expo", "dist", "build", "targets"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/** Strip comments so documentation that names the old APIs doesn't trip the scan. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

/**
 * The one exemption: the v10 save screen hosts Google/Apple sign-in and has
 * shipped with automaticallyAdjustKeyboardInsets without the 2026-04-28
 * OAuth-sheet regression. Not touched in 1.9.5 to avoid re-risking auth.
 */
const AAKI_ALLOWED = new Set(["apps/mobile/app/onboarding-new/_v10/save.tsx"]);

describe("keyboard handling (apps/mobile)", () => {
  const files = sourceFiles(MOBILE);
  const rel = (f: string) => relative(REPO, f);

  it("finds the mobile sources", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("mounts KeyboardProvider at the app root", () => {
    const layout = code(join(MOBILE, "app", "_layout.tsx"));
    expect(layout).toMatch(/import \{ KeyboardProvider \} from "react-native-keyboard-controller"/);
    expect(layout).toMatch(/<KeyboardProvider>/);
  });

  it("never uses React Native's KeyboardAvoidingView", () => {
    const offenders = files.filter((f) => /<KeyboardAvoidingView\b/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("never hand-tunes a keyboardVerticalOffset", () => {
    const offenders = files.filter((f) => /keyboardVerticalOffset/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });

  it("doesn't rely on iOS-only automaticallyAdjustKeyboardInsets", () => {
    const offenders = files
      .filter((f) => /automaticallyAdjustKeyboardInsets/.test(code(f)))
      .map(rel)
      .filter((f) => !AAKI_ALLOWED.has(f));
    expect(offenders).toEqual([]);
  });

  it("the typed composer keeps Save above the keyboard", () => {
    const record = code(join(MOBILE, "app", "record.tsx"));
    expect(record).toMatch(/<KeyboardSafeView[\s\S]*Save entry[\s\S]*<\/KeyboardSafeView>/);
  });

  it("KeyboardSafeView measures itself instead of taking an offset", () => {
    const src = code(join(MOBILE, "components", "keyboard", "keyboard-safe-view.tsx"));
    expect(src).toMatch(/measureInWindow/);
    expect(src).toMatch(/useReanimatedKeyboardAnimation/);
  });
});
