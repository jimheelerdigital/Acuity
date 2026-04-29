/**
 * CI guard: every Prisma model in prisma/schema.prisma must be
 * acknowledged in prisma/rls-allowlist.txt with an explicit RLS state
 * (either "rls" or "no-rls") before the PR can merge.
 *
 * The allowlist is the forcing function. When a contributor adds a
 * new `model` declaration, this script fails until they ALSO add the
 * table to the allowlist with a deliberate decision about whether
 * RLS should be enabled. That decision is then ENFORCED by the daily
 * Inngest rls-audit cron (rls-audit.ts) and by `prisma db push`
 * having access to the matching SQL.
 *
 * The check itself is naive on purpose: a single grep over a single
 * file. No AST parsing, no DB connection, no secrets — runs in CI
 * without any setup. If it ever produces a false positive, fix the
 * allowlist; don't make the check fancier.
 *
 * Format of prisma/rls-allowlist.txt:
 *   # comment lines start with #
 *   ModelName rls         # RLS enabled, has policies
 *   ModelName no-rls      # intentionally exposed (rare; document why)
 *
 * Background: 2026-04-29 incident — six tables shipped without RLS,
 * three contained user PII, exposed via the public anon key for up
 * to 6 days. See docs/launch-audit-2026-04-26/14-rls-prevention.md.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_PATH = resolve(__dirname, "..", "prisma", "schema.prisma");
const ALLOWLIST_PATH = resolve(__dirname, "..", "prisma", "rls-allowlist.txt");

function parseModels(schema: string): string[] {
  const models: string[] = [];
  // Match `model Name {` at line start. Ignore generators / datasources.
  const re = /^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema)) !== null) {
    models.push(m[1]);
  }
  return models;
}

type AllowEntry = { name: string; state: "rls" | "no-rls" };

function parseAllowlist(text: string): AllowEntry[] {
  const out: AllowEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [name, state, ...rest] = line.split(/\s+/);
    if (rest.length > 0) {
      throw new Error(`rls-allowlist.txt: extra tokens on line "${raw}"`);
    }
    if (state !== "rls" && state !== "no-rls") {
      throw new Error(
        `rls-allowlist.txt: model "${name}" must be marked "rls" or "no-rls", got "${state}"`
      );
    }
    out.push({ name, state });
  }
  return out;
}

function main(): void {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const allowlistText = readFileSync(ALLOWLIST_PATH, "utf8");

  const models = parseModels(schema);
  const allow = parseAllowlist(allowlistText);
  const allowByName = new Map(allow.map((a) => [a.name, a]));

  const missing: string[] = [];
  for (const name of models) {
    if (!allowByName.has(name)) missing.push(name);
  }

  const stale: string[] = [];
  const modelSet = new Set(models);
  for (const a of allow) {
    if (!modelSet.has(a.name)) stale.push(a.name);
  }

  let failed = false;

  if (missing.length > 0) {
    failed = true;
    console.error(
      `\n[rls-coverage] FAIL: ${missing.length} model(s) not in prisma/rls-allowlist.txt\n`
    );
    for (const m of missing) {
      console.error(`  ${m}`);
    }
    console.error(
      `\nFor each, decide whether the table needs Row-Level Security:`
    );
    console.error(`  - Yes (default for any user-data table) → add line:`);
    console.error(`      ${missing[0]} rls`);
    console.error(`    AND remember to enable RLS in prod:`);
    console.error(
      `      ALTER TABLE public."${missing[0]}" ENABLE ROW LEVEL SECURITY;`
    );
    console.error(
      `  - No (operational/admin tables with no PII) → add line:`
    );
    console.error(`      ${missing[0]} no-rls   # short reason here`);
    console.error(
      `\nSee docs/launch-audit-2026-04-26/14-rls-prevention.md for context.`
    );
  }

  if (stale.length > 0) {
    failed = true;
    console.error(
      `\n[rls-coverage] FAIL: ${stale.length} stale entry(ies) in prisma/rls-allowlist.txt — model no longer exists in schema.prisma:\n`
    );
    for (const s of stale) console.error(`  ${s}`);
    console.error(`\nRemove these lines from prisma/rls-allowlist.txt.`);
  }

  if (failed) {
    process.exit(1);
  }

  console.log(
    `[rls-coverage] OK: ${models.length} model(s) accounted for ` +
      `(${allow.filter((a) => a.state === "rls").length} rls, ` +
      `${allow.filter((a) => a.state === "no-rls").length} no-rls).`
  );
}

main();
