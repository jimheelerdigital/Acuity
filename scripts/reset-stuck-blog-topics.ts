/**
 * One-time cleanup: reset any BlogTopicQueue rows stuck in IN_PROGRESS
 * back to QUEUED. Safe to run multiple times (idempotent).
 *
 * Usage: npx tsx scripts/reset-stuck-blog-topics.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.blogTopicQueue.updateMany({
    where: { status: "IN_PROGRESS" },
    data: { status: "QUEUED" },
  });

  console.log(`[reset-stuck-blog-topics] Reset ${result.count} stuck topic(s) from IN_PROGRESS → QUEUED`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
