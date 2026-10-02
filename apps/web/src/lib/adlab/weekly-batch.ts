/**
 * Weekly Reddit→AdLab ad batch (2026-09-23, per Keenan).
 *
 * Every Sunday (after the Saturday-night Reddit pulse) this generates
 * 10 ad creatives per audience group — each rooted in a different theme
 * from that week's RedditTrendDigest and explicitly bridging the pain to
 * what Ripple does (AI life optimizer: habit tracker, voice journal and insight tool; see lib/positioning.ts) — formerly (AI habit tracker & voice journal with life
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
import sharp from "sharp";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AD_COPY_MODELS, callAdLabClaude, extractJson } from "@/lib/adlab/claude";
import { lastJsonText } from "@/lib/content-factory/claude-client";
import { AD_CLAIM_GUARDRAIL, PRODUCT_CATEGORY, VOICE_PRINCIPLE, productTruth } from "@/lib/positioning";
import { displayMonthly } from "@/lib/pricing";
import { HOOK_STYLES, VIDEO_TEMPLATES, validateVideoScript, type HookStyle, type VideoScript, type VideoTemplate } from "@/lib/adlab/ad-video";
import { SAFE_ZONE_RULES, SOURCE_SIZE, cutPlacements, renderAppProofPlacements, renderSayCatchPlacements, renderTextWallPlacements, renderWeeklyReportPlacements } from "@/lib/adlab/ad-render";

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
  /** Photo styles rotated across a batch, one per ad (2026-09-29). */
  visualStyles: string[];
  /** Background palettes rotated across the typographic formats. */
  cardPalettes: string[];
  /** Everyday specifics most of THIS lane's audience lives (2026-09-30). */
  commonSpecifics: string;
  /** What makes this lane's ads unlike the other lane's ("" = none). */
  laneRule: string;
}

// Product truth comes from lib/positioning.ts (2026-09-29, per Keenan: "AI
// life optimizer, habit tracker, voice journal, and insight tool to help
// people change their lives for the better"), plus the plain mechanics so
// ads say what Ripple actually does.
const PRODUCT_TRUTH = productTruth();

export const APP_PROOF_FORMAT = "app-proof";
export const SAY_CATCH_FORMAT = "say-catch";
export const TEXT_WALL_FORMAT = "text-wall";
export const WEEKLY_REPORT_FORMAT = "weekly-report";
/** Formats drawn by the image model on an AI photo. Research (2026-09-29):
 *  recognisably-AI imagery underperforms, so a batch carries at most 2. */
export const PHOTO_FORMATS = ["hook-overlay", "checklist-photo"];
/** formatKey prefix for the animated video ads (video-voice_to_list …). */
export const VIDEO_FORMAT_PREFIX = "video-";

/**
 * The 10 weekly slots (2026-09-29 rebuild, per Keenan: "do advanced deep
 * research into app conversion and find which ads convert the best and
 * rebuild the pipeline around that" — reports/Subscription app ad creative
 * conversion.md). Each slot fixes a proven hook template AND a format, so a
 * batch always spans 6+ format families and never collapses into ten
 * restyles of one idea (post-Andromeda, near-copies deliver like one ad).
 * Slots 1–7 are new concepts; 8–10 extend the lane's current best line.
 * AI photos: slot 10 only (plus slot 9 when the winner itself was a photo).
 */
export interface AdSlot {
  key: string;
  format: string;
  iteration?: boolean;
  how: string;
  women: string;
  men: string;
}

export const AD_SLOTS: AdSlot[] = [
  {
    key: "input_output",
    format: SAY_CATCH_FORMAT,
    how: "LITERAL INPUT → OUTPUT (the Letterly pattern, our strongest mechanism ad). `said` is a messy, specific thing they'd really say; `caught` is exactly what Ripple pulled out of it (tasks with the dates they said, a habit missed, a repeat). Headline names the everyday situation, not a mood.",
    women: `Headline: "The list in my head, finally on paper". Said: "renew the car registration, email the school about Friday, I'm always the one who remembers".`,
    men: `Headline: "Said it once. Now it's a list." Said: "finish the deck, call Dad back, lift tomorrow, less phone".`,
  },
  {
    key: "input_output_2",
    format: SAY_CATCH_FORMAT,
    how: "A SECOND input → output ad in a completely different life moment and area from the first (e.g. money, work, family logistics, health habits, a friendship). Different headline shape.",
    women: `Headline: "I said it in the car. Ripple kept it."`,
    men: `Headline: "Your notes app doesn't notice you skipped."`,
  },
  {
    key: "pattern_reveal",
    format: WEEKLY_REPORT_FORMAT,
    how: "PATTERN REVEAL — our own proven winner family (\"Same patterns. Different year.\", \"Two years of noticing\"). Lead with ONE specific, believable thing Ripple noticed across weeks. Fill `stats` (3 tiles, value ≤6 chars e.g. \"14\", \"3/5\", \"4 wks\"; label ≤18 chars) and `insight` (≤90 chars, what Ripple noticed, concrete).",
    women: `Headline: "Same worry, 4 weeks running". Stats: 14 things handled / 3 slipped / 4 wks same worry. Insight: "Money came up every Sunday. Gone by Wednesday."`,
    men: `Headline: "2 promises kept out of 5". Stats: 2/5 promises kept / 4 gym days missed / 6x said 'tomorrow'. Insight: "Said 'tomorrow' about the same call 6 times."`,
  },
  {
    key: "confession",
    format: TEXT_WALL_FORMAT,
    how: "INNER-VOICE CONFESSION as a phone note (the Opal pattern + the text-wall format). First person, specific small admissions with real nouns and days, then what Ripple did, then what changed. `lines`: 4–7 lines, each ≤70 chars, plain and conversational.",
    women: `Headline: "Things only I remember". Lines: "The dentist is Tuesday. Emma's form is due Friday." / "I said all of it out loud on the drive home." / "Ripple turned it into my list, with the dates." / "Three weeks in a row, the same thing came up: no time for me."`,
    men: `Headline: "What I said I'd do". Lines: "Gym Monday. Didn't go." / "Gym Wednesday. Didn't go." / "Said it out loud to Ripple both times." / "Week 3 it flagged it: missed 4 days running." / "Went Thursday."`,
  },
  {
    key: "invisible_list",
    format: "notes-app",
    how: "THE INVISIBLE LIST, MADE VISIBLE. Headline makes the unseen load countable (a number or a quoted phrase). `benefits` = 3 concrete things Ripple did with it.",
    women: `Headline: "All 23 things, finally written down"`,
    men: `Headline: "Every promise I made myself this month"`,
  },
  {
    key: "versus_usual",
    format: "statement-card",
    how: "CONTRAST WITH THE USUAL TOOL (planner, notes app, sticky notes, keeping it in your head): the one thing Ripple does that those can't — it notices. Blunt and specific.",
    women: `Headline: "My planner never noticed I kept moving the same thing."`,
    men: `Headline: "Discipline is remembering what you told yourself."`,
  },
  {
    key: "proof_in_app",
    format: APP_PROOF_FORMAT,
    how: "PROOF IN THE APP: a hook that the real screenshot proves (women: the Life Matrix, 6 life areas scored over time; men: the Theme Map of what keeps coming up). `description` ≤60 chars says what the screenshot shows.",
    women: `Headline: "See which part of your life keeps slipping"`,
    men: `Headline: "Scoreboard for the life you said you wanted"`,
  },
  {
    key: "iterate_new_format",
    format: TEXT_WALL_FORMAT,
    iteration: true,
    how: "ITERATION A of our CURRENT BEST AD (below): keep its winning line/idea almost word for word as the headline, and tell it as a first-person phone note (`lines`).",
    women: "",
    men: "",
  },
  {
    key: "iterate_new_scene",
    format: SAY_CATCH_FORMAT,
    iteration: true,
    how: "ITERATION B of our CURRENT BEST AD: same promise and headline idea, a brand-new opening scene — a different concrete moment in `said`/`caught`.",
    women: "",
    men: "",
  },
  {
    key: "offer_or_photo",
    format: "hook-overlay",
    how: "OFFER TEST on a real-looking photo: the headline leads with the free trial (\"Try it free for 7 days: ...\" + the concrete thing Ripple does; never the price). imageScene = a PLACE or OBJECTS only (a kitchen counter with a phone and car keys, a car dashboard at school pickup, a desk with a half-crossed list, a gym bench) — no people, no faces.",
    women: `Headline: "7 days free: say it, Ripple sorts it"`,
    men: `Headline: "7 days free. See every promise you kept."`,
  },
];

/**
 * The men's lane gets its own slots (2026-09-30, per Keenan: "men lane ads
 * are pretty generic still … not much to distinguish it from female lane").
 * Same research rules, but built around BWK: habits kept vs broken, the
 * weekly scoreboard, streaks, excuses and the pattern behind them — the
 * to-do list is secondary. Formats stay as varied (7 families, 1 photo).
 */
export const MEN_SLOTS: AdSlot[] = [
  {
    key: "scoreboard",
    format: WEEKLY_REPORT_FORMAT,
    how: "YOUR WEEK, SCORED. The weekly report as a scoreboard: stats = promises kept (e.g. \"2/5\"), gym days (\"3/5\"), how often he said 'tomorrow' (\"6x\"); insight = the one pattern behind the misses. Headline is the score.",
    women: "",
    men: `Headline: "Your week, scored: 2 of 5 kept". Stats: 2/5 promises kept / 3 gym days / 6x said 'tomorrow'. Insight: "Every missed workout came after a night past 1am."`,
  },
  {
    key: "excuse_audit",
    format: SAY_CATCH_FORMAT,
    how: "EXCUSE AUDIT. `said` = his real excuses said out loud in a debrief; `caught` = what Ripple logged: the excuse and how many times, the habit missed, the pattern behind it. Headline quotes the excuse with a count.",
    women: "",
    men: `Headline: "'Too tired.' 4th time this week." Said: "skipped the gym again, too tired, and I'll start the side project Monday".`,
  },
  {
    key: "streak",
    format: TEXT_WALL_FORMAT,
    how: "THE STREAK NOTE. First-person phone note: the day count, where it always breaks, what Ripple flagged, what changed. `lines`: 4–6 short lines ≤70 chars, blunt.",
    women: "",
    men: `Headline: "Day 1 is easy. Day 23 is where it breaks." Lines: "Day 1: lifted, read, no phone in bed." / "Day 9: skipped reading. Said it out loud anyway." / "Day 23: Ripple flagged it — every break is a Friday."`,
  },
  {
    key: "command",
    format: "statement-card",
    how: "COMMAND CARD (BWK voice). One blunt command or identity line + one literal line on what Ripple does for him. No hype.",
    women: "",
    men: `Headline: "Keep score on yourself." Solution line: "Say what you did and didn't. Ripple tracks it and shows the pattern."`,
  },
  {
    key: "motivation_vs_record",
    format: "notes-app",
    how: "MOTIVATION VS A RECORD. Motivation fades; a record doesn't. `benefits` = 3 concrete things Ripple tracks for him.",
    women: "",
    men: `Headline: "Motivation fades. A record doesn't."`,
  },
  {
    key: "nobody_watching",
    format: SAY_CATCH_FORMAT,
    how: "NOBODY'S WATCHING — except the record. `said` = him being honest about the week nobody saw; `caught` = the promises kept and broken, and the repeat. A different life area from excuse_audit (money, screen time, the side project, sleep, diet).",
    women: "",
    men: `Headline: "Nobody checks. So Ripple does." Said: "said I'd save 200 this month, spent it on takeout again, and 4 hours on my phone yesterday".`,
  },
  {
    key: "proof_in_app",
    format: APP_PROOF_FORMAT,
    how: "PROOF IN THE APP: a hook the real screenshot proves (the Theme Map of what keeps coming up in what he says). `description` ≤60 chars says what it shows.",
    women: "",
    men: `Headline: "'Tomorrow' came up 9 times this month"`,
  },
  {
    key: "iterate_new_format",
    format: TEXT_WALL_FORMAT,
    iteration: true,
    how: "ITERATION A of our CURRENT BEST AD (below): keep its winning line/idea almost word for word as the headline, told as a blunt first-person phone note (`lines`).",
    women: "",
    men: "",
  },
  {
    key: "iterate_new_scene",
    format: SAY_CATCH_FORMAT,
    iteration: true,
    how: "ITERATION B of our CURRENT BEST AD: same promise and headline idea, a brand-new moment in `said`/`caught` from HIS week (gym, alarm, phone, money, side project).",
    women: "",
    men: "",
  },
  {
    key: "offer_or_photo",
    format: "hook-overlay",
    how: "OFFER TEST on a real-looking photo: the headline leads with the free trial + the concrete thing Ripple does; never the price. imageScene = a PLACE or OBJECTS only (an empty gym bench at 6am, a phone face-down on a desk next to a half-crossed plan, running shoes by the door) — no people, no faces.",
    women: "",
    men: `Headline: "7 days free. Keep score on yourself."`,
  },
];

export const SLOTS_BY_LANE: Record<BatchGroupKey, AdSlot[]> = { women: AD_SLOTS, men: MEN_SLOTS };

export const BATCH_GROUPS: Record<BatchGroupKey, GroupConfig> = {
  women: {
    key: "women",
    projectSlug: "ripple-women",
    projectName: "Ripple — Women 40–50",
    digestBrand: "ripple",
    audienceLabel: "women roughly 40–50 carrying a heavy mental load",
    brandVoiceGuide: `Warm and on her side. ${VOICE_PRINCIPLE}
Write for a woman ~40–50 carrying the household's invisible mental load. She is smart and tired of being marketed at.
Short sentences. Specifics over abstractions. Use her own language from Reddit — if she wouldn't say it, cut it.
Ripple is a daily debrief she records any time of day (never "nightly", never a fixed time).
Value is multi-surface: tasks captured, mood seen, patterns surfaced, Life Matrix, weekly report.
Show what she'll see and get done with Ripple, and the better, lighter life it points to. ${AD_CLAIM_GUARDRAIL}`,
    targetAudience: {
      ageMin: 38,
      ageMax: 55,
      geo: ["US", "CA", "GB"],
      interests: ["self-care", "mindfulness", "motherhood", "wellness", "organization"],
      painPoints: [
        "carrying the entire household's mental load with no one tracking her",
        "wants to be left alone and feels guilty for it",
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
    // Setting, never subject (2026-09-29 research: recognisably-AI people
    // and glossy stock mood read as ads and underperform). Real places and
    // objects, shot like a phone photo.
    visualStyles: [
      "Candid iPhone photo, natural window light, slightly imperfect framing — looks posted by a real person, not a brand.",
      "Overhead phone shot straight down on a real kitchen counter or table, everyday clutter left in, soft daylight.",
      "Car interior at school pickup, shot from the driver's seat on a phone: dashboard, keys, a coffee in the cupholder, daylight.",
      "Bright, airy weekday-morning daylight, white walls and soft greens, clean and candid.",
      "Bold solid-color studio background (coral, mustard or teal), one real everyday object in sharp focus, punchy product-ad lighting.",
      "Warm late-afternoon light across a real lived-in living room, unstaged.",
    ],
    cardPalettes: [
      "warm cream paper background with a subtle terracotta accent",
      "soft blush pink background with deep burgundy type",
      "sage green background with off-white type",
      "bright coral background with white type",
      "pale sky blue background with navy type",
      "mustard yellow background with charcoal type",
    ],
    commonSpecifics:
      "the school form, the dentist, the grocery run, the work deadline, the missed workout, the thing you said you'd start \"tomorrow\", the list in your head at 11pm",
    laneRule: "",
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
Show the mechanism: spoken debrief → tracked habits → visible pattern → kept promises → a life he respects. ${AD_CLAIM_GUARDRAIL}`,
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
    visualStyles: [
      "Candid phone snapshot, UGC style: a messy desk, a car interior or a gym bag by the door, imperfect framing, real.",
      "Bright gym daylight: an empty bench, chalk, a water bottle, high contrast, no people.",
      "Overhead flat-lay of everyday gear on concrete (phone, keys, watch, headphones, wallet), sharp and organized.",
      "Focused workspace in natural window light: laptop, coffee, a plan on paper with half the items crossed out.",
      "Stark studio shot on a black background with an electric orange accent light, one real object, bold and graphic.",
      "Early-morning apartment kitchen, blue-hour light through the window, real and unstaged.",
    ],
    cardPalettes: [
      "near-black charcoal background with a single warm amber accent",
      "bone white background with heavy black type",
      "deep navy background with bright orange type",
      "olive green background with cream type",
      "concrete grey background with black type and one red accent",
      "electric blue background with white type",
    ],
    commonSpecifics:
      "the 5:30 alarm he snoozed, the gym day he skipped, 4 hours of screen time, the side project he hasn't touched, \"starting Monday\", the savings goal, the diet that broke Friday night, the book on the nightstand, the deadline he pushed again",
    laneRule:
      "THIS IS THE MEN'S LANE (BWK). It must NOT read like the women's ads: no family errands or household logistics as the scene (no birthdays, school forms, landlord emails, grocery runs). Lead with HABITS kept vs broken, the SCOREBOARD of his week, streaks, excuses and the pattern behind them; the to-do list is secondary. Voice: short, direct, blunt — second person or blunt first person; commands are fine (\"Keep score.\"); respect, never shame; no hype, no 'grindset'. The mechanism line says what Ripple does for HIM: he says what he did and didn't do, Ripple tracks the habits, flags the misses and shows the pattern. Vary it; never open every primary text with 'Say it out loud'.",
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
  /** Visual variety (2026-09-29, per Keenan: "the photos all look the exact
   *  same style"). One style per ad from the lane's pool; optional so older
   *  creatives rebuild with the lane default. */
  visualStyle?: string;
  cardPalette?: string;
  /** text-wall format: the first-person note, 4–8 short lines. */
  lines?: string[];
  /** weekly-report format: three stat tiles + one insight. */
  stats?: { value: string; label: string }[];
  insight?: string;
  /** Video ads (2026-09-29): the animation script, and the rendered MP4. */
  video?: VideoScript;
  videoUrl?: string;
  /** Higgsfield opener (2026-09-29): in-flight request, then the stored clip. */
  openerRequestId?: string;
  openerModel?: string;
  openerClipUrl?: string;
  openerFailed?: string;
  /** Jev's verdict on this draft (2026-09-30) — kept for the learning loop. */
  jev?: import("@/lib/adlab/jev-judge").JevVerdict;
}

// The extra copy fields aren't DB columns, so they ride in the stored
// generationPrompt as one tagged line. generateBatchImage strips it before
// anything reaches the image model; the regen path parses it back.
const AD_COPY_TAG = "[[AD_COPY:";
export function encodeAdCopy(c: AdImageCopy): string {
  const extra = { solutionLine: c.solutionLine, benefits: c.benefits, said: c.said, caught: c.caught, visualStyle: c.visualStyle, cardPalette: c.cardPalette, lines: c.lines, stats: c.stats, insight: c.insight, imageScene: c.imageScene || undefined, video: c.video, videoUrl: c.videoUrl, openerRequestId: c.openerRequestId, openerModel: c.openerModel, openerClipUrl: c.openerClipUrl, openerFailed: c.openerFailed, jev: c.jev };
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
Background photograph: ${c.visualStyle ?? g.photoStyle} Scene — a real place or real objects that make THIS situation recognisable, no people, no faces, no bodies: ${c.imageScene} It must look like a real phone photo, not an AI render or a stock image. Composed with generous negative space and a subtle dark gradient behind the text areas for legibility.
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
      return `Social media ad styled like a clean screenshot of a minimal phone notes app on a plain ${c.cardPalette ?? g.cardBackground}. Native, un-designed, screenshot-like feel — this intentionally does NOT look like a polished ad.
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
    build: (c, g) => `Typographic direct-response social ad, vertical 2:3 portrait, on a flat ${c.cardPalette ?? g.cardBackground}. No photograph — typography IS the creative.
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
Background photograph, heavily darkened/softened so text dominates: ${c.visualStyle ?? g.photoStyle} Scene — a real place or objects, no people: ${c.imageScene}
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
Background photograph: ${c.visualStyle ?? g.photoStyle} A smartphone rests naturally in the scene (on a table or held, hands only), its screen showing an extremely minimal dark app interface: a large round record button and a soft audio waveform — no readable UI text on the phone screen.
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
  {
    // 8. Text wall (2026-09-29, research) — a first-person story as a phone
    // note. Composed in code (ad-render.ts); marker only.
    key: TEXT_WALL_FORMAT,
    build: (c) => `TEXT_WALL (composed in code, no image model): headline "${c.headline}".`,
  },
  {
    // 9. Weekly report (2026-09-29, research) — the pattern-reveal winner
    // family as an infographic: three stats + what Ripple noticed.
    key: WEEKLY_REPORT_FORMAT,
    build: (c) => `WEEKLY_REPORT (composed in code, no image model): headline "${c.headline}".`,
  },
  // Video ads (2026-09-29) — animated in code (lib/adlab/ad-video.ts), one
  // key per template. Never offered to the image slots.
  ...VIDEO_TEMPLATES.map((t) => ({
    key: `${VIDEO_FORMAT_PREFIX}${t}`,
    offered: false,
    build: ((c: AdImageCopy) => `VIDEO_AD ${t} (animated in code, no image model): end headline "${c.headline}".`) as AdFormatBuilder,
  })),
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
      // Banned-phrase list removed 2026-09-30 (per Keenan: "get rid of the
      // banned phrases doc in the ads builder").
      bannedPhrases: [],
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
  archetype: z.string().max(40).optional(),
  strategy: z.enum(["exploit", "explore"]).optional(),
  // Research rebuild (2026-09-29): text-wall + weekly-report copy.
  lines: z.array(z.string().max(110)).optional().transform((l) => l?.filter((x) => x.trim()).slice(0, 8)),
  stats: z
    .array(z.object({ value: z.string().max(10), label: z.string().max(30) }))
    .optional()
    .transform((st) => st?.slice(0, 3)),
  insight: z.string().max(140).optional(),
  // Organic research seed label ("R2") this ad built on (2026-10-01).
  inspiration: z.string().max(8).optional(),
});

/** JSON schema for the submit_ads tool (structured output, 2026-09-29). */
const SUBMIT_ADS_TOOL = {
  name: "submit_ads",
  description: "Submit the requested ad creatives for this week's batch.",
  schema: {
    type: "object",
    properties: {
      ads: {
        type: "array",
        items: {
          type: "object",
          properties: {
            theme: { type: "string" },
            hypothesis: { type: "string" },
            targetPersona: { type: "string" },
            valueSurface: { type: "string", enum: [...VALUE_SURFACES] },
            archetype: { type: "string" },
            headline: { type: "string" },
            primaryText: { type: "string" },
            description: { type: "string" },
            cta: { type: "string" },
            imageScene: { type: "string" },
            solutionLine: { type: "string" },
            benefits: { type: "array", items: { type: "string" } },
            said: { type: "string" },
            caught: { type: "array", items: { type: "string" } },
            format: { type: "string", enum: [...AD_FORMAT_KEYS] },
            strategy: { type: "string", enum: ["exploit", "explore"] },
            lines: { type: "array", items: { type: "string" } },
            stats: {
              type: "array",
              items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } }, required: ["value", "label"] },
            },
            insight: { type: "string" },
            inspiration: { type: "string" },
          },
          required: ["theme", "hypothesis", "targetPersona", "valueSurface", "archetype", "headline", "primaryText", "description", "cta", "imageScene", "solutionLine", "benefits", "said", "caught", "format", "strategy"],
        },
      },
    },
    required: ["ads"],
  } as Record<string, unknown>,
};

/**
 * Per-ad tolerant parse (2026-09-24): the women's batch failed outright
 * because ONE ad put a format name ("app-proof") in valueSurface. Coerce
 * that known slip, keep every ad that validates, and only fail when fewer
 * than 6 survive.
 */
export function parseBatchAds(raw: string, minValid = 6): z.infer<typeof BatchAdSchema>[] {
  // Sonnet 5.5 can reason in text and write the JSON LAST (or draft one
  // first), so prefer the last complete JSON array in the reply
  // (content-factory lastJsonText), then fall back to the old extraction.
  const jsonText = (() => {
    const last = lastJsonText(raw);
    try {
      const p = JSON.parse(last);
      if (Array.isArray(p) || Array.isArray(p?.ads)) return last;
    } catch {}
    return extractJson(raw);
  })();
  const parsed = JSON.parse(jsonText);
  const arr = Array.isArray(parsed) ? parsed : parsed?.ads;
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
  if (ok.length < minValid) throw new Error(`only ${ok.length} valid ads — ${problems.join(" | ").slice(0, 600)}`);
  return ok;
}

// ─── Video ads (2026-09-29) ───────────────────────────────────────────────
//
// Keenan: "script out and create 5 separate animations that fit the 'show
// people their own words turned into a to do list and pattern and tracked
// habits' … each segment should get 3 videos per weekly generation".
// voice_to_list is the core mechanism, so it's in every week's three; the
// other two rotate weekly through the remaining four templates.

export const VIDEOS_PER_BATCH = 3;
/** Drafts per image slot / per video template that Jev chooses between. */
export const VARIANTS_PER_SLOT = 3;
export const VIDEO_VARIANTS = 2;

export function videoTemplatesForWeek(date = new Date()): VideoTemplate[] {
  const others = VIDEO_TEMPLATES.filter((t) => t !== "voice_to_list");
  const week = Math.floor(date.getTime() / (7 * 86_400_000));
  const a = others[week % others.length];
  const b = others[(week + 1) % others.length];
  return ["voice_to_list", a, b];
}

/** Headlines that share most of their words (within-batch near-copies). */
export function nearCopy(a: string, b: string): boolean {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.min(A.size, B.size) >= 0.6;
}

/** Three different opening-hook styles per week, rotating. */
export function hookStylesForWeek(date = new Date()): HookStyle[] {
  const week = Math.floor(date.getTime() / (7 * 86_400_000));
  return [0, 1, 2].map((k) => HOOK_STYLES[(week + k) % HOOK_STYLES.length]);
}

const HOOK_STYLE_BRIEFS: Record<HookStyle, string> = {
  caption: "CAPTION: the hook alone slams onto the footage. Write the line that makes her stop scrolling: a specific first-person confession or moment (\"I forgot the field trip form. Again.\", \"Snoozed the 5:30 alarm. 4th time.\").",
  pov: "POV: a 'POV' chip sits above the hook, so the hook completes it in second person: a specific, recognisable moment (\"it's 7:45 and you're the only one who knows where the form is\", \"your 4th 'tomorrow' this week\"). Don't write 'POV' in the hook itself.",
  number: "NUMBER: a giant number stamps in first, then the hook finishes the sentence. Fill bigNumber (≤4 chars, e.g. \"23\", \"4th\", \"0/5\") and write the hook as what follows it (\"things I remembered this week. Nobody else did.\").",
  notifications: "NOTIFICATIONS: 2–3 phone notifications drop in over the footage, then the hook lands. Fill notifications (2–3 {from ≤14 chars, a person or app like 'Emma', 'Mom', 'Dentist', 'Coach Dave'; text ≤42 chars, casual, lowercase ok}) with the exact things the animation later turns into her list. Hook ≤36 chars.",
};

const VIDEO_TEMPLATE_BRIEFS: Record<VideoTemplate, string> = {
  voice_to_list:
    "VOICE → LIST. Their spoken sentence types out word by word in a recording card, then 'Ripple caught' items pop in and get ticked. Fields: said (≤150 chars, messy and specific, real errands/names/days, the way people actually talk), caught (exactly 3–4 lines ≤38 chars: tasks with the dates they said, plus at most one habit or repeat — only things in `said`).",
  habit_week:
    "HABIT WEEK. A Mon–Sun row for one habit fills in day by day (✓ done / ✗ missed), with what they said on 2 of the missed days, then Ripple's flag. Fields: habit (≤18 chars, e.g. 'Morning walk', 'Gym', 'No phone in bed'), days (exactly 7 booleans, Mon first, with a visible run of misses), quotes (2 items {day: 0–6 index of a MISSED day, text ≤44 chars, their excuse in their words}), flag (≤48 chars, what Ripple noticed, must match `days`, e.g. 'Gym missed 3 days running, always after late meetings'), insight (≤44 chars, the small change it led to).",
  pattern_weeks:
    "PATTERN WEEKS. Four weeks of their own debrief lines stack up; the phrase that repeats lights up in every one; then 'Came up 4 weeks in a row'. Fields: weeks (exactly 4 sentences ≤70 chars, different situations, EACH containing `phrase` word for word), phrase (≤24 chars, e.g. 'no time for me', 'tomorrow'), insight (≤70 chars, what seeing it made clear).",
  weekly_report:
    "WEEKLY REPORT. Their week report assembles: 3 stats count up, the mood line draws across the week, the top theme, what Ripple noticed. Fields: stats (exactly 3 {value ≤5 chars, starting with a number, e.g. '14', '3', '2/5'; label ≤16 chars}), moods (exactly 7 integers 1–5, Mon–Sun, with a real shape), theme (≤24 chars, what came up most), insight (≤64 chars, one specific observation that matches the moods, e.g. 'Tuesdays are your hardest day, every week').",
  invisible_list:
    "INVISIBLE LIST. Everything they said this week piles in with a live counter, then Ripple sorts it into life areas. Fields: items (8–11 {text ≤28 chars, a concrete thing they said; area ≤10 chars from a SHORT set of 4–5 areas like Family, Work, Home, Money, Friends, You}), total (integer 15–30, the full count), insight (≤60 chars, what the sorting showed, as a share, never a per-area count — the bars are scaled from your items so exact counts won't match; e.g. 'Most of it was for someone else. Almost none was for me').",
};

const SUBMIT_VIDEOS_TOOL = {
  name: "submit_video_ads",
  description: "Submit this week's animated video ad scripts.",
  schema: {
    type: "object",
    properties: {
      videos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            template: { type: "string", enum: [...VIDEO_TEMPLATES] },
            theme: { type: "string" },
            hypothesis: { type: "string" },
            hook: { type: "string" },
            endHeadline: { type: "string" },
            openerScene: { type: "string" },
            hookStyle: { type: "string", enum: [...HOOK_STYLES] },
            bigNumber: { type: "string" },
            notifications: { type: "array", items: { type: "object", properties: { from: { type: "string" }, text: { type: "string" } }, required: ["from", "text"] } },
            primaryText: { type: "string" },
            description: { type: "string" },
            said: { type: "string" },
            caught: { type: "array", items: { type: "string" } },
            habit: { type: "string" },
            days: { type: "array", items: { type: "boolean" } },
            quotes: { type: "array", items: { type: "object", properties: { day: { type: "integer" }, text: { type: "string" } }, required: ["day", "text"] } },
            flag: { type: "string" },
            weeks: { type: "array", items: { type: "string" } },
            phrase: { type: "string" },
            stats: { type: "array", items: { type: "object", properties: { value: { type: "string" }, label: { type: "string" } }, required: ["value", "label"] } },
            moods: { type: "array", items: { type: "integer" } },
            theme_label: { type: "string", description: "weekly_report only: the top theme shown on screen" },
            items: { type: "array", items: { type: "object", properties: { text: { type: "string" }, area: { type: "string" } }, required: ["text", "area"] } },
            total: { type: "integer" },
            insight: { type: "string" },
          },
          required: ["template", "theme", "hypothesis", "hook", "endHeadline", "openerScene", "primaryText", "description"],
        },
      },
    },
    required: ["videos"],
  } as Record<string, unknown>,
};

interface VideoAdDraft {
  script: VideoScript;
  theme: string;
  hypothesis: string;
  primaryText: string;
  description: string;
}

/** Parse + validate the video tool output; drops scripts a template can't render. */
export function parseVideoAds(raw: string, templates: VideoTemplate[], perTemplate = 1): VideoAdDraft[] {
  const text = (() => {
    const last = lastJsonText(raw);
    try {
      JSON.parse(last);
      return last;
    } catch {
      return extractJson(raw);
    }
  })();
  const parsed = JSON.parse(text);
  const arr: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : parsed?.videos ?? [];
  const out: VideoAdDraft[] = [];
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : undefined);
  for (const v of arr) {
    const template = v.template as VideoTemplate;
    if (!templates.includes(template) || out.filter((o) => o.script.template === template).length >= perTemplate) continue;
    const script: VideoScript = {
      template,
      hook: clip(v.hook, 60) ?? "",
      endHeadline: clip(v.endHeadline, 48) ?? "",
      openerScene: clip(v.openerScene, 300),
      hookStyle: (HOOK_STYLES as readonly string[]).includes(v.hookStyle as string) ? (v.hookStyle as HookStyle) : "caption",
      bigNumber: clip(v.bigNumber, 5),
      notifications: Array.isArray(v.notifications)
        ? (v.notifications as { from?: unknown; text?: unknown }[])
            .map((n) => ({ from: clip(n.from, 18) ?? "", text: clip(n.text, 60) ?? "" }))
            .filter((n) => n.from && n.text)
            .slice(0, 3)
        : undefined,
      said: clip(v.said, 180),
      caught: Array.isArray(v.caught) ? (v.caught as unknown[]).map((x) => clip(x, 46) ?? "").filter(Boolean).slice(0, 4) : undefined,
      habit: clip(v.habit, 22),
      days: Array.isArray(v.days) ? (v.days as unknown[]).map(Boolean).slice(0, 7) : undefined,
      quotes: Array.isArray(v.quotes)
        ? (v.quotes as { day?: unknown; text?: unknown }[])
            .map((q) => ({ day: Number(q.day), text: clip(q.text, 56) ?? "" }))
            .filter((q) => q.text && q.day >= 0 && q.day <= 6)
            .slice(0, 3)
        : undefined,
      flag: clip(v.flag, 60),
      weeks: Array.isArray(v.weeks) ? (v.weeks as unknown[]).map((x) => clip(x, 90) ?? "").filter(Boolean).slice(0, 4) : undefined,
      phrase: clip(v.phrase, 30),
      stats: Array.isArray(v.stats)
        ? (v.stats as { value?: unknown; label?: unknown }[]).map((x) => ({ value: clip(x.value, 6) ?? "", label: clip(x.label, 20) ?? "" })).slice(0, 3)
        : undefined,
      moods: Array.isArray(v.moods) ? (v.moods as unknown[]).map((m) => Math.round(Number(m)) || 3).slice(0, 7) : undefined,
      theme: clip(v.theme_label, 30),
      items: Array.isArray(v.items)
        ? (v.items as { text?: unknown; area?: unknown }[])
            .map((x) => ({ text: clip(x.text, 34) ?? "", area: clip(x.area, 12) ?? "Other" }))
            .filter((x) => x.text)
            .slice(0, 12)
        : undefined,
      total: typeof v.total === "number" ? Math.round(v.total) : undefined,
      insight: clip(v.insight, 90),
    };
    if (script.hookStyle === "number" && !script.bigNumber) script.hookStyle = "caption";
    if (script.hookStyle === "notifications" && (script.notifications?.length ?? 0) < 2) script.hookStyle = "caption";
    const problem = validateVideoScript(script);
    if (problem) {
      console.warn(`[adlab-weekly] dropped ${template} video: ${problem}`);
      continue;
    }
    out.push({
      script,
      theme: clip(v.theme, 200) ?? "",
      hypothesis: clip(v.hypothesis, 400) ?? "",
      primaryText: clip(v.primaryText, 200) ?? "",
      description: clip(v.description, 100) ?? "",
    });
  }
  return out;
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
): Promise<{ experimentId: string; creativeIds: string[]; videoCreativeIds: string[]; digestDate: string }> {
  const g = BATCH_GROUPS[groupKey];
  // Each lane has its own slots (2026-09-30): the men's are BWK-shaped.
  const SLOTS = SLOTS_BY_LANE[groupKey];
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
  const { section: learningSection } = renderLearningForBatch(learning, { slotted: true });
  const { getLatestCompetitorBrief, renderCompetitorBriefForBatch } = await import(
    "@/lib/adlab/competitor-research"
  );
  const competitorBrief = await getLatestCompetitorBrief(groupKey).catch(() => null);
  const competitorSection = renderCompetitorBriefForBatch(competitorBrief);
  // Organic research seeds (2026-10-01, per Keenan: competitor briefs feed
  // ads too). Posts for this audience that far outran their usual reach,
  // briefed from their real slides/frames. Soft: none → section omitted.
  const { getResearchSeeds, renderResearchSeeds, markResearchSeedUsed } = await import(
    "@/lib/content-factory/competitor-mimic"
  );
  const organicSeeds = await getResearchSeeds(g.digestBrand === "bwk" ? "bwk" : "ripple", 5).catch(() => []);
  const organicSection = organicSeeds.length
    ? `WHAT'S WORKING IN ORGANIC SOCIAL FOR THIS AUDIENCE THIS WEEK (posts that far outran their usual reach; mechanics only, never wording, never name or allude to a creator or platform). A new-concept slot MAY build its hook on one of these when it fits the slot's fixed template; if it does, set "inspiration" to that label (e.g. "R2"), otherwise leave "inspiration" out:\n${renderResearchSeeds(organicSeeds)}`
    : "";
  const digestDate = digest.date.toISOString().slice(0, 10);
  const weekLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });


  // Anti-repetition (2026-09-29): the last 45 days of our own ads for this
  // lane. The generator had been recycling its own headlines week to week.
  const recentCreatives = await prisma.adLabCreative.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 45 * 86_400_000) }, angle: { experiment: { projectId } } },
    select: { headline: true, primaryText: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });
  const recentBlock = recentCreatives.length
    ? `\nOUR RECENT ADS FOR THIS AUDIENCE (never reuse or closely paraphrase any of these headlines or openings in the new-concept slots; find NEW words and NEW angles. The iterate_* slots are the one exception):\n${recentCreatives.map((c) => `- ${c.headline} — ${c.primaryText.replace(/\s+/g, " ").slice(0, 90)}`).join("\n")}\n`
    : "";

  // The lane's current best ad (slots 8–9 iterate it). Our own trial data
  // first; the proven women's line as a fallback before there is any.
  const bestPerf = learning?.stats.top[0];
  const bestAd = bestPerf
    ? { headline: bestPerf.headline, primaryText: bestPerf.primaryText, format: bestPerf.formatKey }
    : groupKey === "women"
      ? { headline: "Same patterns. Different year.", primaryText: "Ripple shows you what keeps coming up in your own words, week after week.", format: "statement-card" }
      : null;
  const bestAdBlock = bestAd
    ? `CURRENT BEST AD FOR THIS LANE (slots iterate_new_format and iterate_new_scene extend it — reusing its line there is REQUIRED, not repetition):\n- Headline: "${bestAd.headline}"\n- Primary text: "${bestAd.primaryText.replace(/\s+/g, " ").slice(0, 200)}"\n- Format it ran in: ${bestAd.format}\n`
    : `CURRENT BEST AD FOR THIS LANE: none proven yet. Treat the iterate_* slots as extra new concepts: iterate_new_format = a pattern-reveal told as a phone note; iterate_new_scene = another input → output demo in a new life area.\n`;

  const systemPrompt = `You are an expert direct-response Meta ads copywriter for a subscription app. Write complete static ad creatives grounded in real audience research AND in what the research says converts for subscription apps.

WHAT CONVERTS (our research, reports/Subscription app ad creative conversion.md — follow it):
- Plain, phone-native, literal ads beat polished mood work. Text-only / native-looking statics win about 1.7x as often as high-production ads. The category's longest-running ads are ONE plain benefit or proof line, kept for months.
- Our own winners were concrete and showed a real insight ("Two years of noticing", "Same patterns. Different year."). Generic moody lines lose. Show the insight, not the mood.
- Every ad needs: (1) a SPECIFIC scene or hook with a concrete noun, number or quoted phrase; (2) ONE literal line on what Ripple does; (3) a result. A stranger must know what Ripple is and does within the headline + first line.
${g.laneRule ? `- ${g.laneRule}\n` : ""}- Nobody else in the category shows people their own words turned into a list and a pattern. That demo and pattern-reveal territory is ours: lean on it.
- SPECIFIC **AND COMMON** (2026-09-30 — the last batch went niche: "the dryer noise since March", "the $212 vet charge", "I asked 3 groups"). A detail only works if MOST of this audience lived it this week and recognises it in one second: ${g.commonSpecifics}. Never an unusual one-off situation, an odd dollar amount, a specific appliance, a medical or prescription detail, or a major life decision (divorce, leaving a job, a diagnosis). Specific enough to feel real, common enough that anyone nods. The headline alone must make sense to a stranger scrolling past.

PRODUCT (ground truth — never claim beyond this):
${PRODUCT_TRUTH}

AUDIENCE: ${g.audienceLabel}

BRAND VOICE:
${g.brandVoiceGuide}

USPs (pick the one that best answers each ad — don't cram them all in):
${JSON.stringify(g.usps, null, 2)}

${recentBlock}
${bestAdBlock}
THE 10 SLOTS — every slot has a FIXED hook template and a FIXED format. Write the ad for the slot you are given; set "archetype" to the slot key.
${SLOTS.map((sl) => `- ${sl.key} [format: ${sl.format}]: ${sl.how}${sl[groupKey] ? `\n    Example for this lane (write your OWN, don't copy): ${sl[groupKey]}` : ""}`).join("\n")}
${learningSection ? `\n${learningSection}\n` : ""}${competitorSection ? `\n${competitorSection}\n` : ""}${organicSection ? `\n${organicSection}\n` : ""}
THIS WEEK'S REDDIT AUDIENCE PULSE (real distilled pain from the audience's own threads — root every new-concept ad in one of these themes, in their own words). Use a theme only through its EVERYDAY, widely shared side; skip medical/medication, relationship-ending or other major-life-decision themes entirely, and never lift a one-off story detail from a thread:
${themes.map((t, i) => `${i + 1}. THEME: ${t.theme}\n   WHY IT'S LIVE THIS WEEK: ${t.why}\n   SUGGESTED ANGLE: ${t.angle}\n   THEIR OWN PHRASES: ${(t.phrases ?? []).join(" | ")}`).join("\n\n")}

VALUE SURFACE DEFINITIONS (label each ad with the closest): problem, outcome, social_proof, mechanism, story, comparison, identity, urgency.

FIELD RULES:
- headline: HARD max 40 characters, count them. It is the biggest text on the image AND the Meta headline. It must contain a concrete noun, number or quoted phrase that MOST of the audience recognises from their own week (see SPECIFIC AND COMMON). Names a SITUATION, never the reader's state or condition.
- primaryText: HARD max 125 characters, fixed order: the hook/scene first, then ONE literal mechanism line ("You talk. Ripple turns it into your to-do list and shows what keeps coming up."). No price.
- description: max 100 characters (app-proof: ≤60, says what the screenshot shows).
- solutionLine: max 90 characters, what Ripple concretely does about THIS ad's situation. Must name a real feature from PRODUCT.
- benefits: exactly 3 lines, each max 40 characters, concrete things Ripple does for this situation.
- said: max 140 characters, a realistic, specific thing this person would say out loud (names, days, errands, excuses).
- caught: exactly 3 lines, each max 44 characters — tasks with dates, habits missed, promises, or a repeat, all actually contained in "said".
- lines: text-wall slots ONLY — 4–7 first-person lines, each ≤70 characters. Omit elsewhere.
- stats + insight: weekly-report slots ONLY — exactly 3 stats {value ≤6 chars, label ≤18 chars} and insight ≤90 chars. Believable, small, specific numbers — an example of one person's week, never a claim about users. Omit elsewhere.
- imageScene: 1 sentence. Only used by photo formats: a PLACE or OBJECTS (a kitchen counter with a phone and car keys, a car dashboard, a desk with a half-crossed list, a gym bag by the door). No people, no faces, no hands in focus, no moody stock lighting. For non-photo formats write "n/a".
- cta: always "SIGN_UP".
- format: copy the slot's format exactly.
- strategy: "exploit" for the iterate_* slots, "explore" for the rest.

HARD RULES (Meta policy + brand — violations get ads rejected):
- NEVER imply the reader has a condition or feeling state — including as a QUESTION. Banned: "Overwhelmed?", "Burned out?", "Stressed?", "anxious", "your anxiety", "depressed", "exhausted mom?". Name the situation instead ("23 things in your head", "the dentist is Tuesday").
- NEVER reference the reader's age or life stage in copy ("over 40", "in your 40s", "midlife", "menopause", "hormones", "at your age"). Age lives in targeting only.
- No health or mental-health outcome claims, no before/after transformation, no invented user counts, ratings, reviews, testimonials or press.
- No recording-duration claims, never "brain dump", never a fixed time of day for recording ("nightly", "before bed").
- CLAIMS: ${AD_CLAIM_GUARDRAIL}

Submit the ads with the submit_ads tool.`;

  // Drafts for Jev (2026-09-30, per Keenan: "create multiple different ad
  // scripts that run into jev first"): VARIANTS_PER_SLOT drafts per slot,
  // written in four parallel requests of 2–3 slots each (one big reply hit
  // the output cap), then Jev picks the best draft per slot.
  const VARIANTS = VARIANTS_PER_SLOT;
  const halves = [SLOTS.slice(0, 3), SLOTS.slice(3, 6), SLOTS.slice(6, 8), SLOTS.slice(8)];
  const per = Math.ceil(themes.length / halves.length);
  const themeSlices = halves.map((_, i) => themes.slice(i * per, (i + 1) * per));
  const halfPrompt = (i: number) =>
    `This request covers ${halves[i].length} of this week's 10 slots (the batch is split into ${halves.length} requests). For EACH slot write ${VARIANTS} genuinely different drafts (a different hook, a different life moment, a different opening line each time), so ${halves[i].length * VARIANTS} ads in total. Set "archetype" to the slot key on every draft. The drafts are scored and only the strongest one per slot becomes an ad, so make each one a real contender, not a small rewording. Slots, in order: ${halves[i].map((sl) => `${sl.key} (format ${sl.format})`).join(", ")}. Root the new-concept drafts in these Reddit themes: ${themeSlices[i].map((t) => t.theme).join(" | ") || "any of the themes above"}.
Call the submit_ads tool IMMEDIATELY. Do not write any analysis, plan, draft or commentary before or after the tool call; think silently and put everything into the tool input.`;

  const generateHalf = async (i: number): Promise<z.infer<typeof BatchAdSchema>[]> => {
    try {
      const raw = await callAdLabClaude({
        purpose: `weekly-batch-${groupKey}-${i + 1}`,
        systemPrompt,
        userPrompt: halfPrompt(i),
        maxTokens: 16000,
        models: AD_COPY_MODELS,
        outputTool: SUBMIT_ADS_TOOL,
      });
      return parseBatchAds(raw, halves[i].length).map((ad, k) => tagSlot(ad, i, k));
    } catch (err1) {
      const raw2 = await callAdLabClaude({
        purpose: `weekly-batch-${groupKey}-${i + 1}-retry`,
        models: AD_COPY_MODELS,
        outputTool: SUBMIT_ADS_TOOL,
        systemPrompt,
        userPrompt: `${halfPrompt(i)}\n\nIMPORTANT: the previous attempt failed (${err1 instanceof Error ? err1.message.slice(0, 300) : String(err1)}). Call submit_ads right away with no text at all. Keep every field short. valueSurface must be one of: ${VALUE_SURFACES.join(", ")}.`,
        maxTokens: 16000,
      });
      return parseBatchAds(raw2, halves[i].length).map((ad, k) => tagSlot(ad, i, k));
    }
  };
  // A draft whose archetype isn't one of its request's slots is assigned by
  // position (drafts come in slot order, VARIANTS per slot).
  const tagSlot = (ad: z.infer<typeof BatchAdSchema>, i: number, k: number) => {
    if (!halves[i].some((sl) => sl.key === ad.archetype)) {
      ad.archetype = halves[i][Math.min(halves[i].length - 1, Math.floor(k / VARIANTS))].key;
    }
    return ad;
  };
  // Video scripts run in parallel with the two image halves; a failure
  // here only costs the week its videos, never the image batch.
  const recentVideoHeadlines = (
    await prisma.adLabCreative.findMany({
      where: { creativeType: "video", angle: { experiment: { projectId } } },
      select: { headline: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
  ).map((c) => c.headline);
  const videoTemplates = videoTemplatesForWeek();
  const hookStyles = hookStylesForWeek();
  const videoPrompt = `Write ${videoTemplates.length * VIDEO_VARIANTS} ANIMATED VIDEO ad scripts for this lane: ${VIDEO_VARIANTS} genuinely different scripts per template (different moment, hook and footage each), templates in this order: ${videoTemplates.join(", ")}. The scripts are scored and only the strongest per template is made.
Each video is a ~12–15s silent-readable animation (music underneath, no voiceover) that shows the viewer THEIR OWN WORDS turning into a to-do list, a tracked habit, a pattern or a weekly report. Nothing else is on screen, so the specifics carry the ad: everyday specifics MOST of this audience lives every week (${g.commonSpecifics})${g.laneRule ? ". " + g.laneRule : ""} — never an unusual one-off, a medical detail or a major life decision. Every number is one person's believable week, never a claim about users.

STRUCTURE — one continuous story, not a clip stapled to a slideshow:
1. 0–3s: real-looking footage of ONE specific moment (openerScene) with the opening hook on screen from the very first frame.
2. The footage stays behind, blurred, while the animation shows what they SAID about that exact moment turning into a list / habit / pattern / report.
3. End card.
COHESION (non-negotiable): the footage, the hook and the animation are the same moment and the same person. Every concrete thing in the footage shows up in the words (a permission slip on the counter → "Sign Emma's field trip form"; a snoozed 5:30 alarm → the gym day Ripple flags; a fridge full of sticky notes → the items being counted). The hook is their thought in that exact moment.
ATTENTION (the whole goal of the first second): specific beats clever. Name a real moment, a number, a confession, or a thing they'll recognise from their own week. No slow build, no generic mood, no questions about feelings.

TEMPLATES + OPENING HOOK STYLE (in this order):
${videoTemplates.map((t, i) => `- ${t} with hookStyle "${hookStyles[i]}": ${VIDEO_TEMPLATE_BRIEFS[t]}\n    Hook style: ${HOOK_STYLE_BRIEFS[hookStyles[i]]}`).join("\n")}

COMMON FIELDS (every video):
- hook: ≤44 chars, on screen from frame 0 over the footage; follow the video's hook style. Never a feeling-state question, never age.
- hookStyle: copy the style given for the template.
- openerScene: ≤200 chars. The ad OPENS on ~3s of real-looking footage behind the hook (generated by a video model), then cuts to the animation. Describe that moment so it matches the hook: a specific everyday PLACE with real objects, hands, or a person seen from behind — never a face (e.g. "car in the school pickup line, permission slip and keys on the passenger seat, her hands let go of the wheel"; "gym bag by the apartment door at dawn, his hand reaches for it and stops"). One simple motion. No text, no screens with readable text, no logos.
- endHeadline: ≤34 chars, end card + Meta headline, outcome-led and literal, written fresh for THIS video. Never reuse an end headline we've already run: ${recentVideoHeadlines.join(" | ") || "(none yet)"}.
- primaryText: ≤125 chars: hook/scene, then one literal line on what Ripple does. No price.
- description: ≤60 chars.
- theme: which Reddit theme it's rooted in. hypothesis: one sentence on why it should convert.
Only fill the template's own fields (plus the common ones); leave the rest out.
Call the submit_video_ads tool IMMEDIATELY with no text before or after it.`;
  const generateVideos = async (): Promise<VideoAdDraft[]> => {
    const call = (extra = "") =>
      callAdLabClaude({
        purpose: `weekly-videos-${groupKey}`,
        systemPrompt,
        userPrompt: videoPrompt + extra,
        maxTokens: 16000,
        models: AD_COPY_MODELS,
        outputTool: SUBMIT_VIDEOS_TOOL,
      });
    let drafts = parseVideoAds(await call(), videoTemplates, VIDEO_VARIANTS);
    if (drafts.length < videoTemplates.length) {
      const missing = videoTemplates.filter((t) => !drafts.some((d) => d.script.template === t));
      const more = parseVideoAds(
        await call(`\n\nIMPORTANT: the previous attempt was missing valid scripts for: ${missing.join(", ")}. Follow each template's field rules exactly (counts and lengths).`),
        missing
      ).filter((d) => !drafts.some((x) => x.script.template === d.script.template));
      drafts = [...drafts, ...more];
    }
    return drafts;
  };
  const [videoOut, ...halvesOut] = await Promise.allSettled([generateVideos(), ...halves.map((_, i) => generateHalf(i))]);
  const videoCandidates = videoOut.status === "fulfilled" ? videoOut.value : [];
  if (videoOut.status === "rejected") console.warn(`[adlab-weekly] ${groupKey} videos failed: ${videoOut.reason instanceof Error ? videoOut.reason.message : videoOut.reason}`);
  const drafts: z.infer<typeof BatchAdSchema>[] = halvesOut.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  // ── Jev picks the winners (2026-09-30) ──
  const { judgeDrafts, pickBest, jevCalibration } = await import("@/lib/adlab/jev-judge");
  const liveHeadlines = (
    await prisma.adLabAd.findMany({
      where: { status: { in: ["live", "scaled"] }, creative: { angle: { experiment: { projectId } } } },
      select: { creative: { select: { headline: true } } },
    })
  ).map((a) => a.creative.headline);
  const exampleOf = (c: { headline: string; primaryText: string; trials: number; signups: number; spendCents: number }) => ({
    headline: c.headline,
    primaryText: c.primaryText.slice(0, 160),
    result: `${c.trials} paid trials, ${c.signups} signups on $${(c.spendCents / 100).toFixed(0)}`,
  });
  const jevCtx = {
    lane: groupKey,
    audience: g.audienceLabel,
    winners: (learning?.stats.top ?? []).slice(0, 6).map(exampleOf),
    losers: (learning?.stats.bottom ?? []).slice(0, 6).map(exampleOf),
    liveHeadlines,
  };
  const onScreenOf = (d: z.infer<typeof BatchAdSchema>) =>
    [d.solutionLine, d.said, ...(d.caught ?? []), ...(d.lines ?? []), ...(d.stats ?? []).map((x) => `${x.value} ${x.label}`), d.insight].filter((x): x is string => !!x);
  const verdicts = await judgeDrafts(jevCtx, drafts.map((d) => ({ format: d.format ?? "", headline: d.headline, primaryText: d.primaryText, onScreen: onScreenOf(d) })));
  const jevOf = new Map<z.infer<typeof BatchAdSchema>, import("@/lib/adlab/jev-judge").JevVerdict | null>();
  // "R2" → that seed's CompetitorPost id, for researchNotes + rotation.
  const organicSeedOf = (d: z.infer<typeof BatchAdSchema>): string | undefined => {
    const m = d.inspiration?.trim().match(/^R([1-9])$/);
    return m ? organicSeeds[Number(m[1]) - 1]?.id : undefined;
  };
  const ads: z.infer<typeof BatchAdSchema>[] = [];
  // Per slot: best viable draft. "Extend the best ad" slots are MEANT to
  // echo the live winner, so Jev's duplicate flag doesn't count against
  // them; every slot skips drafts that near-copy an ad already picked here.
  const picked: string[] = [];
  for (const slot of SLOTS) {
    const idx = drafts
      .map((d, i) => (d.archetype === slot.key ? i : -1))
      .filter((i) => i >= 0 && !picked.some((h) => nearCopy(h, drafts[i].headline)));
    if (idx.length === 0) continue;
    const pick = pickBest(idx.map((i) => drafts[i]), idx.map((i) => verdicts[i]), { ignoreDuplicate: !!slot.iteration });
    jevOf.set(pick.item, pick.verdict);
    ads.push(pick.item);
    picked.push(pick.item.headline);
  }
  const judgedCount = verdicts.filter(Boolean).length;
  const vVerdicts = await judgeDrafts(
    jevCtx,
    videoCandidates.map((v) => ({ format: `video-${v.script.template}`, headline: v.script.hook, primaryText: v.primaryText, onScreen: [v.script.endHeadline, v.script.said, ...(v.script.caught ?? []), v.script.flag, v.script.insight].filter((x): x is string => !!x) }))
  );
  const videoDrafts: VideoAdDraft[] = [];
  const videoJev = new Map<VideoAdDraft, import("@/lib/adlab/jev-judge").JevVerdict | null>();
  for (const t of videoTemplates) {
    const idx = videoCandidates.map((v, i) => (v.script.template === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const pick = pickBest(idx.map((i) => videoCandidates[i]), idx.map((i) => vVerdicts[i]));
    videoJev.set(pick.item, pick.verdict);
    videoDrafts.push(pick.item);
  }
  const calibration = await jevCalibration(projectId).catch(() => null);
  console.log(`[adlab-weekly] ${groupKey}: Jev judged ${judgedCount}/${drafts.length} drafts + ${vVerdicts.filter(Boolean).length}/${videoCandidates.length} video scripts${calibration ? ` — ${calibration}` : ""}`);
  if (ads.length < 5) {
    const reasons = halvesOut.map((r) => (r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : "ok")).join(" | ");
    throw new Error(`only ${ads.length} valid ads — ${reasons.slice(0, 500)}`);
  }

  // Created only once the copy is good (2026-09-24): an experiment made
  // first and left empty by a failed parse became the "latest" batch and
  // blanked the group on the review page.
  const experiment = await prisma.adLabExperiment.create({
    data: {
      projectId,
      topicBrief: `Weekly batch (${weekLabel}) — ${ads.length} ads for ${g.audienceLabel}, ${judgedCount ? `each the Jev-picked best of ~${VARIANTS} drafts` : "Jev unavailable, first draft per slot"}: 7 new concepts across 6+ formats and 3 extending the current best ad, rooted in the ${digestDate} audience pulse.${calibration ? ` ${calibration}` : ""}`,
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
  const videoCreativeIds: string[] = [];
  const styleOffset = Math.floor(Math.random() * 1000);
  // Each ad → its slot (by the archetype key the model echoed, else by
  // position). The slot decides the format, not the model; if the copy a
  // code-drawn format needs is missing, fall back to a statement card.
  const usedSlots = new Set<string>();
  let photoCount = 0;
  for (const [adIndex, ad] of ads.slice(0, 10).entries()) {
    const slot =
      SLOTS.find((sl) => sl.key === ad.archetype && !usedSlots.has(sl.key)) ??
      SLOTS.find((sl, i) => i >= adIndex && !usedSlots.has(sl.key)) ??
      SLOTS.find((sl) => !usedSlots.has(sl.key));
    if (slot) usedSlots.add(slot.key);
    let formatKey = slot?.format ?? ad.format ?? "statement-card";
    // Iteration B keeps the winner's own format when it was a photo ad.
    if (slot?.key === "iterate_new_scene" && bestAd && PHOTO_FORMATS.includes(bestAd.format)) formatKey = bestAd.format;
    if (formatKey === TEXT_WALL_FORMAT && !(ad.lines && ad.lines.length >= 3)) formatKey = "statement-card";
    if (formatKey === WEEKLY_REPORT_FORMAT && !(ad.stats && ad.stats.length === 3 && ad.insight)) formatKey = "statement-card";
    if (PHOTO_FORMATS.includes(formatKey) && ++photoCount > 2) formatKey = "statement-card";
    ad.archetype = slot?.key ?? ad.archetype;
    ad.strategy = slot?.iteration ? "exploit" : "explore";
    // One visual style + palette per ad, rotated from a random start so
    // neither the ads in a batch nor consecutive weeks share a look.
    const visualStyle = g.visualStyles[(styleOffset + adIndex) % g.visualStyles.length];
    const cardPalette = g.cardPalettes[(styleOffset + adIndex) % g.cardPalettes.length];
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
        researchNotes: `Reddit theme (${digestDate}): ${ad.theme} | strategy: ${strategy}${ad.archetype ? ` | type: ${ad.archetype}` : ""} | format: ${formatKey}${jevOf.get(ad) ? ` | jev: ${jevOf.get(ad)!.rank.toFixed(2)} best of ${jevOf.get(ad)!.of}` : ""}${organicSeedOf(ad) ? ` | organic: ${organicSeedOf(ad)}` : ""}`,
        score: 5,
      },
    });
    const seedId = organicSeedOf(ad);
    if (seedId) await markResearchSeedUsed(seedId);
    const creative = await prisma.adLabCreative.create({
      data: {
        angleId: angle.id,
        creativeType: "image",
        headline: ad.headline,
        primaryText: ad.primaryText,
        description: ad.description,
        cta: ad.cta,
        formatKey,
        generationPrompt: buildAdImagePrompt(formatKey, { ...ad, visualStyle, cardPalette, jev: jevOf.get(ad) ?? undefined }, groupKey),
        complianceStatus: "pending",
        approved: false,
      },
    });
    creativeIds.push(creative.id);
  }

  // Video ads — rendered (MP4 + poster) by generateBatchImage like any
  // other creative, so the Inngest image steps cover them too.
  for (const v of videoDrafts.slice(0, VIDEOS_PER_BATCH)) {
    const formatKey = `${VIDEO_FORMAT_PREFIX}${v.script.template}`;
    const angle = await prisma.adLabAngle.create({
      data: {
        experimentId: experiment.id,
        hypothesis: v.hypothesis || `Animated ${v.script.template} demo`,
        targetPersona: g.audienceLabel,
        valueSurface: "mechanism",
        researchNotes: `Reddit theme (${digestDate}): ${v.theme} | strategy: explore | type: video_${v.script.template} | format: ${formatKey}`,
        score: 5,
      },
    });
    const copy: AdImageCopy = { headline: v.script.endHeadline, description: v.description, cta: "SIGN_UP", imageScene: "", video: v.script, jev: videoJev.get(v) ?? undefined };
    const creative = await prisma.adLabCreative.create({
      data: {
        angleId: angle.id,
        creativeType: "video",
        headline: v.script.endHeadline,
        primaryText: v.primaryText,
        description: v.description,
        cta: "SIGN_UP",
        formatKey,
        generationPrompt: buildAdImagePrompt(formatKey, copy, groupKey),
        complianceStatus: "pending",
        approved: false,
      },
    });
    creativeIds.push(creative.id);
    videoCreativeIds.push(creative.id);
  }

  console.log(`[adlab-weekly] ${groupKey}: experiment ${experiment.id}, ${creativeIds.length} creatives (${Math.min(videoDrafts.length, VIDEOS_PER_BATCH)} video)`);
  return { experimentId: experiment.id, creativeIds, videoCreativeIds, digestDate };
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

  if (creative.formatKey?.startsWith(VIDEO_FORMAT_PREFIX)) {
    return generateBatchVideo(creative);
  }

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
    } else if (creative.formatKey === TEXT_WALL_FORMAT || creative.formatKey === WEEKLY_REPORT_FORMAT) {
      const tags = creative.angle.experiment.campaignTags;
      const groupKey: BatchGroupKey = tags.includes("men") ? "men" : "women";
      const extra = decodeAdCopy(creative.generationPrompt);
      if (creative.formatKey === TEXT_WALL_FORMAT) {
        if (!extra.lines?.length) throw new Error("text-wall creative has no lines");
        placements = await renderTextWallPlacements(groupKey, { headline: creative.headline, lines: extra.lines, ctaLabel: ctaLabel(creative.cta) });
      } else {
        if (!extra.stats?.length || !extra.insight) throw new Error("weekly-report creative has no stats/insight");
        placements = await renderWeeklyReportPlacements(groupKey, { headline: creative.headline, stats: extra.stats, insight: extra.insight, ctaLabel: ctaLabel(creative.cta) });
      }
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

// ─── Higgsfield opener (2026-09-29, per Keenan: "we should have an initial
// hook via higgsfield for the first few seconds followed by the animation") ─
//
// submit: gpt-image-2 still of the script's openerScene → Higgsfield
// image-to-video (the same cheap model + account as the content-factory
// reels, POST_VIDEO_MODEL). check: poll once; on completion the clip is
// copied into our bucket (Higgsfield URLs aren't permanent) and its URL
// saved in the AD_COPY tag. Any failure just leaves the ad on the
// animation-only intro.

async function saveAdCopy(creativeId: string, prompt: string | null, copy: Partial<AdImageCopy>) {
  await prisma.adLabCreative.update({
    where: { id: creativeId },
    data: { generationPrompt: `${stripAdCopy(prompt ?? "")}${encodeAdCopy(copy as AdImageCopy)}` },
  });
}

export async function submitVideoOpener(creativeId: string): Promise<{ submitted: boolean; reason?: string }> {
  const creative = await prisma.adLabCreative.findUnique({ where: { id: creativeId }, select: { generationPrompt: true } });
  const copy = decodeAdCopy(creative?.generationPrompt);
  const scene = copy.video?.openerScene?.trim();
  if (!creative || !scene) return { submitted: false, reason: "no opener scene" };
  if (copy.openerClipUrl || copy.openerRequestId) return { submitted: true };
  if (!process.env.HIGGSFIELD_API_KEY || !process.env.HIGGSFIELD_API_SECRET) return { submitted: false, reason: "Higgsfield not configured" };
  if (!process.env.ACUITY_ADLAB_OPENAI_KEY) return { submitted: false, reason: "image model not configured" };
  try {
    const still = await openai().images.generate({
      model: "gpt-image-2",
      quality: "high",
      size: SOURCE_SIZE,
      n: 1,
      prompt: `A candid vertical photo that looks like it was taken on an iPhone by a real person — unpolished, natural light, everyday clutter left in, not a stock photo and not an AI render. Scene: ${scene} No faces visible (people only from behind, or just hands). No text, no logos, no readable screens anywhere.`,
    });
    const b64 = still.data?.[0]?.b64_json;
    if (!b64) throw new Error("gpt-image-2 returned no image");
    const { supabase } = await import("@/lib/supabase.server");
    const name = `${creativeId}-opener-start-${Date.now()}.jpg`;
    const jpg = await sharp(Buffer.from(b64, "base64")).jpeg({ quality: 92 }).toBuffer();
    const { error } = await supabase.storage.from("adlab-creatives").upload(name, jpg, { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const startImageUrl = supabase.storage.from("adlab-creatives").getPublicUrl(name).data.publicUrl;
    const { submitCoverVideo } = await import("@/lib/content-factory/animate-cover");
    const { POST_VIDEO_MODEL } = await import("@/lib/content-factory/post-video");
    const requestId = await submitCoverVideo({
      startImageUrl,
      model: POST_VIDEO_MODEL,
      duration: 5,
      prompt: `Handheld phone footage, realistic and unpolished, with motion from the very first frame and a quick handheld push-in. ${scene} One clear, natural action that starts immediately. Faces never visible. No text appears.`,
    });
    await saveAdCopy(creativeId, creative.generationPrompt, { ...copy, openerRequestId: requestId, openerModel: POST_VIDEO_MODEL });
    return { submitted: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[adlab-weekly] opener submit failed for ${creativeId}: ${msg}`);
    await saveAdCopy(creativeId, creative.generationPrompt, { ...copy, openerFailed: msg.slice(0, 200) }).catch(() => {});
    return { submitted: false, reason: msg };
  }
}

/** One status check. "pending" means ask again later. */
export async function checkVideoOpener(creativeId: string): Promise<"done" | "pending" | "failed"> {
  const creative = await prisma.adLabCreative.findUnique({ where: { id: creativeId }, select: { generationPrompt: true } });
  const copy = decodeAdCopy(creative?.generationPrompt);
  if (copy.openerClipUrl) return "done";
  if (!creative || !copy.openerRequestId) return "failed";
  try {
    const { checkCoverVideo } = await import("@/lib/content-factory/animate-cover");
    const st = await checkCoverVideo(copy.openerRequestId, copy.openerModel);
    if (st.status === "failed" || st.status === "nsfw") {
      await saveAdCopy(creativeId, creative.generationPrompt, { ...copy, openerRequestId: undefined, openerFailed: `higgsfield ${st.status}` });
      return "failed";
    }
    if (st.status !== "completed" || !st.videoUrl) return "pending";
    const res = await fetch(st.videoUrl);
    if (!res.ok) throw new Error(`clip download ${res.status}`);
    const { supabase } = await import("@/lib/supabase.server");
    const name = `${creativeId}-opener-${Date.now()}.mp4`;
    const { error } = await supabase.storage
      .from("adlab-creatives")
      .upload(name, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const openerClipUrl = supabase.storage.from("adlab-creatives").getPublicUrl(name).data.publicUrl;
    await saveAdCopy(creativeId, creative.generationPrompt, { ...copy, openerRequestId: undefined, openerClipUrl });
    return "done";
  } catch (err) {
    console.warn(`[adlab-weekly] opener check failed for ${creativeId}: ${err instanceof Error ? err.message : err}`);
    return "pending";
  }
}

/**
 * Render + upload one video ad (2026-09-29): the MP4 (with a track from the
 * lane's music library) and its poster frame as imageUrl (feed 4:5) and
 * storyImageUrl (9:16). The MP4 URL is written back into the AD_COPY tag —
 * there's no videoUrl column on AdLabCreative, and the launch route reads it
 * from there.
 */
async function generateBatchVideo(creative: {
  id: string;
  headline: string;
  generationPrompt: string | null;
  angle: { experiment: { campaignTags: string[] } };
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const groupKey: BatchGroupKey = creative.angle.experiment.campaignTags.includes("men") ? "men" : "women";
    const copy = decodeAdCopy(creative.generationPrompt);
    if (!copy.video) throw new Error("video creative has no script");
    const { renderVideoAd } = await import("@/lib/adlab/ad-video");
    const { pickMusicTrack } = await import("@/lib/content-factory/slideshow-reel");
    const musicUrl = await pickMusicTrack(null, groupKey === "men" ? "bwk" : "ripple").catch(() => null);
    let openerClip: Buffer | null = null;
    if (copy.openerClipUrl) {
      openerClip = await fetch(copy.openerClipUrl)
        .then(async (res) => (res.ok ? Buffer.from(await res.arrayBuffer()) : null))
        .catch(() => null);
    }
    const r = await renderVideoAd(groupKey, { ...copy.video, endHeadline: creative.headline }, { musicUrl, openerClip });

    const { supabase } = await import("@/lib/supabase.server");
    const stamp = Date.now();
    const upload = async (name: string, buf: Buffer, contentType: string) => {
      const { error } = await supabase.storage.from("adlab-creatives").upload(name, buf, { contentType, upsert: true });
      if (error) throw new Error(`Supabase upload failed: ${error.message}`);
      return supabase.storage.from("adlab-creatives").getPublicUrl(name).data.publicUrl;
    };
    const [videoUrl, imageUrl, storyImageUrl] = await Promise.all([
      upload(`${creative.id}-video-${stamp}.mp4`, r.mp4, "video/mp4"),
      upload(`${creative.id}-poster-feed-${stamp}.jpg`, r.posterFeed, "image/jpeg"),
      upload(`${creative.id}-poster-story-${stamp}.jpg`, r.posterStory, "image/jpeg"),
    ]);
    const prompt = creative.generationPrompt ?? "";
    await prisma.adLabCreative.update({
      where: { id: creative.id },
      data: {
        imageUrl,
        storyImageUrl,
        generationPrompt: `${stripAdCopy(prompt)}${encodeAdCopy({ ...(copy as AdImageCopy), videoUrl })}`,
      },
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[adlab-weekly] video failed for ${creative.id}: ${msg}`);
    await prisma.adLabCreative
      .update({ where: { id: creative.id }, data: { complianceNotes: `IMAGE_ERROR: ${msg}`.slice(0, 500) } })
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
