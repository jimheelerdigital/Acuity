/**
 * One-off (2026-09-15): create the ContentLane table (lanes-as-data,
 * co-pilot lane system) and seed the founding generation — the 14
 * lanes currently hard-coded in carousel-daily.ts's HOUR_LANES.
 *
 * Additive-only SQL (CREATE TABLE IF NOT EXISTS), back-declared in
 * prisma/schema.prisma in the same session per the schema rule.
 * Run: cd apps/web && npx tsx scripts/add-content-lane-table.ts
 * (with prod env sourced). Safe to re-run — seed uses upsert and
 * never overwrites status/spec edits made after the first run.
 */
import { prisma } from "../src/lib/prisma";

const FOUNDING: {
  key: string;
  name: string;
  brand: "ripple" | "bwk";
  hoursUtc: number[];
}[] = [
  { key: "memento-men", name: "Memento (Men)", brand: "bwk", hoursUtc: [5] },
  { key: "selfie", name: "Selfie Slideshow", brand: "ripple", hoursUtc: [5, 7] },
  { key: "phone-quote-men", name: "Phone Quote (Men)", brand: "bwk", hoursUtc: [5, 7] },
  { key: "texts-younger", name: "Texts to My Younger Self", brand: "ripple", hoursUtc: [5] },
  { key: "watching", name: "When No One's Watching", brand: "bwk", hoursUtc: [6] },
  { key: "questions", name: "Answer Honestly (Questions)", brand: "ripple", hoursUtc: [6] },
  { key: "phone-quote", name: "Phone Quote (Women)", brand: "ripple", hoursUtc: [6, 8] },
  { key: "discipline-real", name: "What Discipline Actually Looks Like", brand: "bwk", hoursUtc: [6] },
  { key: "protocol", name: "30-Day Protocol", brand: "bwk", hoursUtc: [7] },
  { key: "permission", name: "Permission Slips", brand: "ripple", hoursUtc: [7] },
  { key: "memento", name: "Memento (Women)", brand: "ripple", hoursUtc: [8] },
  { key: "moody-men", name: "Moody Men (Silence)", brand: "bwk", hoursUtc: [8] },
  { key: "future-texts", name: "Texts From Your Future Self", brand: "bwk", hoursUtc: [8] },
  { key: "letter", name: "The Unsent Letter", brand: "ripple", hoursUtc: [8] },
];

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS public."ContentLane" (
      "id"        TEXT PRIMARY KEY,
      "key"       TEXT NOT NULL,
      "name"      TEXT NOT NULL,
      "brand"     TEXT NOT NULL DEFAULT 'ripple',
      "status"    TEXT NOT NULL DEFAULT 'ACTIVE',
      "template"  TEXT NOT NULL DEFAULT 'moody',
      "hoursUtc"  INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      "spec"      JSONB,
      "origin"    TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "retiredAt" TIMESTAMP(3)
    );
  `);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "ContentLane_key_key" ON public."ContentLane"("key");`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "ContentLane_status_idx" ON public."ContentLane"("status");`
  );
  console.log("ContentLane table ensured.");

  for (const lane of FOUNDING) {
    // INSERT ... ON CONFLICT DO NOTHING via raw SQL so re-runs never
    // clobber later edits (status flips, hour moves) from the admin UI.
    const inserted = await prisma.$executeRawUnsafe(
      `INSERT INTO public."ContentLane"
         ("id", "key", "name", "brand", "status", "template", "hoursUtc", "origin", "updatedAt")
       VALUES
         ('lane_' || md5('${lane.key}'), '${lane.key}', $1, '${lane.brand}', 'ACTIVE', 'code', ARRAY[${lane.hoursUtc.join(",")}]::INTEGER[],
          'Founding generation — migrated from the hard-coded HOUR_LANES map 2026-09-15.', CURRENT_TIMESTAMP)
       ON CONFLICT ("key") DO NOTHING;`,
      lane.name
    );
    console.log(`${inserted ? "seeded" : "exists "}: ${lane.key} (${lane.brand}, hours ${lane.hoursUtc.join("+")})`);
  }

  const rows = await prisma.$queryRawUnsafe<
    { key: string; brand: string; status: string; hoursUtc: number[] }[]
  >(`SELECT "key", "brand", "status", "hoursUtc" FROM public."ContentLane" ORDER BY "hoursUtc"[1], "key";`);
  console.log(`\n${rows.length} lanes in table:`);
  for (const r of rows) {
    console.log(`  ${r.status.padEnd(8)} ${r.brand.padEnd(6)} ${r.hoursUtc.join("+")}  ${r.key}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
