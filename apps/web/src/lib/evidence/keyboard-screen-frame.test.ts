/**
 * Keyboard avoidance inside iOS sheets (2026-10-22).
 *
 * In a sheet (expo-router presentation "modal", RN <Modal pageSheet>)
 * measureInWindow is sheet-relative. KeyboardSafeView compared that to the
 * full window height and left the typed composer's Save button under the
 * keyboard (Jimmy's phone: y=74 h=806 window=956 keyboard=347 gap=76).
 * The fix measures against the enclosing ScreenFrame in the same space.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mobile = path.resolve(__dirname, "../../../../mobile");
const read = (p: string) => readFileSync(path.join(mobile, p), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe("KeyboardSafeView measures against the screen it is in", () => {
  it("every stack screen is wrapped in a ScreenFrame", () => {
    expect(read("app/_layout.tsx")).toMatch(/screenLayout=\{\(\{ children \}\) => <ScreenFrame>\{children\}<\/ScreenFrame>\}/);
  });

  it("KeyboardSafeView uses the screen frame, not the raw window height, when it has one", () => {
    const src = read("components/keyboard/keyboard-safe-view.tsx");
    expect(src).toContain("useScreenFrame()");
    expect(src).toContain("frame.measureBottom(");
    expect(src).toMatch(/frameBottom - \(y \+ h\)/);
  });

  it("a pageSheet <Modal> hosting a KeyboardSafeView has its own ScreenFrame", () => {
    const offenders = walk(path.join(mobile, "components"))
      .concat(walk(path.join(mobile, "app")))
      .filter((f) => {
        const s = readFileSync(f, "utf8");
        return /presentationStyle="pageSheet"/.test(s) && s.includes("<KeyboardSafeView") && !s.includes("<ScreenFrame>");
      })
      .map((f) => path.relative(mobile, f));
    expect(offenders).toEqual([]);
  });
});
