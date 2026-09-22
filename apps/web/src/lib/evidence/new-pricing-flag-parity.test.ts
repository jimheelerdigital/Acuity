import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `EXPO_PUBLIC_NEW_PRICING` must have exactly ONE parser on mobile.
 *
 * ── The bug this pins ────────────────────────────────────────────────
 * Two readers of the same env var disagreed:
 *
 *   lib/pricing.ts        accepted "1" | "true" | "on" | "yes"
 *   lib/feature-flags.ts  accepted only the literal "true"
 *
 * The `pricing` EAS profile sets `EXPO_PUBLIC_NEW_PRICING: "1"`. So on a
 * build with both the v10 and pricing flags on, `pricing.ts` resolved TRUE
 * (app shows $9.99) while `feature-flags.ts` resolved FALSE — and
 * `_v10/paywall.tsx` picks its tier from feature-flags, so the paywall
 * would have quoted $4.99 while the rest of the app quoted $9.99.
 *
 * That is the "a page quotes a different number than the store charges"
 * failure the tier-derived pricing refactor exists to prevent, reachable
 * the moment someone builds v10 and new pricing together.
 *
 * ── Why import by relative path ──────────────────────────────────────
 * These are mobile modules under test from the web vitest project, whose
 * `@` alias points at apps/web/src. `feature-flags.ts` therefore imports
 * `./pricing` relatively, and so does this test. `pricing.ts` itself only
 * imports `@acuity/shared`, which IS aliased here, so the graph resolves.
 */

const REPO = join(__dirname, "..", "..", "..", "..", "..");

/**
 * Load both modules fresh so the module-level env read re-evaluates.
 *
 * The specifiers are written out literally, not built from a constant —
 * Vite only resolves statically analyzable relative imports, and a
 * template literal here resolves as an absolute path and fails.
 */
async function loadBoth() {
  vi.resetModules();
  const pricing = await import("../../../../mobile/lib/pricing");
  const flags = await import("../../../../mobile/lib/feature-flags");
  return {
    canonical: pricing.newPricingEnabled as () => boolean,
    viaFlags: flags.isNewPricingEnabled as () => boolean,
  };
}

const ORIGINAL = process.env.EXPO_PUBLIC_NEW_PRICING;

beforeEach(() => {
  delete process.env.EXPO_PUBLIC_NEW_PRICING;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_NEW_PRICING;
  else process.env.EXPO_PUBLIC_NEW_PRICING = ORIGINAL;
  vi.resetModules();
});

describe("the two entry points resolve identically", () => {
  const TRUTHY = ["1", "true", "on", "yes"];
  const FALSY = ["0", "false", "off", "no", "", "  ", "ture", "TRUE!"];

  it.each(TRUTHY)("%j enables BOTH", async (value) => {
    process.env.EXPO_PUBLIC_NEW_PRICING = value;
    const { canonical, viaFlags } = await loadBoth();
    expect(canonical(), `pricing.ts on ${value}`).toBe(true);
    expect(viaFlags(), `feature-flags.ts on ${value}`).toBe(true);
    expect(viaFlags()).toBe(canonical());
  });

  it.each(FALSY)("%j disables BOTH", async (value) => {
    process.env.EXPO_PUBLIC_NEW_PRICING = value;
    const { canonical, viaFlags } = await loadBoth();
    expect(canonical(), `pricing.ts on ${value}`).toBe(false);
    expect(viaFlags(), `feature-flags.ts on ${value}`).toBe(false);
    expect(viaFlags()).toBe(canonical());
  });

  it("unset disables both — the default posture", async () => {
    // Already deleted in beforeEach.
    const { canonical, viaFlags } = await loadBoth();
    expect(canonical()).toBe(false);
    expect(viaFlags()).toBe(false);
  });

  it("agrees on case and surrounding whitespace", async () => {
    for (const value of [" TRUE ", "\tYes\n", "On", "1 "]) {
      process.env.EXPO_PUBLIC_NEW_PRICING = value;
      const { canonical, viaFlags } = await loadBoth();
      expect(viaFlags(), `disagreed on ${JSON.stringify(value)}`).toBe(
        canonical()
      );
      expect(canonical(), `${JSON.stringify(value)} should enable`).toBe(true);
    }
  });

  it("agrees on the exact value the `pricing` EAS profile ships", async () => {
    // The regression in one line: eas.json sets "1", and the old
    // feature-flags check only accepted "true".
    const eas = JSON.parse(
      readFileSync(join(REPO, "apps", "mobile", "eas.json"), "utf8")
    ) as { build: Record<string, { extends?: string; env?: Record<string, string> }> };

    const resolve = (name: string): Record<string, string> => {
      const p = eas.build[name] ?? {};
      const parent = p.extends ? resolve(p.extends) : {};
      return { ...parent, ...(p.env ?? {}) };
    };

    const shipped = resolve("pricing").EXPO_PUBLIC_NEW_PRICING;
    expect(shipped).toBe("1");

    process.env.EXPO_PUBLIC_NEW_PRICING = shipped;
    const { canonical, viaFlags } = await loadBoth();
    expect(canonical()).toBe(true);
    expect(viaFlags()).toBe(true);
  });
});

describe("there is structurally only one parser", () => {
  const flagsSrc = readFileSync(
    join(REPO, "apps", "mobile", "lib", "feature-flags.ts"),
    "utf8"
  );
  const pricingSrc = readFileSync(
    join(REPO, "apps", "mobile", "lib", "pricing.ts"),
    "utf8"
  );

  it("feature-flags.ts does not read the env var itself", () => {
    // The whole fix. A local read here is how the split comes back.
    expect(flagsSrc).not.toMatch(/process\.env\.EXPO_PUBLIC_NEW_PRICING/);
    expect(flagsSrc).toContain('import { newPricingEnabled } from "./pricing"');
  });

  it("pricing.ts owns the only read, via static member access", () => {
    // Static access is required or Metro will not inline it into the
    // release bundle, and the flag becomes silently unflippable.
    expect(pricingSrc).toContain("process.env.EXPO_PUBLIC_NEW_PRICING");
    expect(pricingSrc).toMatch(/export function newPricingEnabled\(\)/);
  });

  it("exactly one file in apps/mobile reads the variable", () => {
    // Walks the tree rather than checking the two files above — a third
    // module re-reading the env var is the same bug in a new place.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (["node_modules", ".expo", "ios", "android", ".git"].includes(e.name))
          continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
      }
      return out;
    };

    const readers = walk(join(REPO, "apps", "mobile"))
      .filter((f) =>
        /process\.env\.EXPO_PUBLIC_NEW_PRICING/.test(readFileSync(f, "utf8"))
      )
      .map((f) => f.slice(REPO.length + 1));

    expect(readers).toEqual(["apps/mobile/lib/pricing.ts"]);
  });
});
