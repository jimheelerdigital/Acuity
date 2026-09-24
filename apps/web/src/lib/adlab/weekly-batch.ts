/**
 * Weekly Reddit→AdLab ad batch (2026-09-23, per Keenan).
 *
 * Every Sunday (after the Saturday-night Reddit pulse) this generates
 * 10 ad creatives per audience group — each rooted in a different theme
 * from that week's RedditTrendDigest and explicitly bridging the pain to
 * what Ripple does (AI habit tracker & voice journal with life
 * optimization). Two groups, both selling Ripple from the same Meta ad
 * account:
 *   - women: Ripple digest (women ~40–50, mental load / HRT / invisible labor)
 *   - men:   BWK digest (young men, discipline / knowing-doing gap)
 *
 * NOTHING here touches Meta. Experiments land as awaiting_approval with
 * approved=false creatives; Keenan reviews at /admin/adlab/review, picks the
 * destination, and his "Launch approved" click is the only path to spend —
 * it adds the approved ads to the group's evergreen ad set (fixed budget,
 * optimizing for signups; lib/adlab/evergreen.ts).
 */

import { z } from "zod";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";
import { displayMonthly } from "@/lib/pricing";
import { SAFE_ZONE_RULES, SOURCE_SIZE, cutPlacements, renderAppProofPlacements, renderSayCatchPlacements } from "@/lib/adlab/ad-render";

// ─── Groups ───────────────────────────────────────────────────────────────

export type BatchGroupKey = "women" | "men";

interface GroupConfig {
  key: BatchGroupKey;
  projectSlug: string;
  projectName: string;
  digestBrand: string; // RedditTrendDigest.brand
  audienceLabel: string;
  brandVoiceGuide: string;
  targetAudience: Record<string, unknown>;
  usps: string[];
  /** Photography direction for background plates (no text rules here). */
  photoStyle: string;
  /** photoStyle + no-text clause — stored on the AdLabProject for legacy tooling. */
  imageStylePrompt: string;
  /** Short lines (≤5 words) baked into checklist/notes ad formats. */
  overlayValueProps: [string, string, string];
  /** Flat background color direction for typographic formats. */
  cardBackground: string;
}

const PRODUCT_TRUTH = `Ripple is an AI habit tracker & voice journal with life optimization. What it actually does: you record a voice debrief any time of day; it transcribes, pulls out tasks, tracks habits and goals, detects recurring patterns, scores 6 life domains (Life Matrix), and delivers a weekly narrative report. ${displayMonthly()}/month, 7-day free trial. It does NOT diagnose, treat, or replace therapy. Never claim a specific recording duration.`;

const SHARED_BANNED = [
  "unlock",
  "elevate",
  "journey",
  "transform",
  "AI-powered",
  "seamless",
  "game-changer",
  "in today's fast-paced world",
  "revolutionize",
  "harness the power of",
  "empower",
  "cutting-edge",
  "leverage",
  "brain dump",
];

export const BATCH_GROUPS: Record<BatchGroupKey, GroupConfig> = {
  women: {
    key: "women",
    projectSlug: "ripple-women",
    projectName: "Ripple — Women 40–50",
    digestBrand: "ripple",
    audienceLabel: "women roughly 40–50 carrying a heavy mental load",
    brandVoiceGuide: `Warm, observational, a mirror not a coach. Never advise, never lecture — reflect.
Write for a woman ~40–50 carrying the household's invisible mental load. She is smart and tired of being marketed at.
Short sentences. Specifics over abstractions. Use her own language from Reddit — if she wouldn't say it, cut it.
Ripple is a daily debrief she records any time of day (never "nightly", never a fixed time).
Value is multi-surface: tasks captured, mood seen, patterns surfaced, Life Matrix, weekly report.
Never promise transformation or wellness outcomes. Show what she'll SEE, not who she'll become.`,
    targetAudience: {
      ageMin: 38,
      ageMax: 55,
      geo: ["US", "CA", "GB"],
      interests: ["self-care", "mindfulness", "motherhood", "wellness", "organization"],
      painPoints: [
        "carrying the entire household's mental load with no one tracking her",
        "wants to be left alone and feels guilty for it",
        "emotions feel too big and hard to trust (hormones vs. self)",
        "the quiet realization that her own life keeps getting deferred",
        "keeps everything in her head until it spills over",
      ],
      desires: [
        "to feel seen without having to explain again",
        "somewhere to put it all down without typing",
        "proof of her own patterns — is it me or is it everything around me",
        "small moments that are actually hers",
      ],
      identityMarkers: ["mothers", "caregivers", "working women", "women in midlife"],
    },
    usps: [
      "speak it once — tasks, worries, and patterns are captured automatically",
      "weekly report: a narrative of her week she didn't have to write",
      "Life Matrix: 6 life domains, tracked quietly over time",
      "records any time of day, no typing, no blank page",
    ],
    photoStyle:
      "Warm editorial photography. Soft lamp light, cozy lived-in interiors, muted warm tones (amber, cream, terracotta). Quiet domestic moments — a mug, a window, an armchair. Minimal composition, gentle contrast.",
    imageStylePrompt:
      "Warm editorial photography. Soft lamp light, cozy lived-in interiors, muted warm tones (amber, cream, terracotta). Quiet domestic moments — a mug, a window, an armchair. Minimal composition, gentle contrast. No text, no logos, no identifiable faces.",
    overlayValueProps: [
      "Talk — it's all captured",
      "Tasks pulled out for you",
      "A weekly report about you",
    ],
    cardBackground: "warm cream paper background with a subtle terracotta accent",
  },
  men: {
    key: "men",
    projectSlug: "ripple-men",
    projectName: "Ripple — Men Discipline",
    digestBrand: "bwk",
    audienceLabel: "young men (18–34) focused on discipline, self-respect, and building a life they respect",
    brandVoiceGuide: `Direct, grounded, zero hype. A man who has his act together talking straight — not a guru, not a drill sergeant.
Write for a young man who knows exactly what he should be doing and hates that he isn't doing it.
Short declarative sentences. No motivation-speak, no "grindset" clichés. Respect his intelligence.
Frame Ripple as the nightly-audit / self-accountability tool: say it out loud, see the pattern, keep the promise. (Never claim a fixed time of day — he records whenever.)
Never shame him. Name the gap between knowing and doing without moralizing.
Never promise transformation. Show the mechanism: spoken debrief → tracked habits → visible pattern → kept promises.`,
    targetAudience: {
      ageMin: 18,
      ageMax: 34,
      geo: ["US", "CA", "GB"],
      interests: ["self-improvement", "discipline", "fitness", "stoicism", "productivity"],
      painPoints: [
        "the knowing-doing gap — 'I'll start tomorrow'",
        "phone and doomscrolling eating real output",
        "years-long ruts and false restarts",
        "waiting on motivation / mood to act",
        "not liking who he's become — side character in his own life",
      ],
      desires: [
        "one kept promise to himself",
        "an external structure because willpower alone isn't cutting it",
        "visible proof of progress",
        "an honest end-of-day audit",
      ],
      identityMarkers: ["self-improvement men", "lifters", "stoicism readers", "young professionals"],
    },
    usps: [
      "a spoken end-of-day audit — say what you did and didn't do, out loud",
      "habit tracking that catches the promises you quietly break",
      "pattern detection: see the loop you've been stuck in, in your own words",
      "weekly report: the honest scoreboard of your week",
    ],
    photoStyle:
      "Dark, moody editorial photography. Low-key lighting, deep shadows, desaturated tones with a single warm accent. Discipline aesthetics — early morning streets, gym chalk, a desk lamp at night, rain on a window. High contrast, cinematic.",
    imageStylePrompt:
      "Dark, moody editorial photography. Low-key lighting, deep shadows, desaturated tones with a single warm accent. Discipline aesthetics — early morning streets, gym chalk, a desk lamp at night, rain on a window. High contrast, cinematic. No text, no logos, no identifiable faces.",
    overlayValueProps: [
      "Say it out loud. Logged.",
      "Broken promises get caught",
      "A weekly honest scoreboard",
    ],
    cardBackground: "near-black charcoal background with a single warm amber accent",
  },
};

// ─── Ad-creative image formats (2026-09-23, per Keenan) ───────────────────
//
// First batch shipped as pure mood photography — zero hook, value prop, or
// CTA in the image. Keenan: "these need to be based on true successful ads
// with CTA, value props, etc. otherwise they won't convert". These five
// formats mirror proven direct-response static formats for app ads; each
// bakes the exact ad copy INTO the creative (same exact-text technique the
// content factory validated for quote carousels). Rotation across a
// 10-ad batch = each format tested twice per week.

const CTA_LABELS: Record<string, string> = {
  LEARN_MORE: "Learn more",
  SIGN_UP: "Start free trial",
  GET_OFFER: "Try it free",
  DOWNLOAD: "Get the app",
  SUBSCRIBE: "Start free trial",
};

export interface AdImageCopy {
  headline: string;
  description: string;
  cta: string;
  imageScene: string;
  // Pain → fix bridge (2026-09-24, per Keenan: ads "aren't really tying in
  // the users pains to what our product does and how we solve it"). All
  // optional so older creatives still rebuild.
  /** What Ripple concretely does about THIS ad's pain, one sentence. */
  solutionLine?: string;
  /** Three benefit lines tied to THIS pain (replaces the fixed per-group props). */
  benefits?: string[];
  /** Something she/he would actually say out loud in a debrief. */
  said?: string;
  /** What Ripple pulls out of `said`: tasks, habits, promises, patterns. */
  caught?: string[];
}

// The extra copy fields aren't DB columns, so they ride in the stored
// generationPrompt as one tagged line. generateBatchImage strips it before
// anything reaches the image model; the regen path parses it back.
const AD_COPY_TAG = "[[AD_COPY:";
export function encodeAdCopy(c: AdImageCopy): string {
  const extra = { solutionLine: c.solutionLine, benefits: c.benefits, said: c.said, caught: c.caught };
  return `\n${AD_COPY_TAG}${JSON.stringify(extra)}]]`;
}
export function decodeAdCopy(prompt: string | null | undefined): Partial<AdImageCopy> {
  if (!prompt) return {};
  const i = prompt.lastIndexOf(AD_COPY_TAG);
  if (i < 0) return {};
  try {
    return JSON.parse(prompt.slice(i + AD_COPY_TAG.length, prompt.lastIndexOf("]]")));
  } catch {
    return {};
  }
}
export function stripAdCopy(prompt: string): string {
  const i = prompt.lastIndexOf(AD_COPY_TAG);
  return i < 0 ? prompt : prompt.slice(0, i).trimEnd();
}

const benefitsFor = (c: AdImageCopy, g: GroupConfig): string[] =>
  c.benefits && c.benefits.length >= 3 ? c.benefits.slice(0, 3) : g.overlayValueProps;

const EXACT_TEXT_RULES = `TEXT RENDERING RULES (critical):
- Render every quoted string EXACTLY as written — correct spelling, no words added, none dropped.
- Clean modern sans-serif typography, high contrast, easily legible on a phone screen.
- No other text anywhere in the image beyond the strings specified.
- No logos, no watermarks, no identifiable faces.
- No medicine, pills, pill bottles, supplements or medical objects anywhere in the image (Meta health policy — they imply a condition).
- ${SAFE_ZONE_RULES}`;

type AdFormatBuilder = (copy: AdImageCopy, g: GroupConfig) => string;

export const APP_PROOF_FORMAT = "app-proof";
export const SAY_CATCH_FORMAT = "say-catch";

/**
 * key → prompt builder. Order defines the rotation across a batch.
 * v2 (2026-09-24): every format carries the PAIN → FIX bridge — the
 * headline names the pain, the solution line / benefits say what Ripple
 * does about THAT pain, and photo scenes show the pain moment itself
 * instead of generic mood (coffee cups, notebooks). `offered: false`
 * keeps a retired format resolvable for old creatives but out of new
 * batches.
 */
export const AD_FORMATS: Array<{ key: string; build: AdFormatBuilder; offered?: boolean }> = [
  {
    // 1. Pain photo + hook + the fix — the scene is the pain moment
    key: "hook-overlay",
    build: (c, g) => `Direct-response social media ad, vertical 2:3 portrait.
Background photograph: ${g.photoStyle} Scene — show THIS exact moment of the problem, happening, so a viewer recognizes their own life in it: ${c.imageScene} Composed with generous negative space and a subtle dark gradient behind the text areas for legibility.
Text baked into the image:
- Large bold headline across the upper third: "${c.headline}"
- Medium-weight line in the lower third, above the button: "${c.solutionLine ?? c.description}"
- Rounded solid CTA button pill centered near the bottom with the label: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
  {
    // 2. Notes-app "ugly ad" — the pain as the note title, the fix as the checklist
    key: "notes-app",
    build: (c, g) => {
      const b = benefitsFor(c, g);
      return `Social media ad styled like a clean screenshot of a minimal phone notes app on a plain ${g.cardBackground}. Native, un-designed, screenshot-like feel — this intentionally does NOT look like a polished ad.
The note contains, top to bottom:
- Note title in bold: "${c.headline}"
- Three checklist lines, each with a small checkbox: "${b[0]}", "${b[1]}", "${b[2]}"
- A thin divider, then a small button-style bar at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`;
    },
  },
  {
    // 3. Bold statement card — the pain big, the fix beneath it
    key: "statement-card",
    build: (c, g) => `Typographic direct-response social ad, vertical 2:3 portrait, on a flat ${g.cardBackground}. No photograph — typography IS the creative.
Text baked into the image:
- Huge bold statement filling most of the frame: "${c.headline}"
- Smaller supporting line beneath it: "${c.solutionLine ?? c.description}"
- Small rounded CTA button pill at the bottom: "${ctaLabel(c.cta)}"
- Tiny brand name bottom corner: "Ripple"
${EXACT_TEXT_RULES}`,
  },
  {
    // 4. Checklist over the pain photo — hook + three pain-specific fixes
    key: "checklist-photo",
    build: (c, g) => {
      const b = benefitsFor(c, g);
      return `Direct-response social media ad, vertical 2:3 portrait.
Background photograph, heavily darkened/softened so text dominates: ${g.photoStyle} Scene — the moment of the problem: ${c.imageScene}
Text baked into the image:
- Bold headline at top: "${c.headline}"
- Three lines below it, each preceded by a small checkmark: "${b[0]}", "${b[1]}", "${b[2]}"
- Rounded solid CTA button pill at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`;
    },
  },
  {
    // 5. RETIRED from new batches (2026-09-24): a phone with a record
    // button said nothing about what Ripple does. Kept resolvable.
    key: "app-in-scene",
    offered: false,
    build: (c, g) => `Direct-response social media ad for a voice journaling app, vertical 2:3 portrait.
Background photograph: ${g.photoStyle} A smartphone rests naturally in the scene (on a table or held, hands only), its screen showing an extremely minimal dark app interface: a large round record button and a soft audio waveform — no readable UI text on the phone screen.
Text baked into the image:
- Large bold headline across the top: "${c.headline}"
- Medium-weight line above the button: "${c.solutionLine ?? c.description}"
- Rounded solid CTA button pill at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
  {
    // 6. Say-catch (2026-09-24) — the mechanism in one glance: what you
    // say out loud → what Ripple catches from it. Composed in code
    // (lib/adlab/ad-render.ts) so every word is exact; this string is
    // only a stored marker (the copy rides in the AD_COPY tag).
    key: SAY_CATCH_FORMAT,
    build: (c) => `SAY_CATCH (composed in code, no image model): headline "${c.headline}", said "${c.said ?? ""}".`,
  },
  {
    // 6. App-proof (2026-09-24) — a REAL app screenshot under the hook.
    // Composed in code (lib/adlab/ad-render.ts), not by the image model,
    // which can't draw our UI; this "prompt" is only a stored marker.
    key: APP_PROOF_FORMAT,
    build: (c) => `APP_PROOF (composed in code, no image model): headline "${c.headline}", subline "${c.description}", CTA "${ctaLabel(c.cta)}".`,
  },
];

function ctaLabel(cta: string): string {
  return CTA_LABELS[cta] ?? "Start free trial";
}

export const AD_FORMAT_KEYS = AD_FORMATS.filter((f) => f.offered !== false).map((f) => f.key) as [string, ...string[]];

/**
 * Resolve a format by key (stored AdLabCreative.formatKey) or, for rows
 * without one, by rotation index.
 */
export function resolveAdFormat(format: string | number): (typeof AD_FORMATS)[number] {
  if (typeof format === "string") {
    const f = AD_FORMATS.find((x) => x.key === format);
    if (f) return f;
    return AD_FORMATS[0];
  }
  return AD_FORMATS[format % AD_FORMATS.length];
}

/**
 * Deterministic image prompt — same builder is used at batch creation and by
 * the regen path, so prompts can always be rebuilt from the stored copy
 * fields + formatKey alone.
 */
export function buildAdImagePrompt(
  format: string | number,
  copy: AdImageCopy,
  groupKey: BatchGroupKey
): string {
  return resolveAdFormat(format).build(copy, BATCH_GROUPS[groupKey]) + encodeAdCopy(copy);
}

// ─── Project seeding ──────────────────────────────────────────────────────

/**
 * Ensure the two group projects exist. Meta config (ad account, pixel,
 * page, app id) is copied from the original "acuity" project so Keenan's
 * settings carry over. Existing projects are NOT overwritten.
 */
export async function ensureGroupProject(groupKey: BatchGroupKey): Promise<{ id: string }> {
  const g = BATCH_GROUPS[groupKey];
  const existing = await prisma.adLabProject.findUnique({ where: { slug: g.projectSlug } });
  if (existing) return { id: existing.id };

  const base = await prisma.adLabProject.findUnique({ where: { slug: "acuity" } });

  const project = await prisma.adLabProject.create({
    data: {
      name: g.projectName,
      slug: g.projectSlug,
      brandVoiceGuide: g.brandVoiceGuide,
      targetAudience: g.targetAudience as Prisma.InputJsonValue,
      usps: g.usps,
      bannedPhrases: SHARED_BANNED,
      imageStylePrompt: g.imageStylePrompt,
      logoUrl: base?.logoUrl ?? "https://goripple.io/icon-512.png",
      targetCplCents: base?.targetCplCents ?? 500,
      dailyBudgetCentsPerVariant: base?.dailyBudgetCentsPerVariant ?? 1000,
      testDurationDays: base?.testDurationDays ?? 14,
      metaAdAccountId: base?.metaAdAccountId ?? process.env.META_AD_ACCOUNT_ID ?? "",
      metaPixelId: base?.metaPixelId ?? "",
      metaPageId: base?.metaPageId ?? "",
      metaAppId: base?.metaAppId ?? "",
      landingPageUrl: base?.landingPageUrl ?? "https://goripple.io",
      conversionEvent: base?.conversionEvent ?? "Lead",
      conversionObjective: base?.conversionObjective ?? "OUTCOME_LEADS",
    },
  });
  console.log(`[adlab-weekly] Created project ${g.projectSlug} (${project.id})`);
  return { id: project.id };
}

// ─── Batch generation (copy) ──────────────────────────────────────────────

const VALUE_SURFACES = [
  "problem",
  "outcome",
  "social_proof",
  "mechanism",
  "story",
  "comparison",
  "identity",
  "urgency",
] as const;

const BatchAdSchema = z.object({
  theme: z.string(),
  hypothesis: z.string(),
  targetPersona: z.string(),
  valueSurface: z.enum(VALUE_SURFACES),
  headline: z.string().max(255),
  primaryText: z.string().max(2000),
  description: z.string().max(255),
  cta: z.string(),
  imageScene: z.string(),
  // Pain → fix bridge (2026-09-24)
  // Hard caps are roomier than the prompt's targets: one long line used to
  // reject the whole 10-ad batch (2026-09-24 women's run). Renderers wrap.
  solutionLine: z.string().max(160),
  benefits: z.array(z.string().max(70)).min(3).transform((b) => b.slice(0, 3)),
  said: z.string().max(240),
  caught: z.array(z.string().max(80)).min(3).transform((c) => c.slice(0, 3)),
  // Learning loop (2026-09-24): which image format carries this ad, and
  // whether it applies a proven winning pattern or tests something new.
  format: z.enum(AD_FORMAT_KEYS).optional(),
  strategy: z.enum(["exploit", "explore"]).optional(),
});

/**
 * Per-ad tolerant parse (2026-09-24): the women's batch failed outright
 * because ONE ad put a format name ("app-proof") in valueSurface. Coerce
 * that known slip, keep every ad that validates, and only fail when fewer
 * than 6 survive.
 */
export function parseBatchAds(raw: string): z.infer<typeof BatchAdSchema>[] {
  const arr = JSON.parse(extractJson(raw));
  if (!Array.isArray(arr)) throw new Error("batch copy is not a JSON array");
  const ok: z.infer<typeof BatchAdSchema>[] = [];
  const problems: string[] = [];
  arr.forEach((item: Record<string, unknown>, i: number) => {
    if (item && typeof item === "object" && !VALUE_SURFACES.includes(item.valueSurface as (typeof VALUE_SURFACES)[number])) {
      // A format key or anything else in the wrong field → nearest surface.
      item.valueSurface = typeof item.valueSurface === "string" && /proof|catch|mechanism/i.test(item.valueSurface) ? "mechanism" : "problem";
    }
    const r = BatchAdSchema.safeParse(item);
    if (r.success) ok.push(r.data);
    else problems.push(`ad ${i + 1}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
  });
  if (problems.length) console.warn(`[adlab-weekly] dropped ${problems.length} invalid ad(s): ${problems.join(" | ").slice(0, 800)}`);
  if (ok.length < 6) throw new Error(`only ${ok.length} valid ads — ${problems.join(" | ").slice(0, 600)}`);
  return ok;
}

interface DigestTheme {
  theme: string;
  why: string;
  angle: string;
  phrases: string[];
}

/**
 * Create this week's experiment + 10 angle/creative pairs for a group.
 * Copy only — images are generated separately (see generateBatchImage) so
 * the Inngest function can chunk them into steps.
 */
export async function createBatchForGroup(
  groupKey: BatchGroupKey
): Promise<{ experimentId: string; creativeIds: string[]; digestDate: string }> {
  const g = BATCH_GROUPS[groupKey];
  const { id: projectId } = await ensureGroupProject(groupKey);
  const project = await prisma.adLabProject.findUniqueOrThrow({ where: { id: projectId } });

  // Freshest digest for this group's brand, max 14 days old
  const digest = await prisma.redditTrendDigest.findFirst({
    where: {
      brand: g.digestBrand,
      date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: "desc" },
  });
  if (!digest) {
    throw new Error(`No RedditTrendDigest (brand=${g.digestBrand}) in the last 14 days`);
  }

  const themes = (digest.themes as unknown as DigestTheme[]).slice(0, 12);

  // Learning loop: our own per-creative trial-start results, and what
  // long-running competitor ads are doing. Both soft — a missing brief just
  // means the batch runs on Reddit research alone, as before.
  const { getLatestLearning, renderLearningForBatch } = await import("@/lib/adlab/learning");
  const learning = await getLatestLearning(groupKey).catch(() => null);
  const { section: learningSection, exploitCount } = renderLearningForBatch(learning);
  const { getLatestCompetitorBrief, renderCompetitorBriefForBatch } = await import(
    "@/lib/adlab/competitor-research"
  );
  const competitorBrief = await getLatestCompetitorBrief(groupKey).catch(() => null);
  const competitorSection = renderCompetitorBriefForBatch(competitorBrief);
  const preferredFormats = (learning?.brief?.preferredFormats ?? []).filter((f) =>
    AD_FORMAT_KEYS.includes(f)
  );
  const digestDate = digest.date.toISOString().slice(0, 10);
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });


  const systemPrompt = `You are an expert direct-response Meta ads copywriter. Generate 10 COMPLETE, DISTINCT ad creatives grounded in real audience research.

PRODUCT (ground truth — never claim beyond this):
${PRODUCT_TRUTH}

AUDIENCE: ${g.audienceLabel}

BRAND VOICE:
${g.brandVoiceGuide}

USPs (pick the one that best answers each pain — don't cram them all in):
${JSON.stringify(g.usps, null, 2)}

BANNED PHRASES (never use): ${SHARED_BANNED.join(", ")}
${learningSection ? `\n${learningSection}\n` : ""}${competitorSection ? `\n${competitorSection}\n` : ""}
THIS WEEK'S REDDIT AUDIENCE PULSE (real distilled pain from the audience's own threads — every ad MUST be rooted in exactly one of these themes):
${themes.map((t, i) => `${i + 1}. THEME: ${t.theme}\n   WHY IT'S LIVE THIS WEEK: ${t.why}\n   SUGGESTED ANGLE: ${t.angle}\n   THEIR OWN PHRASES: ${(t.phrases ?? []).join(" | ")}`).join("\n\n")}

VALUE SURFACE DEFINITIONS:
- problem: Lead with the pain the user already feels
- outcome: Lead with the result they want
- social_proof: Lead with what others have experienced
- mechanism: Lead with how the product works
- story: Lead with a narrative arc
- comparison: Lead with contrast to alternatives
- identity: Lead with who the user is/wants to be
- urgency: Lead with scarcity or time pressure

REQUIREMENTS:
- EXACTLY 10 ads. Each rooted in a DIFFERENT theme where possible (reuse a theme only if there are fewer than 10).
- The 10 must span at least 6 different valueSurface values — every ad should feel like a different TYPE of ad, not a rewrite.
- THE BRIDGE IS THE AD (non-negotiable, per the owner: ads must tie the user's pain to what Ripple does and how it solves it). Every ad has three beats: (1) the PAIN, named in the audience's own words so a stranger instantly knows which problem this is; (2) the MECHANISM — the specific thing Ripple does about that exact pain (pulls the tasks out of what you say, checks off the habit you mentioned, tracks the promise you made, names the pattern that repeats, scores the life area that's slipping, writes the weekly report); (3) the RESULT for them. Clever abstract lines that don't name a problem ("Same week. Different eyes.", "Silence is where the work is.") are WRONG.
- headline: the PAIN, HARD max 40 characters, count them (mobile truncation). A concrete, recognizable problem in plain words — ideally their own phrasing. Test: could someone who has never heard of Ripple tell exactly what problem this ad is about?
- solutionLine: max 90 characters. What Ripple concretely does about THIS headline's pain, as a plain statement ("Say it once. Ripple turns it into your to-do list and keeps it."). Must name a real feature from PRODUCT. No durations.
- benefits: exactly 3 lines, each max 40 characters, each a concrete thing Ripple does for THIS pain (not generic, not repeated across ads).
- said: max 140 characters. One realistic thing this person would actually say out loud in a debrief, in their voice, with specifics (names, days, errands, excuses) that show this ad's pain.
- caught: exactly 3 lines, each max 44 characters — what Ripple pulls out of "said": tasks ("Sign Emma's permission slip — Friday"), habits ("Habit missed: gym, 3rd time"), promises, or a pattern ("Third week in a row: no time for you"). Only things "said" actually contains.
- primaryText: 1-2 sentences, HARD max 125 characters — Meta cuts to "…more" after that and compliance flags anything longer.
- description: max 100 characters.
- cta: always "SIGN_UP" (renders as "Start free trial"). In our own data SIGN_UP ads produced trial starts at roughly half the cost of LEARN_MORE.
- imageScene: 1-2 sentences showing THIS ad's pain as a concrete moment happening (e.g. a kitchen counter buried in permission slips, a calendar and sticky notes at 11pm; a gym bag untouched by the door at 7am, a phone lit in a dark bedroom at 2am), matching the brand's photography style. NOT generic mood (no lone coffee cups, candles, or empty notebooks). Scene only — text is composed separately. No faces.
- format: the image format carrying this ad, one of: ${AD_FORMAT_KEYS.join(", ")}. hook-overlay = photo of the pain moment + the pain headline + the solution line + CTA; notes-app = native-looking phone-notes checklist (pain as title, benefits as checklist — "ugly ad"); statement-card = typography only (pain big, solution line beneath); checklist-photo = pain headline + the 3 benefits over a darkened pain photo; say-catch = the mechanism in one glance: "You say it:" (said) → "Ripple catches it:" (caught) → solution line; app-proof = the pain headline above a REAL screenshot of the app (${groupKey === "women" ? "the Life Matrix: 6 life areas scored over time" : "the Theme Map: the recurring themes in what he says"}) — the description becomes the one-line subline saying what the screenshot proves (≤60 chars). Use say-catch for 3 of the 10 and app-proof for 2. Use at least 4 different formats across the 10.${preferredFormats.length ? ` Our data favors: ${preferredFormats.join(", ")} — give these most exploit ads.` : ""}
- No recording-duration claims anywhere ("a minute", "60 seconds", "one minute a day"), never "journaling"/"journal" as the category, never "brain dump".
- strategy: "exploit" or "explore"${exploitCount ? ` — exactly ${exploitCount} exploit (see EXPLOIT / EXPLORE SPLIT)` : ` — no performance history yet, mark all "explore"`}.

META POLICY (violations get ads rejected — follow strictly):
- NEVER use 'you/your' in a way that implies a personal attribute (health condition, mental state, finances). "You feel stuck" is fine; "your anxiety" is not.
- NEVER reference medical/mental-health conditions as belonging to the reader.
- NEVER use before/after transformation framing or promise wellness outcomes.
- Use third-person or general framing for sensitive topics: "Most people forget what they promised themselves by Thursday."

Return ONLY a JSON array of exactly 10 objects with keys: theme, hypothesis, targetPersona, valueSurface, headline, primaryText, description, cta, imageScene, solutionLine, benefits, said, caught, format, strategy`;

  const userPrompt = `Generate the 10 ads for this week's batch. Return only the JSON array.`;

  let ads: z.infer<typeof BatchAdSchema>[];
  try {
    const raw = await callAdLabClaude({
      purpose: `weekly-batch-${groupKey}`,
      systemPrompt,
      userPrompt,
      maxTokens: 8000,
    });
    ads = parseBatchAds(raw);
  } catch (err1) {
    // One retry with error feedback
    const raw2 = await callAdLabClaude({
      purpose: `weekly-batch-${groupKey}-retry`,
      systemPrompt,
      userPrompt: `${userPrompt}\n\nIMPORTANT: Your previous response failed validation: ${err1 instanceof Error ? err1.message.slice(0, 500) : String(err1)}\nReturn EXACTLY 10 objects with ALL required keys (theme, hypothesis, targetPersona, valueSurface, headline, primaryText, description, cta, imageScene, solutionLine, benefits (3), said, caught (3), format, strategy). valueSurface must be one of: ${VALUE_SURFACES.join(", ")}.`,
      maxTokens: 8000,
    });
    ads = parseBatchAds(raw2);
  }

  // Created only once the copy is good (2026-09-24): an experiment made
  // first and left empty by a failed parse became the "latest" batch and
  // blanked the group on the review page.
  const experiment = await prisma.adLabExperiment.create({
    data: {
      projectId,
      topicBrief: `Weekly Reddit-grounded batch (${weekLabel}) — 10 ads from the ${digestDate} audience pulse for ${g.audienceLabel}. Each ad bridges one Reddit pain theme to what Ripple does.`,
      status: "awaiting_approval",
      campaignName: `${g.projectName} | Reddit batch ${weekLabel}`,
      // Informational: launches go into the group's evergreen ad set, which
      // optimizes for signups regardless (lib/adlab/evergreen.ts).
      campaignObjective: "OUTCOME_SALES",
      optimizationEvent: "COMPLETE_REGISTRATION",
      campaignTags: ["weekly-reddit-batch", groupKey],
    },
  });

  const creativeIds: string[] = [];
  for (const [adIndex, ad] of ads.slice(0, 10).entries()) {
    const formatKey = ad.format ?? resolveAdFormat(adIndex).key;
    // SIGN_UP everywhere (2026-09-24): ~$68/trial vs ~$123 for LEARN_MORE
    // in our own history. The prompt asks for it; this guarantees it.
    ad.cta = "SIGN_UP";
    const strategy = ad.strategy ?? "explore";
    const angle = await prisma.adLabAngle.create({
      data: {
        experimentId: experiment.id,
        hypothesis: ad.hypothesis,
        targetPersona: ad.targetPersona,
        valueSurface: ad.valueSurface,
        // "| strategy:" is parsed back by lib/adlab/learning.ts — keep format
        researchNotes: `Reddit theme (${digestDate}): ${ad.theme} | strategy: ${strategy}`,
        score: 5,
      },
    });
    const creative = await prisma.adLabCreative.create({
      data: {
        angleId: angle.id,
        creativeType: "image",
        headline: ad.headline,
        primaryText: ad.primaryText,
        description: ad.description,
        cta: ad.cta,
        formatKey,
        generationPrompt: buildAdImagePrompt(formatKey, ad, groupKey),
        complianceStatus: "pending",
        approved: false,
      },
    });
    creativeIds.push(creative.id);
  }

  console.log(`[adlab-weekly] ${groupKey}: experiment ${experiment.id}, ${creativeIds.length} creatives`);
  return { experimentId: experiment.id, creativeIds, digestDate };
}

// ─── Image generation ─────────────────────────────────────────────────────

let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.ACUITY_ADLAB_OPENAI_KEY, timeout: 120_000 });
  }
  return _openai;
}

/**
 * Generate + upload the image for one batch creative (its generationPrompt
 * already contains format + style + baked copy). Soft-fails: on error the
 * creative keeps imageUrl=null and a note; the review UI shows it without
 * an image. Pass force=true to regenerate over an existing image (filename
 * is timestamped so the public URL changes — no stale CDN cache).
 */
export async function generateBatchImage(
  creativeId: string,
  opts?: { force?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const creative = await prisma.adLabCreative.findUnique({
    where: { id: creativeId },
    include: { angle: { select: { experiment: { select: { campaignTags: true } } } } },
  });
  if (!creative) return { ok: false, error: "creative not found" };
  if (creative.imageUrl && creative.storyImageUrl && !opts?.force) return { ok: true };

  try {
    // Both placements (2026-09-24): feed 4:5 → imageUrl, story 9:16 →
    // storyImageUrl. App-proof is composed in code from a real app
    // screenshot; every other format is one 2:3 portrait render from the
    // image model, cut into the two crops (prompts keep text in the
    // shared safe zone — see ad-render.ts).
    let placements: { feed: Buffer; story: Buffer };
    if (creative.formatKey === SAY_CATCH_FORMAT) {
      const tags = creative.angle.experiment.campaignTags;
      const groupKey: BatchGroupKey = tags.includes("men") ? "men" : "women";
      const extra = decodeAdCopy(creative.generationPrompt);
      if (!extra.said || !extra.caught?.length) throw new Error("say-catch creative has no said/caught copy");
      placements = await renderSayCatchPlacements(groupKey, {
        headline: creative.headline,
        said: extra.said,
        caught: extra.caught,
        solution: extra.solutionLine ?? creative.description,
        ctaLabel: ctaLabel(creative.cta),
      });
    } else if (creative.formatKey === APP_PROOF_FORMAT) {
      const tags = creative.angle.experiment.campaignTags;
      const groupKey: BatchGroupKey = tags.includes("men") ? "men" : "women";
      placements = await renderAppProofPlacements(groupKey, {
        headline: creative.headline,
        subline: creative.description,
        ctaLabel: ctaLabel(creative.cta),
      });
    } else {
      if (!process.env.ACUITY_ADLAB_OPENAI_KEY) {
        return { ok: false, error: "ACUITY_ADLAB_OPENAI_KEY not configured" };
      }
      const response = await openai().images.generate({
        model: "gpt-image-2",
        // Always max fidelity for ads (2026-09-24, per Keenan: "all adlab images
        // should be generated with the high quality images from the gpt2 api").
        quality: "high",
        // The AD_COPY tag is data for us, never text for the image model.
        prompt: stripAdCopy(creative.generationPrompt ?? creative.headline),
        n: 1,
        size: SOURCE_SIZE,
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error("gpt-image-2 returned no image data");
      placements = await cutPlacements(Buffer.from(b64, "base64"));
    }

    const { supabase } = await import("@/lib/supabase.server");
    // Timestamped names: a regen gets a fresh public URL (no stale CDN).
    const stamp = Date.now();
    const upload = async (suffix: string, buf: Buffer) => {
      const filename = `${creative.id}-${suffix}-${stamp}.jpg`;
      const { error } = await supabase.storage
        .from("adlab-creatives")
        .upload(filename, buf, { contentType: "image/jpeg", upsert: true });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
      return supabase.storage.from("adlab-creatives").getPublicUrl(filename).data.publicUrl;
    };
    const [imageUrl, storyImageUrl] = await Promise.all([
      upload("feed", placements.feed),
      upload("story", placements.story),
    ]);
    await prisma.adLabCreative.update({
      where: { id: creativeId },
      data: { imageUrl, storyImageUrl },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[adlab-weekly] image failed for ${creativeId}: ${msg}`);
    await prisma.adLabCreative
      .update({
        where: { id: creativeId },
        data: { complianceNotes: `IMAGE_ERROR: ${msg}`.slice(0, 500) },
      })
      .catch(() => {});
    return { ok: false, error: msg };
  }
}

// ─── Review email ─────────────────────────────────────────────────────────

export interface GroupBatchSummary {
  groupKey: BatchGroupKey;
  experimentId: string;
  digestDate: string;
  creativeCount: number;
  imagesOk: number;
  compliance: { passCount: number; warnCount: number; failCount: number };
  headlines: string[];
  error?: string;
}

export async function sendWeeklyBatchEmail(summaries: GroupBatchSummary[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[adlab-weekly] RESEND_API_KEY missing — skipping review email");
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const total = summaries.reduce((n, s) => n + s.creativeCount, 0);
  const reviewUrl = "https://goripple.io/admin/adlab/review";

  const groupBlock = (s: GroupBatchSummary) => {
    const g = BATCH_GROUPS[s.groupKey];
    if (s.error) {
      return `<div style="background:#fdf0f0;border:1px solid #eccccc;border-radius:10px;padding:16px 18px;margin:0 0 12px;">
        <p style="font-size:16px;font-weight:700;margin:0 0 6px;">${g.projectName}</p>
        <p style="font-size:13px;color:#8a1f1f;margin:0;">Batch failed: ${s.error}</p></div>`;
    }
    return `<div style="background:#f8f9fb;border:1px solid #e5e8ee;border-radius:10px;padding:16px 18px;margin:0 0 12px;">
      <p style="font-size:16px;font-weight:700;margin:0 0 6px;">${g.projectName}</p>
      <p style="font-size:13px;color:#3d4453;margin:0 0 10px;">${s.creativeCount} ads from the ${s.digestDate} Reddit pulse &middot; ${s.imagesOk}/${s.creativeCount} images &middot; compliance: ${s.compliance.passCount} pass / ${s.compliance.warnCount} warn / ${s.compliance.failCount} fail</p>
      <ol style="font-size:13px;color:#1f2430;margin:0;padding-left:20px;line-height:1.7;">
        ${s.headlines.map((h) => `<li>${h}</li>`).join("")}
      </ol></div>`;
  };

  const html = `<div style="max-width:640px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2430;">
    <p style="font-size:24px;font-weight:800;margin:0 0 6px;">${total} Reddit-grounded ads ready for review</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">This week's batch is generated and compliance-checked. Nothing is on Meta yet — approve the ones you like, set budget and destination, and hit Launch. That click is the only thing that spends money.</p>
    <p style="margin:0 0 24px;"><a href="${reviewUrl}" style="display:inline-block;background:#0f4c81;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;">Review &amp; approve &rarr;</a></p>
    ${summaries.map(groupBlock).join("")}
    <p style="font-size:12px;color:#9aa1ad;margin:20px 0 0;">Generated ${new Date().toISOString().slice(0, 10)} from the weekly Reddit audience pulse.</p>
  </div>`;

  const { error } = await resend.emails.send({
    from: process.env.CONTENT_FACTORY_EMAIL_FROM ?? '"Ripple AdLab" <content@getacuity.io>',
    to: "keenan@heelerdigital.com",
    replyTo: "keenan@heelerdigital.com",
    subject: `AdLab: ${total} Reddit-grounded ads ready for Sunday review`,
    html,
  });
  if (error) {
    console.error(`[adlab-weekly] review email failed: ${JSON.stringify(error)}`);
  } else {
    console.log("[adlab-weekly] review email sent");
  }
}
