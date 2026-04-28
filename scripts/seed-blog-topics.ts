/**
 * One-time seed script for the BlogTopicQueue.
 *
 * Run AFTER prisma db push:
 *   npx tsx scripts/seed-blog-topics.ts
 *
 * Calls Claude to generate 30 diverse blog topic ideas, validates
 * them against existing blog post titles to avoid duplicates, and
 * inserts them as QUEUED rows.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PERSONAS = [
  "founders",
  "therapists",
  "knowledge workers",
  "ADHD",
  "sleep-issues",
  "parents",
  "students",
  "writers",
  "perfectionists",
  "solopreneurs",
  "creatives",
  "executives",
  "coaches",
  "freelancers",
  "recovering-addicts",
];

async function main() {
  console.log("[seed-blog-topics] Starting...");

  // Fetch existing titles to avoid duplicates
  const existingPosts = await prisma.contentPiece.findMany({
    where: { type: "BLOG" },
    select: { title: true },
  });
  const existingTitles = existingPosts.map((p) => p.title.toLowerCase());

  // Check current queue size
  const currentQueued = await prisma.blogTopicQueue.count({
    where: { status: "QUEUED" },
  });
  console.log(`[seed-blog-topics] Current queue size: ${currentQueued}`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set");
    process.exit(1);
  }

  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6000,
    system: `You generate blog topic ideas for Acuity, a voice journaling app where users do a 60-second brain dump and get tasks extracted, goals tracked, mood scored, and a weekly report.

Each topic must target a long-tail keyword a real person would Google. Cover diverse personas: ${PERSONAS.join(", ")}.

Respond with a JSON array of 30 objects:
[{
  "topic": "descriptive topic title",
  "persona": "target persona",
  "targetKeyword": "long-tail SEO keyword",
  "searchIntent": "informational" | "comparison" | "problem-solving"
}]

Rules:
- Keywords should be 3-6 words, things real people type into Google
- Mix search intents: ~60% informational, ~25% problem-solving, ~15% comparison
- Don't repeat similar keywords
- Cover at least 10 different personas`,
    messages: [
      {
        role: "user",
        content: `Generate 30 unique blog topic ideas. Avoid topics similar to these existing posts:\n${existingTitles.slice(0, 20).join("\n")}\n\nOutput only the JSON array.`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch
    ? codeBlockMatch[1].trim()
    : text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);

  let topics: Array<{
    topic: string;
    persona: string;
    targetKeyword: string;
    searchIntent: string;
  }>;

  try {
    topics = JSON.parse(jsonStr);
  } catch (err) {
    console.error("[seed-blog-topics] Failed to parse response:", err);
    console.log("Raw response:", text.slice(0, 500));
    process.exit(1);
  }

  // Filter duplicates
  const newTopics = topics.filter((t) => {
    const kw = t.targetKeyword.toLowerCase();
    return !existingTitles.some((title) => title.includes(kw));
  });

  console.log(
    `[seed-blog-topics] Generated ${topics.length} topics, ${newTopics.length} are new`
  );

  if (newTopics.length === 0) {
    console.log("[seed-blog-topics] No new topics to insert");
    return;
  }

  const result = await prisma.blogTopicQueue.createMany({
    data: newTopics.map((t) => ({
      topic: t.topic,
      persona: t.persona,
      targetKeyword: t.targetKeyword,
      searchIntent: t.searchIntent,
    })),
  });

  console.log(`[seed-blog-topics] Inserted ${result.count} topics`);

  // Show what was inserted
  for (const t of newTopics) {
    console.log(`  - [${t.persona}] ${t.targetKeyword}: ${t.topic}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
