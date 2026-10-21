/**
 * Install-id analytics (Keenan, 2026-10-20) — structural guards.
 *
 *   1. Every mobile sign-in call sends X-Ripple-Install-Id, so the server
 *      can stamp app_signed_in and backfill the install's earlier events.
 *      A new sign-in call without it would silently orphan that person's
 *      pre-sign-in funnel.
 *   2. app_signed_in stays server-only: the events endpoint must refuse it.
 *   3. The paywall emits every outcome event Keenan's funnel reads.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repo = path.resolve(__dirname, "../../../../..");
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

describe("install id on sign-in", () => {
  const files = ["apps/mobile/lib/auth.ts", "apps/mobile/lib/apple-auth.ts"];
  const endpoints = /\/api\/auth\/(mobile-login|mobile-email-code\/verify|mobile-complete|mobile-callback|mobile-callback-apple)`/g;

  it("every mobile sign-in fetch carries the install id header", () => {
    let seen = 0;
    for (const f of files) {
      const src = read(f);
      for (const m of src.matchAll(endpoints)) {
        seen++;
        const call = src.slice(m.index!, m.index! + 300);
        expect(call, `${f} → ${m[1]}`).toContain("installIdHeader()");
      }
    }
    expect(seen).toBe(5);
  });
});

describe("events endpoint", () => {
  it("accepts app_* but refuses the server-only app_signed_in", () => {
    const src = read("apps/web/src/app/api/onboarding-events/route.ts");
    expect(src).toMatch(/APP_EVENT_RE = \/\^app_\[a-z0-9_\]\+\$\//);
    expect(src).toMatch(/SERVER_ONLY_EVENTS = new Set\(\["app_signed_in"\]\)/);
    expect(src).toMatch(/SERVER_ONLY_EVENTS\.has\(event\) \|\|/);
  });
});

describe("paywall outcome events", () => {
  it("emits started / completed / cancelled / failed / restore", () => {
    const src = read("apps/mobile/app/onboarding-new/_v10/paywall.tsx");
    for (const e of ["v10_purchase_started", "v10_purchase_completed", "v10_purchase_cancelled", "v10_purchase_failed", "v10_restore_tapped"]) {
      expect(src, e).toContain(`trackV10("${e}"`);
    }
  });
});
