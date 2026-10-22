/**
 * Settings rows never look tappable without doing anything (build 187:
 * "clicking Ripple Pro does nothing"). MenuItem shows a chevron only when
 * it has an action, and the plan row opens the right place for each plan.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "../../../../mobile/app/(tabs)/profile.tsx"), "utf8");

describe("Settings rows", () => {
  it("MenuItem: chevron + pressable only with an action", () => {
    const fn = src.slice(src.indexOf("function MenuItem("));
    expect(fn).toContain("disabled={!onPress}");
    expect(fn).toContain('{onPress ? <Ionicons name="chevron-forward"');
  });

  it("the plan row routes to Customer Center / Stripe portal / Subscribe", () => {
    const row = src.slice(src.indexOf("label={plan.title}"), src.indexOf("label={plan.title}") + 600);
    expect(row).toContain("handleManageStoreSubscription()");
    expect(row).toContain("openSubscriptionPortal()");
    expect(row).toContain('router.push("/subscribe")');
  });
});
