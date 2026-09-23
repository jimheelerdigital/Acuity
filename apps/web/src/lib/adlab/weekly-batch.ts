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
 * approved=false creatives; Keenan reviews at /admin/adlab/review, sets
 * budget + destination, and his "Launch approved" click is the only path
 * to spend (existing /ads/launch + /ads/activate routes).
 */

import { z } from "zod";
import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { callAdLabClaude, extractJson } from "@/lib/adlab/claude";
import { displayMonthly } from "@/lib/pricing";

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

interface AdImageCopy {
  headline: string;
  description: string;
  cta: string;
  imageScene: string;
}

const EXACT_TEXT_RULES = `TEXT RENDERING RULES (critical):
- Render every quoted string EXACTLY as written — correct spelling, no words added, none dropped.
- Clean modern sans-serif typography, high contrast, easily legible on a phone screen.
- No other text anywhere in the image beyond the strings specified.
- No logos, no watermarks, no identifiable faces.
- Square 1:1 social ad, all text inside safe margins (nothing within 60px of any edge).`;

type AdFormatBuilder = (copy: AdImageCopy, g: GroupConfig) => string;

/** key → prompt builder. Order defines the rotation across a batch. */
export const AD_FORMATS: Array<{ key: string; build: AdFormatBuilder }> = [
  {
    // 1. Classic hook overlay — photo background, big hook, CTA pill
    key: "hook-overlay",
    build: (c, g) => `Direct-response social media ad, square 1:1.
Background photograph: ${g.photoStyle} Scene: ${c.imageScene} Composed with generous negative space and a subtle dark gradient behind the text areas for legibility.
Text baked into the image:
- Large bold headline across the upper third: "${c.headline}"
- Rounded solid CTA button pill centered near the bottom with the label: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
  {
    // 2. Notes-app "ugly ad" — native-feeling checklist screenshot style
    key: "notes-app",
    build: (c, g) => `Social media ad styled like a clean screenshot of a minimal phone notes app on a plain ${g.cardBackground}. Native, un-designed, screenshot-like feel — this intentionally does NOT look like a polished ad.
The note contains, top to bottom:
- Note title in bold: "${c.headline}"
- Three checklist lines, each with a small checkbox: "${g.overlayValueProps[0]}", "${g.overlayValueProps[1]}", "${g.overlayValueProps[2]}"
- A thin divider, then a small button-style bar at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
  {
    // 3. Bold statement card — typographic scroll-stopper
    key: "statement-card",
    build: (c, g) => `Typographic direct-response social ad, square 1:1, on a flat ${g.cardBackground}. No photograph — typography IS the creative.
Text baked into the image:
- Huge bold statement filling most of the frame: "${c.headline}"
- Smaller supporting line beneath it: "${c.description}"
- Small rounded CTA button pill at the bottom: "${ctaLabel(c.cta)}"
- Tiny brand name bottom corner: "Ripple"
${EXACT_TEXT_RULES}`,
  },
  {
    // 4. Checklist over photo — hook + value props + CTA
    key: "checklist-photo",
    build: (c, g) => `Direct-response social media ad, square 1:1.
Background photograph, heavily darkened/softened so text dominates: ${g.photoStyle} Scene: ${c.imageScene}
Text baked into the image:
- Bold headline at top: "${c.headline}"
- Three lines below it, each preceded by a small checkmark: "${g.overlayValueProps[0]}", "${g.overlayValueProps[1]}", "${g.overlayValueProps[2]}"
- Rounded solid CTA button pill at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
  {
    // 5. App-in-scene — phone with minimal record screen + hook
    key: "app-in-scene",
    build: (c, g) => `Direct-response social media ad for a voice journaling app, square 1:1.
Background photograph: ${g.photoStyle} A smartphone rests naturally in the scene (on a table or held, hands only), its screen showing an extremely minimal dark app interface: a large round record button and a soft audio waveform — no readable UI text on the phone screen.
Text baked into the image:
- Large bold headline across the top: "${c.headline}"
- Rounded solid CTA button pill at the bottom: "${ctaLabel(c.cta)}"
${EXACT_TEXT_RULES}`,
  },
];

function ctaLabel(cta: string): string {
  return CTA_LABELS[cta] ?? "Start free trial";
}

/**
 * Deterministic prompt for creative #index of a batch — same builder is used
 * at batch creation and by the regen path, so prompts can always be rebuilt
 * from the stored copy fields alone.
 */
export function buildAdImagePrompt(index: number, copy: AdImageCopy, groupKey: BatchGroupKey): string {
  const format = AD_FORMATS[index % AD_FORMATS.length];
  return format.build(copy, BATCH_GROUPS[groupKey]);
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
});

const BatchAdsSchema = z.array(BatchAdSchema).min(8).max(12);

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
  const digestDate = digest.date.toISOString().slice(0, 10);
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const experiment = await prisma.adLabExperiment.create({
    data: {
      projectId,
      topicBrief: `Weekly Reddit-grounded batch (${weekLabel}) — 10 ads from the ${digestDate} audience pulse for ${g.audienceLabel}. Each ad bridges one Reddit pain theme to what Ripple does.`,
      status: "awaiting_approval",
      campaignName: `${g.projectName} | Reddit batch ${weekLabel}`,
      campaignObjective: "OUTCOME_TRAFFIC",
      campaignTags: ["weekly-reddit-batch", groupKey],
    },
  });

  const systemPrompt = `You are an expert direct-response Meta ads copywriter. Generate 10 COMPLETE, DISTINCT ad creatives grounded in real audience research.

PRODUCT (ground truth — never claim beyond this):
${PRODUCT_TRUTH}

AUDIENCE: ${g.audienceLabel}

BRAND VOICE:
${g.brandVoiceGuide}

USPs (pick the one that best answers each pain — don't cram them all in):
${JSON.stringify(g.usps, null, 2)}

BANNED PHRASES (never use): ${SHARED_BANNED.join(", ")}

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
- Each ad must bridge: their pain (in language echoing THEIR OWN PHRASES) → what Ripple concretely does about it. The bridge is the ad.
- headline: max 40 characters (mobile truncation).
- primaryText: 1-3 sentences, roughly 80-200 characters.
- description: max 100 characters.
- cta: one of LEARN_MORE, SIGN_UP, GET_OFFER, DOWNLOAD, SUBSCRIBE.
- imageScene: 1-2 sentence BACKGROUND scene for this ad's image, matching the brand's photography style. Scene only — the headline/CTA overlay is composed separately. No faces.

META POLICY (violations get ads rejected — follow strictly):
- NEVER use 'you/your' in a way that implies a personal attribute (health condition, mental state, finances). "You feel stuck" is fine; "your anxiety" is not.
- NEVER reference medical/mental-health conditions as belonging to the reader.
- NEVER use before/after transformation framing or promise wellness outcomes.
- Use third-person or general framing for sensitive topics: "Most people forget what they promised themselves by Thursday."

Return ONLY a JSON array of exactly 10 objects with keys: theme, hypothesis, targetPersona, valueSurface, headline, primaryText, description, cta, imageScene`;

  const userPrompt = `Generate the 10 ads for this week's batch. Return only the JSON array.`;

  let ads: z.infer<typeof BatchAdsSchema>;
  try {
    const raw = await callAdLabClaude({
      purpose: `weekly-batch-${groupKey}`,
      systemPrompt,
      userPrompt,
      maxTokens: 8000,
    });
    ads = BatchAdsSchema.parse(JSON.parse(extractJson(raw)));
  } catch (err1) {
    // One retry with error feedback
    const raw2 = await callAdLabClaude({
      purpose: `weekly-batch-${groupKey}-retry`,
      systemPrompt,
      userPrompt: `${userPrompt}\n\nIMPORTANT: Your previous response failed validation: ${err1 instanceof Error ? err1.message.slice(0, 500) : String(err1)}\nReturn EXACTLY 10 objects with ALL required keys (theme, hypothesis, targetPersona, valueSurface, headline, primaryText, description, cta, imageScene). valueSurface must be one of: ${VALUE_SURFACES.join(", ")}.`,
      maxTokens: 8000,
    });
    ads = BatchAdsSchema.parse(JSON.parse(extractJson(raw2)));
  }

  const creativeIds: string[] = [];
  for (const [adIndex, ad] of ads.slice(0, 10).entries()) {
    const angle = await prisma.adLabAngle.create({
      data: {
        experimentId: experiment.id,
        hypothesis: ad.hypothesis,
        targetPersona: ad.targetPersona,
        valueSurface: ad.valueSurface,
        researchNotes: `Reddit theme (${digestDate}): ${ad.theme}`,
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
        generationPrompt: buildAdImagePrompt(adIndex, ad, groupKey),
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
  const creative = await prisma.adLabCreative.findUnique({ where: { id: creativeId } });
  if (!creative) return { ok: false, error: "creative not found" };
  if (creative.imageUrl && !opts?.force) return { ok: true };

  if (!process.env.ACUITY_ADLAB_OPENAI_KEY) {
    return { ok: false, error: "ACUITY_ADLAB_OPENAI_KEY not configured" };
  }

  try {
    const response = await openai().images.generate({
      model: "gpt-image-2",
      prompt: creative.generationPrompt ?? creative.headline,
      n: 1,
      size: "1024x1024",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("gpt-image-2 returned no image data");
    const buffer = Buffer.from(b64, "base64");

    const { supabase } = await import("@/lib/supabase.server");
    const filename = opts?.force ? `${creative.id}-${Date.now()}.png` : `${creative.id}.png`;
    const { error } = await supabase.storage
      .from("adlab-creatives")
      .upload(filename, buffer, { contentType: "image/png", upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);

    const { data } = supabase.storage.from("adlab-creatives").getPublicUrl(filename);
    await prisma.adLabCreative.update({
      where: { id: creativeId },
      data: { imageUrl: data.publicUrl },
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
