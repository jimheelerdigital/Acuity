import type { ContentBriefing, ContentPiece } from "@prisma/client";

import { callClaude } from "./claude-client";

// ─── Shared brand system prompt ──────────────────────────────────────────────

const BRAND_SYSTEM_PROMPT = `You are writing content for Acuity — a nightly voice journaling app for iOS, Android, and web.

Tagline: "Debrief daily. See your life clearly."

Core product moments to reference:
- The 60-second daily debrief (voice journaling)
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

Pricing: $12.99/month after 30-day free trial, no card required.`;

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
  briefing: ContentBriefing | null,
  count = 1
): Promise<TwitterResult[]> {
  const fewShot = await loadFewShotExamples();

  const contentTypes = [
    "insight — a specific observation about self-reflection or nightly debriefing",
    "tip — one actionable technique or habit",
    "question — a thought-provoking question that sparks replies",
    "product highlight — a specific feature moment (weekly report, life matrix, memoir)",
    "founder observation — a build-in-public observation from making Acuity",
  ];
  const chosenType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing a Twitter/X post for Acuity.

Content type for this post: ${chosenType}

Requirements:
- 280 character limit per post (total, including hook + body + CTA)
- First line is the hook — must stop the scroll
- CTA is soft: "Following along?" not "Buy now"

Respond as a JSON array of objects:
[{ "hook": "...", "body": "...", "cta": "...", "predictedScore": 0.0-1.0 }]`;

  const briefingContext = briefing
    ? `\nContext from today's research: ${JSON.stringify(briefing.ga4Winners)}`
    : "";

  const userPrompt = `Write ${count} tweet(s) for Acuity. Each should use a different angle.${briefingContext}`;

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
  briefing: ContentBriefing | null,
  count = 1
): Promise<TikTokResult[]> {
  const fewShot = await loadFewShotExamples();

  const contentTypes = [
    "problem/solution — name a specific frustration, show Acuity's answer",
    "founder story — a personal moment from building Acuity",
    "product demo walkthrough — walk through a specific feature moment",
    "reaction/hot take — a strong opinion about journaling, productivity, or self-reflection",
    "day-in-the-life — how nightly debriefing fits into a real routine",
  ];
  const chosenType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing a TikTok video script for Acuity.

Content type for this script: ${chosenType}

Requirements:
- 15-30 seconds total per script
- Structure: Hook (first 2 seconds) / Body (10-25s) / CTA (2-3s)
- Output is the spoken script only, not shot directions
- Write as if someone is speaking directly to camera
- Label each section clearly: [HOOK], [BODY], [CTA]
- Include an estimated duration in seconds

Respond as a JSON array of objects:
[{ "hook": "...", "body": "...", "cta": "...", "predictedScore": 0.0-1.0, "estimatedDuration": 20 }]`;

  const briefingContext = briefing
    ? `\nContext from today's research: ${JSON.stringify(briefing.ga4Winners)}`
    : "";

  const userPrompt = `Write ${count} TikTok script(s) for Acuity.${briefingContext}`;

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

// ─── Instagram posts ────────────────────────────────────────────────────────

interface InstagramResult {
  caption: string;
  hashtags: string;
  imagePrompt: string;
  hook: string;
  predictedScore: number;
}

export async function generateInstagramPost(
  briefing: ContentBriefing | null
): Promise<InstagramResult> {
  const fewShot = await loadFewShotExamples();

  const contentTypes = [
    "insight post — share one specific observation about self-reflection",
    "tip post — one actionable technique for nightly debriefing",
    "social proof quote — a real pattern from Acuity users (anonymized)",
    "question post — ask a thought-provoking question about self-awareness",
    "product highlight — show what the weekly report reveals",
  ];
  const chosenType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

  const systemPrompt = `${BRAND_SYSTEM_PROMPT}${fewShot}

You are writing an Instagram post for Acuity.

Content type for this post: ${chosenType}

Requirements:
- Caption: up to 2200 characters, conversational and specific. Open with a hook line that stops the scroll.
- Hashtags: 15-20 relevant hashtags, mix of broad (#selfcare, #mindfulness) and niche (#voicejournal, #nightroutine, #shutdownritual)
- Image prompt: a detailed description for an AI image generator (gpt-image-2). Style: clean, minimal, warm-toned, dark backgrounds with warm amber/gold accents, no text on the image, abstract or lifestyle imagery. 1080x1080 square format.

Respond in JSON format:
{
  "caption": "the full caption text without hashtags",
  "hashtags": "#hashtag1 #hashtag2 #hashtag3 ...",
  "imagePrompt": "detailed image generation prompt",
  "hook": "the opening hook line",
  "predictedScore": 0.0-1.0
}`;

  const briefingContext = briefing
    ? `\nTop blog pages for context: ${JSON.stringify(briefing.ga4Winners)}`
    : "";

  const userPrompt = `Write 1 Instagram post for Acuity.${briefingContext}`;

  const raw = await callClaude({
    purpose: "generate-instagram-post",
    systemPrompt,
    userPrompt,
  });

  return JSON.parse(extractJson(raw));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractJson(raw: string): string {
  // Try to extract JSON from markdown code blocks or raw text
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // Fall back to finding first [ or { to last ] or }
  const start = raw.search(/[\[{]/);
  const end = Math.max(raw.lastIndexOf("]"), raw.lastIndexOf("}"));
  if (start !== -1 && end !== -1) return raw.slice(start, end + 1);
  return raw;
}
