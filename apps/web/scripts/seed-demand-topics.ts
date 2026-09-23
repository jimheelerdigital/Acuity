/**
 * Phase 2 seed (2026-09-23): replace the brainstormed BlogTopicQueue with
 * demand-backed topics curated from real 90d GSC queries the site earns
 * impressions for but has no post targeting (mined via the same logic as
 * pullUncoveredQueries in auto-blog.ts, curated by hand).
 *
 * - Marks all current QUEUED topics SKIPPED (they were Claude-brainstormed
 *   with no demand data — the pattern that produced the 50 pruned posts).
 * - Inserts curated topics, highest demand first (pick-next-topic takes
 *   oldest QUEUED, so insertion order = publish order).
 *
 * Run: cd apps/web && npx dotenv -e .env.local -- npx tsx scripts/seed-demand-topics.ts
 */
import { prisma } from "../src/lib/prisma";

// Curated from GSC mine 2026-09-23. Comment = the real query evidence.
const TOPICS = [
  {
    // "is notion good for journaling" 31 imp pos 9, "notion for journaling" 26 imp pos 13,
    // "notion journal app" 13 imp pos 10, "journaling with notion" 6 imp pos 13 (~100 imp cluster)
    topic: "Is Notion Good for Journaling? An Honest Answer",
    persona: "mental-load",
    targetKeyword: "is notion good for journaling",
    searchIntent: "comparison",
  },
  {
    // "morning pages vs journaling" 24 imp pos 15
    topic: "Morning Pages vs Journaling: What's Actually Different",
    persona: "mental-load",
    targetKeyword: "morning pages vs journaling",
    searchIntent: "comparison",
  },
  {
    // "best ai journal app" 7, "ai journal app" 17, "best journaling app with ai" 7 (~35 imp, pos 80s)
    topic: "The Best AI Journal Apps in 2026, Compared Honestly",
    persona: "mental-load",
    targetKeyword: "best ai journal app",
    searchIntent: "comparison",
  },
  {
    // "voice journaling vs writing" 11 imp pos 14
    topic: "Voice Journaling vs Writing: Which One You'll Actually Keep Doing",
    persona: "mental-load",
    targetKeyword: "voice journaling vs writing",
    searchIntent: "comparison",
  },
  {
    // "weekly review paper" 16 imp pos 80
    topic: "Paper Weekly Review vs an App: Which One Sticks",
    persona: "burned-out-professionals",
    targetKeyword: "weekly review paper template vs app",
    searchIntent: "comparison",
  },
  {
    // "therapy journal vs journaling app" 4 imp pos 22, "online therapy journal" 4 imp,
    // "is there a digital platform that provides both therapy and journaling tools?" 7 imp pos 4
    topic: "Therapy Journal vs Journaling App: What's the Difference",
    persona: "therapy-adjacent",
    targetKeyword: "therapy journal vs journaling app",
    searchIntent: "comparison",
  },
  {
    // "best gratitude apps" 3, "best gratitude app" 2, "best gratitude journal app" 2, "gratitude journal app" 2
    topic: "Best Gratitude Journal Apps (and When You Don't Need One)",
    persona: "mental-load",
    targetKeyword: "best gratitude journal app",
    searchIntent: "comparison",
  },
  {
    // "coaching tools for goal setting" 8 imp pos 63
    topic: "Coaching Tools for Goal Setting That Clients Actually Use",
    persona: "coaches",
    targetKeyword: "coaching tools for goal setting",
    searchIntent: "informational",
  },
  {
    // "journal that talks back" 2 + "the journal that talks back" 2, pos 70s
    topic: "A Journal That Talks Back: What AI Journaling Actually Feels Like",
    persona: "mental-load",
    targetKeyword: "journal that talks back",
    searchIntent: "informational",
  },
  {
    // "what digital tools improve patient adherence to therapy homework?" 2 imp pos 10,
    // "reflective app alternatives homework tools therapists can see into" 2 imp
    topic: "Digital Tools That Improve Therapy Homework Adherence",
    persona: "therapists",
    targetKeyword: "digital tools to improve therapy homework adherence",
    searchIntent: "informational",
  },
];

async function main() {
  const skipped = await prisma.blogTopicQueue.updateMany({
    where: { status: "QUEUED" },
    data: { status: "SKIPPED" },
  });
  console.log(`Marked ${skipped.count} brainstormed topics SKIPPED`);

  // Sequential creates so createdAt ordering matches curated priority
  for (const t of TOPICS) {
    await prisma.blogTopicQueue.create({ data: t });
    console.log(`queued: ${t.topic}`);
  }

  const counts = await prisma.blogTopicQueue.groupBy({ by: ["status"], _count: true });
  console.log(JSON.stringify(counts));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
