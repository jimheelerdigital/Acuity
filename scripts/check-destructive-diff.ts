/**
 * Destructive-schema-diff guard.
 *
 * Compares prisma/schema.prisma against the LIVE database and fails if
 * applying the schema would destroy anything — DROP TABLE, DROP COLUMN,
 * DROP TYPE, a column type change, or TRUNCATE.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 * `prisma db push` reconciles the database TO the local schema. If your
 * branch's schema.prisma is behind prod — because someone added a column
 * or table with raw SQL and never back-declared it — then "reconcile"
 * means DROP. The branch doesn't know the thing exists, so push removes it.
 *
 * This has now fired twice in three days on this repo:
 *   2026-08-16 — a push from a stale branch would have dropped 13
 *                CarouselPost columns incl. 5 populated storyVideoUrl
 *                values. Caught by a manual diff before running.
 *   2026-08-19 — a push from a branch predating RevenueCatEvent DID drop
 *                that table, and added CarouselPost.format (120/120 rows)
 *                + storyVoiced + the CarouselFormat enum. Caught after
 *                the fact, by noticing the table had vanished.
 *
 * The second one is the point: nobody was reckless. The command is just
 * silently destructive when the schema lags, and nothing was checking.
 *
 * ── How to use ───────────────────────────────────────────────────────
 *   npx tsx scripts/check-destructive-diff.ts
 *
 * Exit 0 = safe (additive only, or no changes).
 * Exit 1 = destructive; the offending statements are printed.
 * Exit 2 = could not check (no DB URL) — treated as failure only with
 *          --require-db, so local work offline isn't blocked.
 *
 * Deliberate drops are still possible — set ALLOW_DESTRUCTIVE_SCHEMA_DIFF=1.
 * The goal is to make destruction a decision, not an accident.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SCHEMA = resolve(ROOT, "prisma/schema.prisma");

const requireDb = process.argv.includes("--require-db");
const override = process.env.ALLOW_DESTRUCTIVE_SCHEMA_DIFF === "1";

/**
 * Statements that can destroy data or break a running deploy.
 *
 * `ALTER COLUMN … TYPE` is included because a type change rewrites the
 * column and can silently truncate or fail; Prisma also emits it as part of
 * the enum-recreate dance, which is how enum VALUES get removed.
 */
const BLOCKING: Array<{ re: RegExp; label: string }> = [
  { re: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
  { re: /\bDROP\s+COLUMN\b/i, label: "DROP COLUMN" },
  { re: /\bDROP\s+TYPE\b/i, label: "DROP TYPE (removes enum values)" },
  { re: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { re: /\bALTER\s+COLUMN\b.*\bTYPE\b/i, label: "ALTER COLUMN … TYPE (rewrite/narrowing)" },
];

/** Riskier-than-additive but not data-destroying. Reported, never blocking. */
const WARNING: Array<{ re: RegExp; label: string }> = [
  { re: /\bDROP\s+CONSTRAINT\b/i, label: "DROP CONSTRAINT" },
  { re: /\bDROP\s+INDEX\b/i, label: "DROP INDEX" },
  { re: /\bSET\s+NOT\s+NULL\b/i, label: "SET NOT NULL (fails if existing rows are null)" },
];

function hasDbUrl(): boolean {
  if (process.env.DIRECT_URL || process.env.DATABASE_URL) return true;
  // Local convention: secrets live in .env.local, loaded via `dotenv -e`.
  return existsSync(resolve(ROOT, ".env.local"));
}

function computeDiff(): string {
  // --from-schema-datasource = the LIVE database (reads the datasource url)
  // --to-schema-datamodel    = what schema.prisma declares
  // So the output is "SQL that would be applied to make prod match us".
  return execFileSync(
    "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-schema-datasource",
      SCHEMA,
      "--to-schema-datamodel",
      SCHEMA,
      "--script",
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function main(): void {
  console.log("Destructive-schema-diff guard");

  if (!hasDbUrl()) {
    const msg =
      "  ⚠ No DIRECT_URL / DATABASE_URL and no .env.local — cannot compare against the live DB.";
    if (requireDb) {
      console.error(msg);
      console.error("  --require-db was set, so this is a failure.");
      process.exit(2);
    }
    console.log(msg);
    console.log("  Skipping (pass --require-db to make this fatal).");
    process.exit(0);
  }

  let sql: string;
  try {
    sql = computeDiff();
  } catch (err) {
    console.error("  ✗ Could not compute the diff:");
    // Print the FULL captured stderr, not a truncated message.
    //
    // This previously showed only the first 4 lines, which in CI were npm
    // warnings — so a real failure (Prisma 6 requiring Node 22, resolved
    // because `npx` went to the registry instead of node_modules) was
    // invisible behind noise. A guard whose failures cannot be read is not
    // a guard.
    const e = err as { stderr?: Buffer | string; message?: string };
    const detail = (e.stderr ? e.stderr.toString() : e.message) ?? String(err);
    console.error(detail.trim());
    process.exit(requireDb ? 2 : 0);
  }

  if (/This is an empty migration/i.test(sql) || sql.trim().length === 0) {
    console.log("  ✓ Schema and database agree — nothing to apply.");
    return;
  }

  const lines = sql.split("\n");
  const blocking: Array<{ label: string; line: string }> = [];
  const warnings: Array<{ label: string; line: string }> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("--")) continue;
    for (const { re, label } of BLOCKING) {
      if (re.test(line)) blocking.push({ label, line });
    }
    for (const { re, label } of WARNING) {
      if (re.test(line)) warnings.push({ label, line });
    }
  }

  if (warnings.length > 0) {
    console.log(`\n  ${warnings.length} non-additive statement(s) worth a look:`);
    for (const w of warnings) console.log(`    • ${w.label}\n        ${w.line}`);
  }

  if (blocking.length === 0) {
    console.log("\n  ✓ Diff is additive only — safe to apply.");
    return;
  }

  console.error(`\n  ✗ ${blocking.length} DESTRUCTIVE statement(s) detected:\n`);
  for (const b of blocking) console.error(`    • ${b.label}\n        ${b.line}`);

  console.error(`
  Applying this schema would DESTROY live data.

  Almost always this means schema.prisma is BEHIND production — someone
  added a column, table or enum value with raw SQL and did not back-declare
  it here. The fix is to add it to schema.prisma so the diff goes additive,
  NOT to force the push through.

  To inspect:
    npx dotenv -e .env.local -- npx prisma migrate diff \\
      --from-schema-datasource prisma/schema.prisma \\
      --to-schema-datamodel prisma/schema.prisma --script

  If the drop is genuinely intended, re-run with:
    ALLOW_DESTRUCTIVE_SCHEMA_DIFF=1 <your command>
`);

  if (override) {
    console.error("  ALLOW_DESTRUCTIVE_SCHEMA_DIFF=1 set — proceeding anyway.\n");
    return;
  }
  process.exit(1);
}

main();
