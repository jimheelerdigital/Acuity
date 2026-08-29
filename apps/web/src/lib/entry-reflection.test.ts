import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeReflection } from "@acuity/shared";

/**
 * Feature #1 Phase A — the per-entry reflection.
 *
 * Two things are worth pinning, and they are different in kind:
 *
 *   1. PARSING — whatever the model returns must reduce to
 *      `string | null`. A non-string that slips through would be
 *      rendered to a user as "[object Object]" in the warmest, most
 *      prominent slot on the entry page.
 *
 *   2. THE PROMPT'S PROHIBITIONS — a "first-insight" activation email
 *      was removed in 2d76c829 for surfacing usage nags instead of real
 *      observations. That failure is the bar this feature has to clear,
 *      so the bans are asserted as text rather than trusted to survive
 *      future prompt edits. These are necessarily source assertions:
 *      the guidance is a string in a prompt, and a prompt edit that
 *      drops "never a nag" is exactly the regression worth catching.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(REPO, ...p), "utf8");

const PIPELINE = read("apps", "web", "src", "lib", "pipeline.ts");
const PROCESS_ENTRY = read(
  "apps",
  "web",
  "src",
  "inngest",
  "functions",
  "process-entry.ts"
);
const ENTRY_PAGE = read(
  "apps",
  "web",
  "src",
  "app",
  "entries",
  "[id]",
  "page.tsx"
);
const SCHEMA = read("prisma", "schema.prisma");

describe("normalizeReflection — parsing whatever the model returned", () => {
  it("keeps a real reflection, trimmed", () => {
    expect(normalizeReflection("  You mentioned Jordan again.  ")).toBe(
      "You mentioned Jordan again."
    );
  });

  it("treats absent / empty / whitespace as no reflection", () => {
    expect(normalizeReflection(undefined)).toBeNull();
    expect(normalizeReflection(null)).toBeNull();
    expect(normalizeReflection("")).toBeNull();
    expect(normalizeReflection("   \n  ")).toBeNull();
  });

  it("refuses non-strings rather than stringifying them", () => {
    // The failure this prevents: "[object Object]" rendered to a user
    // as their reflection.
    expect(normalizeReflection({ text: "hi" })).toBeNull();
    expect(normalizeReflection(["a", "b"])).toBeNull();
    expect(normalizeReflection(42)).toBeNull();
    expect(normalizeReflection(true)).toBeNull();
  });

  it("never returns an empty string — null is the only 'nothing'", () => {
    for (const v of [undefined, null, "", "  ", {}, [], 0, false]) {
      expect(normalizeReflection(v)).not.toBe("");
    }
  });
});

describe("the extraction prompt asks for a reflection", () => {
  it("declares reflection in the JSON schema", () => {
    expect(PIPELINE).toContain('"reflection"');
  });

  it("is a separate field from summary and insights", () => {
    // The brief's core constraint: do not overload either existing field.
    expect(PIPELINE).toContain('"summary": "2-3 sentence synthesis');
    expect(PIPELINE).toContain('"insights"');
    expect(PIPELINE).toMatch(/NOT a recap of the day/);
    expect(PIPELINE).toMatch(/NOT a list/);
  });

  it("is added to the EXISTING extract call — no second Claude call", () => {
    // One anthropic messages.create in the extraction path. A second
    // would mean added latency and cost per entry, which Phase A rules out.
    const calls = PIPELINE.match(/messages\.create/g) ?? [];
    expect(calls.length).toBeLessThanOrEqual(1);
  });
});

describe("the prompt forbids the 2d76c829 failure mode", () => {
  it("bans usage nags explicitly, not by implication", () => {
    expect(PIPELINE).toMatch(/NEVER a usage nag/i);
    // The specific words that make a nag.
    for (const word of ["streak", "consistency", "recording"]) {
      expect(
        PIPELINE.toLowerCase(),
        `prompt should name "${word}" as forbidden`
      ).toContain(word);
    }
  });

  it("bans praise for showing up — a nag wearing a compliment", () => {
    // Found by running the real prompt before merge: the first version
    // produced "even on a quiet, tired day, you still showed up" on a
    // thin entry. That is praise for USING THE APP, which is the 2d76c829
    // failure in a friendlier register.
    expect(PIPELINE).toMatch(/NEVER praise the user for showing up/i);
    expect(PIPELINE).toMatch(/nag wearing a compliment/i);
  });

  it("bans advice — the product is a mirror, not a coach", () => {
    expect(PIPELINE).toMatch(/mirror, not a coach/i);
    expect(PIPELINE).toMatch(/NOT advice/i);
  });

  it("bans therapeutic and diagnostic language", () => {
    expect(PIPELINE).toMatch(/NOT therapeutic or diagnostic/i);
  });

  it("bans empty flattery", () => {
    expect(PIPELINE).toMatch(/NOT flattery/i);
  });

  it("carries the crisis-safety clause", () => {
    // A distressing entry must not be turned into a tidy observation or
    // a pattern — the reflection slot is the warmest, most authoritative
    // place on the page, and a neat insight about someone's crisis is
    // the worst thing it could hold.
    expect(PIPELINE).toMatch(/SAFETY:/);
    for (const term of [
      "self-harm",
      "suicidal thoughts",
      "abuse",
      "acute crisis",
    ]) {
      expect(PIPELINE, `safety clause should name "${term}"`).toContain(term);
    }
    expect(PIPELINE).toMatch(/never reflect the distress back as an insight/i);
    expect(PIPELINE).toMatch(/Never diagnose, advise, or dramatize/i);
    // The safe fallback must be spelled out, not left to inference.
    expect(PIPELINE).toMatch(/reflect a small neutral detail from elsewhere/i);
  });

  it("forbids inventing patterns or amplifying mood", () => {
    // Two distinct failure modes: fabricating a pattern that isn't in
    // the memory context, and making the entry sound darker than the
    // user made it.
    expect(PIPELINE).toMatch(/Do not invent\./);
    expect(PIPELINE).toMatch(
      /Ground a pattern only when it is actually present/i
    );
    expect(PIPELINE).toMatch(
      /Do not assert feelings the user did not express/i
    );
    expect(PIPELINE).toMatch(
      /never make the mood darker than they made it/i
    );
  });

  it("requires specificity, which is how the old version failed", () => {
    expect(PIPELINE).toMatch(/vagueness is the main way this field fails/i);
  });

  it("tells the model to use memory context for pattern-aware reflections", () => {
    expect(PIPELINE).toMatch(/memory context shows this user has history/i);
    // ...and to fall back to observing the single entry on day one.
    expect(PIPELINE).toMatch(/day-one reflection is specific about today/i);
  });
});

describe("persistence — both pipelines write it", () => {
  it("the sync path writes reflection alongside summary", () => {
    expect(PIPELINE).toContain("reflection: extraction.reflection ?? null");
  });

  it("the async Inngest path writes it too", () => {
    // Two persistence paths exist (ENABLE_INNGEST_PIPELINE). Writing it
    // in only one would make the reflection appear or vanish depending
    // on a flag the user cannot see.
    expect(PROCESS_ENTRY).toContain(
      "reflection: extraction.reflection ?? null"
    );
  });

  it("is an additive nullable column — no backfill, no drop", () => {
    expect(SCHEMA).toMatch(/^\s*reflection\s+String\?/m);
  });
});

describe("display is null-guarded for FREE and legacy entries", () => {
  it("renders only when a reflection actually exists", () => {
    // FREE entries short-circuit before extraction and every entry
    // predating the column has null, so this guard is load-bearing.
    expect(ENTRY_PAGE).toContain("isComplete && entry.reflection &&");
  });

  it("is visually distinct from the summary section", () => {
    expect(ENTRY_PAGE).toContain("Ripple noticed");
    expect(ENTRY_PAGE).toMatch(/SectionHeader label="Summary"/);
  });

  it("uses approved voice — 'noticed', not 'insights'/'intelligence'", () => {
    // DESIGN_SYSTEM.md §7.6 — memory is the product, not intelligence.
    const block = ENTRY_PAGE.slice(
      ENTRY_PAGE.indexOf("Ripple's reflection"),
      ENTRY_PAGE.indexOf("SectionHeader label=\"Summary\"")
    );
    expect(block).not.toMatch(/\bintelligence\b/i);
    expect(block).not.toMatch(/\bAI\b/);
  });
});

describe("Phase A stayed in scope", () => {
  it("did not touch apps/mobile", () => {
    // Mobile display is a separate follow-up that ships with the next
    // build; a mobile read of a column that isn't in prod yet would be
    // a crash in a shipped binary.
    const mobileDir = join(REPO, "apps", "mobile");
    let hits = 0;
    const walk = (dir: string) => {
      for (const e of require("node:fs").readdirSync(dir, {
        withFileTypes: true,
      })) {
        if (
          ["node_modules", ".expo", "ios", "android", ".git"].includes(e.name)
        )
          continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          if (readFileSync(full, "utf8").includes("entry.reflection")) hits++;
        }
      }
    };
    walk(mobileDir);
    expect(hits).toBe(0);
  });
});
