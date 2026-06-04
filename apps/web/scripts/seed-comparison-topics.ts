/**
 * Seed BlogTopicQueue with comparison and roundup topics.
 *
 * Usage:
 *   npx tsx apps/web/scripts/seed-comparison-topics.ts
 *
 * Idempotent — skips topics that already exist (matched by targetKeyword).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const now = new Date();
const day = (n: number) => new Date(now.getTime() + n * 86400000);

const TOPICS = [
  // Priority 1 — next 3 days
  {
    topic: "Acuity vs Rosebud: Which AI Journal App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs rosebud",
    searchIntent: "comparison",
    scheduledFor: day(0),
  },
  {
    topic: "Acuity vs Day One: Which Journal App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs day one",
    searchIntent: "comparison",
    scheduledFor: day(1),
  },
  {
    topic: "The 7 Best AI Journaling Apps in 2026 (Tested and Compared)",
    persona: "journaling-comparison",
    targetKeyword: "best ai journaling apps 2026",
    searchIntent: "comparison",
    scheduledFor: day(2),
  },
  // Priority 2 — days 4-6
  {
    topic: "Acuity vs Reflectly: Which Journal App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs reflectly",
    searchIntent: "comparison",
    scheduledFor: day(3),
  },
  {
    topic: "Acuity vs Daylio: Which Journal App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs daylio",
    searchIntent: "comparison",
    scheduledFor: day(4),
  },
  {
    topic: "The Best Voice Journaling Apps in 2026 (No Typing Required)",
    persona: "journaling-comparison",
    targetKeyword: "best voice journaling apps 2026",
    searchIntent: "comparison",
    scheduledFor: day(5),
  },
  // Priority 3 — days 7-9
  {
    topic: "Acuity vs Stoic: Which Journal App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs stoic",
    searchIntent: "comparison",
    scheduledFor: day(6),
  },
  {
    topic: "Acuity vs Finch: Which Self-Care App Is Right for You in 2026?",
    persona: "journaling-comparison",
    targetKeyword: "acuity vs finch",
    searchIntent: "comparison",
    scheduledFor: day(7),
  },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const t of TOPICS) {
    const existing = await prisma.blogTopicQueue.findFirst({
      where: { targetKeyword: t.targetKeyword },
    });
    if (existing) {
      console.log(`SKIP (exists): ${t.targetKeyword}`);
      skipped++;
      continue;
    }

    await prisma.blogTopicQueue.create({ data: t });
    console.log(`CREATED: ${t.targetKeyword} (scheduled: ${t.scheduledFor.toISOString().slice(0, 10)})`);
    created++;
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
