/**
 * Read-only RLS verification against Supabase Postgres.
 *
 * Queries pg_class.relrowsecurity (and relforcerowsecurity) for every
 * user-data table we care about. Prints a table summary + emits the
 * SQL Jim needs to run for any table where RLS is missing. Does NOT
 * enable RLS itself — Jim runs that via Supabase SQL editor.
 *
 * Also checks that the configured DATABASE_URL uses the service role
 * (Prisma's connection string). RLS + service-role is safe because the
 * service role is backend-only; anon/user JWTs (which would hit RLS)
 * are not in our app's data path.
 *
 * Usage:
 *   set -a && source apps/web/.env.local && set +a && \
 *     npx tsx scripts/verify-rls.ts
 */

import { PrismaClient } from "@prisma/client";

const TABLES = [
  "User",
  "Entry",
  "Goal",
  "Task",
  "Theme",
  "ThemeMention",
  "UserInsight",
  "LifeMapAreaHistory",
  "WeeklyReport",
  "StateOfMeReport",
  "HealthSnapshot",
  "UserLifeDimension",
] as const;

type Row = {
  tablename: string;
  rowsecurity: boolean;
  forcerowsecurity: boolean;
  exists: boolean;
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[verify-rls] DATABASE_URL not set. Source apps/web/.env.local first.");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  // pg_class lookup keyed by case-sensitive relname in the public schema.
  // We ask for each table by name rather than pattern-matching so a
  // missing table surfaces as exists=false instead of silently skipped.
  const results: Row[] = [];
  for (const table of TABLES) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = $1
        LIMIT 1`,
      table
    );
    const row = rows[0];
    results.push({
      tablename: table,
      rowsecurity: Boolean(row?.relrowsecurity),
      forcerowsecurity: Boolean(row?.relforcerowsecurity),
      exists: Boolean(row),
    });
  }

  console.log("\nRLS status (Supabase public schema):\n");
  console.log("  table                       exists  RLS   FORCE");
  console.log("  ──────────────────────────────────────────────────");
  for (const r of results) {
    console.log(
      `  ${r.tablename.padEnd(26)}  ${r.exists ? "yes" : "NO "}    ${
        r.rowsecurity ? "ON " : "off"
      }   ${r.forcerowsecurity ? "ON " : "off"}`
    );
  }

  const missingTables = results.filter((r) => r.exists && !r.rowsecurity);
  const unknownTables = results.filter((r) => !r.exists);

  if (unknownTables.length > 0) {
    console.log("\n⚠  Tables not found (schema drift — update TABLES list):");
    for (const r of unknownTables) console.log(`    - ${r.tablename}`);
  }

  if (missingTables.length > 0) {
    console.log("\n──────────────────────────────────────────────────────");
    console.log("SQL for Jim — paste into Supabase SQL editor:");
    console.log("──────────────────────────────────────────────────────");
    for (const r of missingTables) {
      console.log(`ALTER TABLE public."${r.tablename}" ENABLE ROW LEVEL SECURITY;`);
    }
    console.log("──────────────────────────────────────────────────────\n");
    console.log(
      "Then re-run this script to confirm. App-side code already uses"
    );
    console.log(
      "the service-role Postgres URL (DATABASE_URL), which bypasses RLS"
    );
    console.log(
      "by design — RLS here is defense in depth against a future Supabase-"
    );
    console.log(
      "Realtime or anon-key access path, and closes a public-beta audit item."
    );
  } else if (unknownTables.length === 0) {
    console.log(
      "\n✓ All listed tables have RLS enabled. No SQL to run.\n"
    );
  }

  // Best-effort role check. The DATABASE_URL user should typically be
  // `postgres.<project_ref>` (service role) or `postgres` (local). If
  // it's `anon` we'd see RLS actually bite on queries, which is a
  // different failure mode than this script verifies.
  const roleRows = await prisma.$queryRawUnsafe<
    Array<{ current_user: string; current_setting: string }>
  >(`SELECT current_user, current_setting('role')`);
  const role = roleRows[0];
  if (role) {
    console.log(
      `DB connection role: current_user=${role.current_user} role=${role.current_setting}`
    );
    if (role.current_user === "anon" || role.current_user === "authenticated") {
      console.log(
        "⚠  Prisma appears to be using an RLS-bound role. This will break"
      );
      console.log(
        "   all writes once RLS is enabled. Expected role is service_role"
      );
      console.log(
        "   or postgres. Check DATABASE_URL in Vercel production env."
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[verify-rls] FAILED", err);
  process.exit(1);
});
