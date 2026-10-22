/**
 * Screens that can be the FIRST route (opened by the widget, a deep link,
 * Siri or a notification) must not use a bare router.back(): with no history
 * it is a silent no-op and the user is stuck (build 186, task screen Cancel).
 * They use goBackOr(fallback) from lib/navigation.ts instead.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const app = path.resolve(__dirname, "../../../../mobile/app");
const DEEP_LINKABLE = [
  "task/[id].tsx", // widget task rows: acuity://task/<id>
  "task/new.tsx",
  "habits.tsx", // acuity://habits
  "habit/[id].tsx",
  "goal/[id].tsx",
  "goal/new.tsx",
  "entry/[id].tsx", // notification taps
];

describe("deep-linkable screens can always be left", () => {
  for (const f of DEEP_LINKABLE) {
    it(f, () => {
      const src = readFileSync(path.join(app, f), "utf8");
      expect(src).not.toMatch(/router\.back\(\)/);
      expect(src).toContain("goBackOr(");
    });
  }

  it("the widget still links task rows to the task screen", () => {
    const swift = readFileSync(path.resolve(app, "../targets/widget/index.swift"), "utf8");
    expect(swift).toContain('acuity://task/\\(row.item.id)');
  });
});
