import type { ContentBriefing, ContentPiece } from "@prisma/client";

import { callClaude } from "./claude-client";

// ─── Shared brand system prompt ──────────────────────────────────────────────

const BRAND_SYSTEM_PROMPT = `You are writing content for Acuity — a nightly voice journaling app for iOS, Android, and web.

Tagline: "Brain dump daily. Get your life back."

Core product moments to reference:
- The 60-second nightly brain dump (voice journaling)
- The weekly insight report (the "Day 7 moment")
- The Life Matrix (tracking 6 life domains)
- The monthly memoir PDF

Voice: direct, no-fluff, founder-led, build-in-public tone.

NEVER use these words/phrases:
- "unlock your potential"
- "game-changer"
- "journey" (as metaphor)
- "revolutionary"
- "AI-powered" as an adjective
- "empower"
- "transform your life"

Always include specific numbers, specific examples, specific experiences — never vague benefits.

Pricing: $12.99/month after 14-day free trial, no card required.`;

// ─── Few-shot loader ─────────────────────────────────────────────────────────

async function loadFewShotExamples(): Promise<string> {
  const { prisma } = await import("@/lib/prisma");

  const winners = await prisma.contentPiece.findMany({
    where: {
      status: "DISTRIBUTED",
      metrics: { path: ["signups"], gte: 10 },
    },
    orderBy: { distributedAt: "desc" },
    take: 5,
  });

  if (winners.length === 0) return "";

  const examples = winners
    .map(
      (w: ContentPiece) =>
        `--- Example (${w.type}, signups: ${(w.metrics as Record<string, number>)?.signups ?? "?"}) ---\nHook: ${w.hook}\nBody: ${(w.finalBody ?? w.body).slice(0, 500)}\nCTA: ${w.cta}`
    )
    .join("\n\n");

  return `\n\nHere are recent high-performing pieces to use as style reference:\n${examples}`;
}

// ─── Blog post ───────────────────────────────────────────────────────────────

interface BlogResult {
  title: string;
  body: string;
  hook: string;
  cta: string;
  targetKeyword: string;
  predictedScore: number;
}

export async function generateBlogPost(
  briefing: ContentBriefing
): Promise<BlogResult> {
  const fewShot = await loadFewShotExamples();

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing a blog post for the Acuity website.

Requirements:
- 1,400 to 1,600 words
- Use H2 and H3 structure
- Include a meta description (exactly 150 characters)
- Include JSON-LD Article schema markup
- The target keyword must appear: in the H1, in the first 100 words, in one H2, and 2-3 times naturally in the body
- Output the full rendered HTML (complete article body with headings, paragraphs, meta description, and JSON-LD)

Respond in JSON format:
{
  "title": "...",
  "body": "<full HTML>",
  "hook": "opening hook line",
  "cta": "closing call to action",
  "targetKeyword": "chosen keyword",
  "predictedScore": 0.0-1.0
}

predictedScore: your confidence that this will drive signups (0.0 to 1.0).`;

  const userPrompt = `Today's research briefing:

Reddit trends: ${JSON.stringify(briefing.redditTop)}
Top blog pages: ${JSON.stringify(briefing.ga4Winners)}

Write a blog post that taps into what people are talking about today. Pick a target keyword relevant to voice journaling, self-reflection, or personal productivity.`;

  const raw = await callClaude({
    purpose: "generate-blog-post",
    systemPrompt,
    userPrompt,
    maxTokens: 6000,
  });

  return JSON.parse(extractJson(raw));
}

// ─── Twitter posts ───────────────────────────────────────────────────────────

interface TwitterResult {
  hook: string;
  body: string;
  cta: string;
  predictedScore: number;
}

export async function generateTwitterPosts(
  briefing: ContentBriefing,
  count = 3
): Promise<TwitterResult[]> {
  const fewShot = await loadFewShotExamples();

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing Twitter/X posts for Acuity.

Requirements:
- 240 character limit per post (total, including hook + body + CTA)
- First line is the hook — must stop the scroll
- CTA is soft: "Following along?" not "Buy now"

Respond as a JSON array of objects:
[{ "hook": "...", "body": "...", "cta": "...", "predictedScore": 0.0-1.0 }]`;

  const userPrompt = `Today's research briefing:

Reddit trends: ${JSON.stringify(briefing.redditTop)}

Write ${count} tweets that tap into today's conversations. Each tweet should use a different angle.`;

  const raw = await callClaude({
    purpose: "generate-twitter-posts",
    systemPrompt,
    userPrompt,
  });

  return JSON.parse(extractJson(raw));
}

// ─── TikTok scripts ──────────────────────────────────────────────────────────

interface TikTokResult {
  hook: string;
  body: string;
  cta: string;
  predictedScore: number;
}

export async function generateTikTokScripts(
  briefing: ContentBriefing,
  count = 2
): Promise<TikTokResult[]> {
  const fewShot = await loadFewShotExamples();

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing TikTok video scripts for Acuity.

Requirements:
- 30-45 seconds total per script
- Structure: Hook (2s) / Body (20-40s) / CTA (2s)
- Output is the spoken script only, not shot directions
- Write as if someone is speaking directly to camera

Respond as a JSON array of objects:
[{ "hook": "...", "body": "...", "cta": "...", "predictedScore": 0.0-1.0 }]`;

  const userPrompt = `Today's research briefing:

Reddit trends: ${JSON.stringify(briefing.redditTop)}

Write ${count} TikTok scripts. Each should use a different angle or trend.`;

  const raw = await callClaude({
    purpose: "generate-tiktok-scripts",
    systemPrompt,
    userPrompt,
  });

  return JSON.parse(extractJson(raw));
}

// ─── Ad copy ─────────────────────────────────────────────────────────────────

interface AdCopyResult {
  hook: string;
  body: string;
  cta: string;
  predictedScore: number;
}

export async function generateAdCopy(
  briefing: ContentBriefing,
  count = 2
): Promise<AdCopyResult[]> {
  const fewShot = await loadFewShotExamples();

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing Meta (Facebook/Instagram) ad copy for Acuity.

Requirements per variant:
- Primary text: max 125 characters
- Headline: max 40 characters
- Description: max 30 characters
- Each variant tests a different angle: pain, benefit, curiosity, social proof, or founder story

Format the "body" field as: "Primary: ... | Headline: ... | Description: ..."

Respond as a JSON array of objects:
[{ "hook": "the headline", "body": "Primary: ... | Headline: ... | Description: ...", "cta": "...", "predictedScore": 0.0-1.0 }]`;

  const userPrompt = `Today's research briefing:

Reddit trends: ${JSON.stringify(briefing.redditTop)}

Write ${count} ad copy variants, each using a different angle from: pain, benefit, curiosity, social proof, founder story.`;

  const raw = await callClaude({
    purpose: "generate-ad-copy",
    systemPrompt,
    userPrompt,
  });

  return JSON.parse(extractJson(raw));
}

// ─── Reddit drafts ──────────────────────────────────────────────────────────

interface RedditDraftResult {
  title: string;
  body: string;
  subreddit: string;
  angle: string;
  hook: string;
  dontMention: string;
  predictedScore: number;
}

export async function generateRedditDraft(
  briefing: ContentBriefing,
  count = 1
): Promise<RedditDraftResult[]> {
  const systemPrompt = `You are helping Keenan, founder of Acuity (a voice journaling app), write a Reddit post DRAFT.

This is a draft. Keenan will rewrite it in his own voice before posting. Your job is to give him a strong starting point with a clear angle, not a finished post.

CRITICAL RULES:
- Never include promotional language
- Never link to getacuity.io in the post body
- Never say "check out this app" or "I built an app"
- Use vulnerability and specific numbers in the hook
- Pick ONE subreddit from: r/DecidingToBeBetter, r/ADHD, r/Journaling, r/productivity, r/selfimprovement, r/SideProject, r/IMadeThis, r/getdisciplined
- Choose the subreddit based on the briefing's trending topics. If Reddit trends show ADHD content resonating, pick r/ADHD. If self-improvement is hot, pick r/DecidingToBeBetter.

STRUCTURE (200-400 words):
1. Hook: One sentence, specific number or visceral image. "I failed at X 17 times." or "It's 11:47 PM and my brain won't shut up."
2. Context: What you tried and why it didn't stick (2-3 sentences, specific tools named)
3. Turning point: What changed (2-3 sentences, the key insight)
4. Result: What surprised you, what you learned (2-3 sentences, concrete observation)
5. NO call to action at the end. Reddit hates CTAs.

TONE:
- First person, past-tense narrative
- Casual, honest, slightly self-deprecating
- Never use words like 'revolutionary', 'game-changer', 'journey', 'unlock'
- Use specific nouns: 'Notion', 'Day One', 'Moleskine', 'therapist' — not generic 'apps' or 'tools'

Respond as a JSON array of objects:
[{
  "title": "post title",
  "subreddit": "r/SubredditName",
  "angle": "2 sentences explaining the strategic angle",
  "hook": "explains what the opening is designed to do",
  "body": "the 200-400 word draft",
  "dontMention": "Do not link Acuity in the post body. Only mention in comments if someone asks what app you use.",
  "predictedScore": 0.0-1.0
}]`;

  const userPrompt = `Today's research briefing:

Reddit trends: ${JSON.stringify(briefing.redditTop)}
Top blog pages: ${JSON.stringify(briefing.ga4Winners)}

Write ${count} Reddit post draft(s). Pick the subreddit that best matches today's trending topics. Each draft should use a different angle if count > 1.`;

  const raw = await callClaude({
    purpose: "generate-reddit-draft",
    systemPrompt,
    userPrompt,
  });

  return JSON.parse(extractJson(raw));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  // Try to extract JSON from markdown code blocks or raw text
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // Fall back to finding first [ or { to last ] or }
  const start = raw.search(/[\[{]/);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw;
}
