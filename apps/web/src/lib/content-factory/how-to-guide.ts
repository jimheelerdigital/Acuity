/**
 * Ripple "how to" paper guide (2026-10-15, per Keenan: "bring [the paper
 * guides] back in photo carousel form and have it post between these two
 * posts daily. the post topics need to be more general... 'how to find joy
 * in life' or 'how to calm down after a stressful day' ... with step by step
 * instructions (4-5) that give people guidance"; "send me the photo carousel
 * daily and I'll post by hand").
 *
 * Same paper look as the reset guides (paper-guide.ts renders the sheets),
 * different writer: a broad, everyday "how to ___" title and 4-5 numbered
 * steps, each a clear instruction plus a few lines on how to actually do it.
 * Same candidate pipeline as the list posts: 5 Opus drafts, code rules, Opus
 * plain-sense editor (with one repair), Jev ranks.
 */

import { contentAnthropic, lastJsonText, messageText, VISION_MODEL } from "./claude-client";
import { copyObjectives } from "./copy-objectives";
import { HUMAN_VOICE_RULES, stripDashes } from "./humanizer";
import type { PaperGuideSlide, PaperGuideTopic } from "./paper-guide";
import { CLAIMS_RULE, TIME_OF_DAY_RULE } from "@/lib/positioning";

/** Broad life areas, one per draft, so the 5 drafts cover different ground. */
export const HOWTO_AREAS = [
  "joy and finding the good in an ordinary week",
  "calming down after a stressful day or a hard week",
  "gratitude and noticing the little things",
  "rest that actually restores her",
  "feeling less overwhelmed when everything needs her",
  "letting go of guilt and the things she can't control",
  "reconnecting with herself, her friends or her partner",
  "starting over or getting unstuck after a rough stretch",
  "confidence, saying no and asking for help",
  "slowing down and being present with the people she loves",
] as const;

const SYSTEM = `${copyObjectives("ripple")}

THIS LANE: a "how to" guide typed onto a sheet of paper, posted as a photo carousel she swipes through. Slide 1 is the title; each slide after it is ONE step. It lives or dies on saves: she finishes it thinking "I can actually do this," saves it, and comes back to it on the hard day.

THE TITLE: a broad, everyday "how to ___" that almost any woman of 40-50 wants, in plain words: "how to find joy in an ordinary week", "how to calm down after a stressful day", "how to be more thankful for the little things", "how to stop feeling guilty for resting". Under 50 characters, lowercase except "I". It must make complete sense on its own, and the steps must deliver exactly what it promises. No numbers, no clickbait.

THE STEPS: 4 or 5, in the order she would actually do them. Each step is:
- "header": the step's name, 2 to 4 words, a plain instruction ("name what's heavy", "go outside for ten minutes").
- "sub": one plain sentence, at most 36 characters, saying exactly what to do.
- "body": 2 to 4 short lines (each at most 36 characters, split longer thoughts across lines) that show HOW: a concrete example from her real life, what to say or write, or why it helps. Lines can be "• " bullets.
Every step names a real, doable action with a real thing in it (a notebook, a walk around the block, three things written down, one text to a friend). "Be kind to yourself" is a wish, not a step. No two steps say the same thing. The last step is the small thing she can keep doing so it lasts.

VOICE: a warm friend who has been there and is handing over what actually helped. Plain, calm, specific, never a coach, never preachy, never a lecture, no wellness clichés ("self-care", "you deserve", "manifest", "journey", "boundaries are"), no therapy language.

LIMITS: ${CLAIMS_RULE} Stress, worry and anxious weeks are everyday feelings here: never diagnose ("your anxiety"), never promise to treat or cure anything, no medical or mental-health claims, no breathing counts sold as treatment. ${TIME_OF_DAY_RULE} No app, brand or product names. No statistics. No emojis, no hashtags, no em dashes. US English.

Return only the JSON object: {"title": string, "slides": [{"header": string, "sub": string, "body": string[]}], "captionQuestion": string}
"captionQuestion" is one question under 15 words she genuinely wants to answer about her own life (no app name, no "save this").`;

export interface HowToGuide extends PaperGuideTopic {
  area: string;
  captionQuestion: string;
  jev?: Record<string, number> | null;
  rankedBy?: string;
  candidateLog?: string;
  held?: string;
}

function cleanSlides(raw: unknown): PaperGuideSlide[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((s): s is { header: string; sub: string; body: unknown[] } => typeof s?.header === "string" && typeof s?.sub === "string" && Array.isArray(s?.body))
    .map((s, i) => ({
      header: `${i + 1}. ${stripDashes(s.header).replace(/^\s*(step\s*)?\d+[.):]\s*/i, "").trim()}`.toUpperCase(),
      sub: stripDashes(s.sub).trim(),
      body: s.body.map((l) => stripDashes(String(l ?? "")).trim()).slice(0, 6),
    }))
    .filter((s) => s.header && s.sub && s.body.some(Boolean))
    .slice(0, 5);
}

function slugOf(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function logCall(purpose: string, model: string, usage: { input_tokens: number; output_tokens: number }, start: number) {
  const { prisma } = await import("@/lib/prisma");
  void prisma.claudeCallLog
    .create({
      data: {
        purpose,
        model,
        tokensIn: usage.input_tokens,
        tokensOut: usage.output_tokens,
        // Opus 5.5: $4 / $20 per MTok.
        costCents: Math.ceil((usage.input_tokens * 4 + usage.output_tokens * 20) / 10_000),
        durationMs: Date.now() - start,
        success: true,
      },
    })
    .catch(() => {});
}

async function draftOnce(area: string, recent: string[], brief: string, model: string): Promise<HowToGuide> {
  const start = Date.now();
  const user = [
    `THIS GUIDE'S LIFE AREA (other drafts take other areas, so stay in this one): ${area}`,
    brief ? `\n${brief}` : "",
    recent.length ? `\nRECENT TITLES ACROSS ALL OUR POSTS (don't repeat or lightly reword these):\n${recent.map((t) => `- ${t}`).join("\n")}` : "",
    "\nReturn ONLY valid JSON.",
  ].join("\n");
  const res = await contentAnthropic.messages.create({
    model,
    max_tokens: 2000,
    system: `${SYSTEM}\n\n${HUMAN_VOICE_RULES}`,
    messages: [{ role: "user", content: user }],
  });
  await logCall("howto-guide-draft", model, res.usage, start);
  const p = JSON.parse(lastJsonText(messageText(res))) as { title?: string; slides?: unknown; captionQuestion?: string };
  const title = stripDashes(p.title ?? "").trim();
  const slides = cleanSlides(p.slides);
  if (!title || slides.length < 4) throw new Error(`how-to draft unusable (${slides.length} steps)`);
  return { slug: slugOf(title), title, slides, area, captionQuestion: stripDashes(p.captionQuestion ?? "").trim() };
}

const renderGuide = (g: HowToGuide) =>
  `TITLE: ${g.title}\n${g.slides.map((s) => `${s.header}\n${s.sub}\n${s.body.filter(Boolean).join("\n")}`).join("\n\n")}`;

/** Opus plain-sense editor. Fails closed. */
async function howToSenseProblem(g: HowToGuide): Promise<string | null> {
  try {
    const res = await Promise.race([
      contentAnthropic.messages.create({
        model: VISION_MODEL,
        max_tokens: 400,
        effort: "medium",
        system: `You are a blunt, strict copy editor. The reader is a tired 45-year-old woman swiping through a photo carousel. Decide whether this "how to" guide makes plain sense and genuinely helps on ONE read. When in doubt, fail it.

FAIL if ANY of these is true:
- The title, read alone, doesn't say one clear thing she instantly wants.
- The steps don't deliver what the title promises, or come in an order that makes no sense.
- A step is vague advice anyone could write ("be kind to yourself", "practice self-care") instead of a concrete action she could do today.
- Two steps say the same thing.
- A line is garbled, contradicts its step, or uses a he/she/they with no clear person.
- Anything diagnoses her, promises to treat or cure anxiety, stress or any condition, or makes a medical claim.

Return only JSON: {"ok": true} or {"ok": false, "problem": "which line fails and why, one sentence"}`,
        messages: [{ role: "user", content: renderGuide(g) }],
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("sense check timed out after 60s")), 60_000)),
    ]);
    const parsed = JSON.parse(lastJsonText(messageText(res))) as { ok?: boolean; problem?: string };
    console.log(`[howto-sense] "${g.title}": ${parsed.ok ? "ok" : `FAIL ${parsed.problem}`}`);
    return parsed.ok === false ? (parsed.problem ?? "a line doesn't make plain sense") : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[howto-sense] check errored — cutting this candidate: ${msg}`);
    return `sense check unavailable (${msg.slice(0, 80)})`;
  }
}

/** Fix only the flagged line(s); null if it can't. */
async function repairGuide(g: HowToGuide, problem: string): Promise<HowToGuide | null> {
  const { CANDIDATE_WRITER_MODEL } = await import("./candidate-pipeline");
  const start = Date.now();
  const res = await contentAnthropic.messages.create({
    model: CANDIDATE_WRITER_MODEL,
    max_tokens: 2000,
    effort: "medium",
    system: `${SYSTEM}\n\n${HUMAN_VOICE_RULES}`,
    messages: [
      {
        role: "user",
        content: `An editor flagged this finished guide: ${problem}\n\nFix ONLY what that problem names. Keep the title and every other step exactly as they are, and keep every line within its length limits. Return the full guide as JSON in the same shape.\n\n${JSON.stringify({ title: g.title, slides: g.slides, captionQuestion: g.captionQuestion })}`,
      },
    ],
  });
  await logCall("howto-guide-repair", CANDIDATE_WRITER_MODEL, res.usage, start);
  const j = JSON.parse(lastJsonText(messageText(res))) as { slides?: unknown; captionQuestion?: string };
  const slides = cleanSlides(j.slides);
  if (slides.length !== g.slides.length) return null;
  return { ...g, slides, captionQuestion: j.captionQuestion?.trim() || g.captionQuestion };
}

/** Write the day's guide: 5 Opus drafts (different life areas), cut, rank. */
export async function generateHowToGuide(opts: { recentTitles: string[]; lastArea?: string }): Promise<HowToGuide> {
  const { CANDIDATE_COUNT, CANDIDATE_WRITER_MODEL, rankCandidates } = await import("./candidate-pipeline");
  const { readBriefBlock } = await import("./weekly-brief");
  const { isRecentHeadline, nearDuplicateOf, noteHeadlineUsed } = await import("./headline-history");
  const brief = await readBriefBlock("ripple");
  const areas = HOWTO_AREAS.filter((a) => a !== opts.lastArea)
    .sort(() => Math.random() - 0.5)
    .slice(0, CANDIDATE_COUNT);
  const within = <T,>(p: Promise<T>, ms: number) =>
    Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`draft timed out after ${ms}ms`)), ms))]);
  const settled = await Promise.allSettled(
    areas.map((area) => within(draftOnce(area, opts.recentTitles.slice(0, 60), brief, CANDIDATE_WRITER_MODEL), 150_000))
  );
  const drafts = settled.filter((r): r is PromiseFulfilledResult<HowToGuide> => r.status === "fulfilled").map((r) => r.value);
  if (drafts.length === 0) {
    const why = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(`[howto-guide] every draft failed: ${why?.reason instanceof Error ? why.reason.message : why?.reason}`);
  }
  const ranked = await rankCandidates({
    brand: "ripple",
    label: "howto-guide",
    candidates: drafts,
    render: renderGuide,
    reject: async (g) => {
      if (!/^how to\b/i.test(g.title)) return 'title is not a "how to"';
      if (g.title.length > 55) return `title too long (${g.title.length} chars)`;
      if (/\bripple\b/i.test(renderGuide(g))) return "names Ripple";
      // The renderer sets one line per string at a fixed size.
      const long = g.slides.flatMap((s) => [s.sub, ...s.body]).find((l) => l.length > 42);
      if (long) return `line too long for the page: "${long}"`;
      if (await isRecentHeadline(g.title)) return "title repeats a recent post";
      const near = await nearDuplicateOf(g.title);
      return near ? `too close to recent title "${near}"` : null;
    },
    senseCheck: howToSenseProblem,
    repair: repairGuide,
  });
  const candidateLog = `${drafts.length} drafted; ${ranked ? `${ranked.survivors} survived, ranked by ${ranked.rankedBy}` : "none survived"}`;
  if (!ranked) return { ...drafts[0], held: "no candidate passed the plain-sense check", jev: null, rankedBy: "none", candidateLog };
  noteHeadlineUsed(ranked.winner.title);
  return { ...ranked.winner, jev: ranked.jev, rankedBy: ranked.rankedBy, candidateLog };
}
