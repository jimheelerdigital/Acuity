/**
 * One-off: inspect prod adlab column types vs schema.prisma
 * (checking suspected drift: complianceStatus enum values, videoUrl, angle createdAt)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRawUnsafe<
    { table_name: string; column_name: string; data_type: string; udt_name: string }[]
  >(`SELECT table_name, column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_name IN ('adlab_creatives','adlab_angles','adlab_experiments')
     ORDER BY table_name, ordinal_position`);
  for (const c of cols) {
    console.log(`${c.table_name}.${c.column_name}: ${c.data_type} (${c.udt_name})`);
  }

  const enums = await prisma.$queryRawUnsafe<{ typname: string; labels: string }[]>(
    `SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
     FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname ILIKE '%compliance%' OR t.typname ILIKE '%adlab%'
     GROUP BY t.typname`);
  console.log("\nEnums:", JSON.stringify(enums, null, 2));

  const distinct = await prisma.$queryRawUnsafe<{ complianceStatus: string; n: bigint }[]>(
    `SELECT "complianceStatus", count(*)::int AS n FROM adlab_creatives GROUP BY 1`);
  console.log("\nDistinct complianceStatus values:", distinct.map((d) => `${d.complianceStatus}=${d.n}`).join(", "));
}

main().finally(() => prisma.$disconnect());
