/**
 * Monitor for the prod blog-rewrite-triage Inngest run: shows recent
 * ClaudeCallLog entries and how many of the 41 rewrite slugs have a
 * finalBody. Run: cd apps/web && npx dotenv -e .env.local -- npx tsx scripts/check-rewrite-progress.ts
 */
import { prisma } from "../src/lib/prisma";
import { REWRITE_SLUGS } from "../src/inngest/functions/blog-rewrite-triage";

async function main() {
  const logs = await prisma.claudeCallLog.findMany({
    where: { purpose: { startsWith: "blog-rewrite-triage:" } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { purpose: true, createdAt: true, success: true, errorMessage: true },
  });
  console.log("Recent Claude calls:");
  for (const l of logs) {
    console.log(`  ${l.createdAt.toISOString()} ${l.success ? "OK " : "ERR"} ${l.purpose}${l.errorMessage ? ` — ${l.errorMessage.slice(0, 120)}` : ""}`);
  }

  const posts = await prisma.contentPiece.findMany({
    where: { slug: { in: [...REWRITE_SLUGS] }, type: "BLOG" },
    select: { slug: true, title: true, finalBody: true },
  });
  const done = posts.filter((p) => p.finalBody);
  console.log(`\nfinalBody set: ${done.length}/${REWRITE_SLUGS.length}`);
  for (const p of done.slice(-5)) console.log(`  ${p.slug} -> "${p.title}"`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
