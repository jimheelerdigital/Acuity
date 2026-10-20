/**
 * Ripple "same words, two perspectives" split lane (2026-10-20, per Keenan:
 * "one ripple list, one split post like we ran the other time ... kling 2.5
 * clips, short and sweet ... 3-5 slides ... only post this 3x weekly").
 *
 * One post = 3-5 pairs. Each pair says the SAME line twice: the top half is
 * the heavy version of the moment, the bottom half the freeing one. Each half
 * is its own illustrated Kling 2.5 Turbo clip. The post ends on 2 original
 * perspective lines fading in over black. Recreated from the 10-16 one-off
 * (victorianpoetry-style split), which did well on every platform.
 *
 * The first runs come from the 8 scripts Keenan approved on 2026-10-20 (in
 * order); after that Opus writes new ones in the same style (approved
 * scripts as examples), cut by a plain-sense editor and ranked by Jev. Age
 * and body themes were rejected (scripts 3 and 9) and are off-limits.
 */
import { contentAnthropic, lastJsonText, messageText, VISION_MODEL } from "./claude-client";

export interface SplitPair {
  line: string;
  /** Heavy version of the moment (top half). */
  heavy: string;
  /** Freeing version of the same moment (bottom half). */
  free: string;
}

export interface SplitScript {
  theme: string;
  pairs: SplitPair[];
  ending: [string, string];
  captionQuestion: string;
  /** "seed" = one of Keenan's approved scripts; "written" = new from Opus. */
  origin: "seed" | "written";
  jev?: Record<string, number> | null;
  rankedBy?: string;
  candidateLog?: string;
  held?: string;
}

const seed = (theme: string, pairs: [string, string, string][], ending: [string, string], captionQuestion: string): SplitScript => ({
  theme,
  pairs: pairs.map(([line, heavy, free]) => ({ line, heavy, free })),
  ending,
  captionQuestion,
  origin: "seed",
});

/** Keenan's approved scripts, 2026-10-20 ("great" first, then "good"). */
export const SPLIT_SEEDS: SplitScript[] = [
  seed("The load", [
    ["I have to remember everything.", "Her kitchen counter and fridge are covered in sticky notes; she stares at them, overwhelmed.", "She sits on the porch with coffee and one short handwritten list, relaxed."],
    ["Nobody else is going to do it.", "She stands alone beside a mountain of unfolded laundry in a dim room.", "She hands a laundry basket to her teenage kid; both are laughing."],
    ["I'm the one who holds it together.", "She strains up a staircase carrying a tall, wobbling stack of boxes.", "The boxes are set down on the stairs; she sits beside them, eyes closed, breathing out."],
  ], ["Same words. Different weight.", "What you carry isn't the problem. Carrying it alone is."], "What's one thing you're tired of carrying alone?"),
  seed("I got nothing done", [
    ["I got nothing done today.", "She is slumped at a messy kitchen table piled with dishes and papers.", "She sits beside her elderly mother, holding her hand, both smiling softly."],
    ["I wasted the whole weekend.", "She lies on the couch staring at the ceiling, drained.", "She lies in the grass beside her dog, laughing."],
    ["I'm behind.", "She runs after a bus that is pulling away in the rain.", "She walks slowly along a beach, barefoot, at ease."],
  ], ["Some days the work is invisible.", "It still counts."], "What did you do this week that nobody saw?"),
  seed("Empty nest", [
    ["The house is quiet.", "She sits alone at a long, empty dinner table.", "She relaxes in a bath with a candle, smiling."],
    ["They don't need me like before.", "She stands in the driveway watching a car drive away.", "She sits at a pottery wheel in a bright class, hands in wet clay, grinning."],
    ["It's just me now.", "She stands at the counter with a single plate.", "She cooks her favorite meal with music playing, swaying."],
  ], ["An empty room can feel like loss.", "Or like space you finally get to fill."], "What would you fill the space with?"),
  seed("It's all in my head", [
    ["It's all in my head.", "She holds her head, surrounded by tangled scribbled lines.", "She walks outdoors talking it out, lighter, the tangle gone."],
    ["I'll forget something.", "She panics in a grocery aisle, phone in hand, cart half empty.", "She pushes a calm, full cart past the checkout with her list ticked off."],
    ["I can't switch off.", "She sits in a parked car, staring blankly ahead.", "She drives with the window down, hair blowing, singing."],
  ], ["Your mind was never meant to be a storage unit.", "Put it somewhere. Then breathe."], "What's living rent-free in your head right now?"),
  seed("Saying no", [
    ["I said no.", "She hides her face in her hands, guilty.", "She walks out of a building into bright sunshine, shoulders back."],
    ["They're disappointed in me.", "She reads a message on her phone, tears in her eyes.", "She laughs at a café table with two friends who get it."],
    ["I chose myself.", "She sits alone at a table, looking small and unsure.", "She stands alone on a mountain summit, arms loose, free."],
  ], ["Every no is a yes to something.", "Make sure some of them are yes to you."], "What's one thing you'd say no to if you weren't afraid of the guilt?"),
  seed("It's too late", [
    ["It's too late.", "She stands on a platform watching a train pull away.", "She sits in a window seat on the next train, watching the view, smiling."],
    ["I don't know what's next.", "She stands at a crossroads in thick grey fog.", "She stands at the same crossroads in sunshine, choosing a path."],
    ["Things will never be the same.", "She packs up an old house into boxes, sad.", "She plants flowers in the garden of a new house, kneeling in the soil, happy."],
  ], ["The same sentence can be a wall or a door.", "You decide which side you're on."], "What's a door you thought had closed?"),
  seed("Rest", [
    ["I can't stop.", "She rushes through her house, a blur of motion.", "She stands still in a doorway, watching the rain, calm."],
    ["There's always something.", "Her phone buzzes with notifications on the bed beside her.", "Her phone lies face down while she reads a book in a patch of sun."],
    ["I'll rest later.", "She has fallen asleep slumped over her desk.", "She naps in a hammock between two trees."],
  ], ["Rest isn't the reward for finishing.", "Nothing is ever finished."], "When did you last rest without earning it first?"),
  seed("Everyone needs me", [
    ["Everyone needs me.", "Hands reach toward her from every side; she looks stretched thin.", "Her family wraps her in a warm group hug."],
    ["I said yes again.", "She stares at a wall calendar crammed with commitments.", "She crosses one thing off the calendar, smiling."],
    ["I'm always the one who remembers.", "She frantically writes birthdays and appointments in a notebook.", "Her family sings to her around her own birthday cake."],
  ], ["Being needed and being used look the same from the outside.", "Only you know which one it is."], "What do you always remember that nobody remembers for you?"),
];

const WOMAN = "a woman in her early 40s with shoulder-length dark brown hair, in simple everyday clothes";
const STYLE = `Hand-drawn editorial illustration like a modern indie graphic novel: clean ink linework, flat muted colors, visible paper grain and fine print noise, soft simple shading. Not photoreal, not 3D, not glossy anime. The woman is ${WOMAN}. Any weather or effect in the scene (rain, mist, light) is drawn clearly into the picture. ABSOLUTELY NO text, letters, words or signatures anywhere. Wide 3:2 frame with calm open space across the upper third for a short handwritten line added later.`;

/** Image prompt for one half (heavy = muted and weighed down, free = warm and light). */
export function splitImagePrompt(scene: string, mood: "heavy" | "free"): string {
  const tone = mood === "heavy" ? "Mood: heavy and weighed down; muted grey, blue or dusky palette." : "Mood: freeing and warm; bright, warm palette.";
  return `${scene} ${tone}\n\n${STYLE}`;
}

/** Kling 2.5 Turbo prompt: small real-time movement, illustrated style kept. */
export function splitMotionPrompt(scene: string): string {
  return [
    "A shot from a hand-drawn illustrated animation, keeping the image's exact illustrated style: ink lines, muted colors, paper grain.",
    `Scene: ${scene.slice(0, 300)}`,
    "Action: small, natural movement in real time that belongs in this scene (hair and clothes stir, steam, rain, leaves, water, a slow breath or a small gesture). Real-world speed, never a timelapse.",
    "Camera: steady. Keep the same woman, face, hair, clothes, colors and composition. No text, no new people, no morphing.",
  ].join(" ");
}

const SYSTEM = `You write one short "same words, two perspectives" video for Ripple. Audience: women about 40-50 carrying the mental load for a family, a job and often aging parents. The niche is the load in HER head (remembering, tracking, over-functioning, guilt, rest), never relationship advice or blaming a partner.

THE FORMAT: 3 to 5 pairs. Each pair is ONE short first-person line she says to herself (2-7 words, ends with a period, e.g. "I'm behind."), shown twice: a HEAVY scene where the line weighs her down, and a FREE scene where the very same words mean something lighter. Then an ending of exactly 2 short lines (each under 12 words) that names the shift, in plain words, like a friend, never a lesson. Each scene is one concrete picture (under 25 words) with her in it: where she is and what she's doing. The FREE scene must be the same words read a new way, not a fix or a product.

RULES: Original words only (never quote books or famous people). No age or body themes (looks, weight, menopause, aging, fitness). No therapy, diagnosis or health claims. Don't mention Ripple or any app. No time-of-day words (night, morning, bedtime). No emojis, no em dashes. US English.

Return only JSON: {"theme": "2-4 words", "pairs": [{"line": "...", "heavy": "...", "free": "..."}], "ending": ["...", "..."], "captionQuestion": "one question under 15 words she wants to answer"}`;

function examples(): string {
  return SPLIT_SEEDS.slice(0, 4)
    .map((s) => JSON.stringify({ theme: s.theme, pairs: s.pairs, ending: s.ending, captionQuestion: s.captionQuestion }))
    .join("\n");
}

async function draftOnce(recent: string[], model: string): Promise<SplitScript> {
  const res = await contentAnthropic.messages.create({
    model,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Approved examples (match their tone and simplicity; never reuse their lines or themes):\n${examples()}\n\nThemes and lines used recently (pick something different):\n${recent.slice(0, 40).map((r) => `- ${r}`).join("\n") || "- none"}\n\nWrite one new video. Return ONLY the JSON.`,
      },
    ],
  });
  const j = JSON.parse(lastJsonText(messageText(res))) as Partial<SplitScript>;
  const pairs = (j.pairs ?? []).filter((p) => p?.line && p?.heavy && p?.free).slice(0, 5) as SplitPair[];
  const ending = (Array.isArray(j.ending) ? j.ending : []).map(String).slice(0, 2);
  if (pairs.length < 3 || ending.length < 2) throw new Error(`split draft unusable (${pairs.length} pairs)`);
  return { theme: String(j.theme ?? "").trim(), pairs, ending: [ending[0], ending[1]], captionQuestion: String(j.captionQuestion ?? "").trim(), origin: "written" };
}

async function splitSenseProblem(s: SplitScript): Promise<string | null> {
  try {
    const res = await contentAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 300,
      effort: "medium",
      system: `You are a blunt editor. The viewer is a tired 45-year-old woman scrolling fast. FAIL this split video if ANY pair's FREE scene isn't a believable new reading of the SAME words, any line is confusing, the ending lectures or doesn't follow from the pairs, it blames a partner, or it touches age, body, therapy or health. Return only JSON: {"ok": true} or {"ok": false, "problem": "one sentence"}`,
      messages: [{ role: "user", content: `${s.pairs.map((p, i) => `${i + 1}. "${p.line}"\n   heavy: ${p.heavy}\n   free: ${p.free}`).join("\n")}\nEnding: ${s.ending.join(" / ")}` }],
    });
    const j = JSON.parse(lastJsonText(messageText(res))) as { ok?: boolean; problem?: string };
    return j.ok === false ? (j.problem ?? "doesn't make plain sense") : null;
  } catch (err) {
    return `sense check unavailable (${String(err).slice(0, 60)})`;
  }
}

/**
 * Today's script: the next approved seed not used yet (by theme), else the
 * best of 3 new Opus drafts. usedThemes = themes of past ripple-split posts.
 */
export async function nextSplitScript(usedThemes: string[]): Promise<SplitScript> {
  const used = new Set(usedThemes.map((t) => t.toLowerCase()));
  const fresh = SPLIT_SEEDS.find((s) => !used.has(s.theme.toLowerCase()));
  if (fresh) return fresh;

  const { CANDIDATE_WRITER_MODEL, rankCandidates } = await import("./candidate-pipeline");
  const recent = [...usedThemes, ...SPLIT_SEEDS.flatMap((s) => s.pairs.map((p) => p.line))];
  const settled = await Promise.allSettled([0, 1, 2].map(() => draftOnce(recent, CANDIDATE_WRITER_MODEL)));
  const drafts = settled.filter((r): r is PromiseFulfilledResult<SplitScript> => r.status === "fulfilled").map((r) => r.value);
  if (!drafts.length) throw new Error("[split] every draft failed");
  const ranked = await rankCandidates({
    brand: "ripple",
    label: "ripple-split",
    candidates: drafts,
    render: (s) => `${s.pairs.map((p) => p.line).join(" / ")} | ending: ${s.ending.join(" ")}`,
    reject: (s) => (used.has(s.theme.toLowerCase()) ? "theme already used" : null),
    senseCheck: splitSenseProblem,
  });
  const candidateLog = `${drafts.length} drafted; ${ranked ? `${ranked.survivors} survived, ranked by ${ranked.rankedBy}` : "none survived"}`;
  if (!ranked) return { ...drafts[0], held: "no draft passed the plain-sense check", candidateLog };
  return { ...ranked.winner, jev: ranked.jev, rankedBy: ranked.rankedBy, candidateLog };
}

/** One 3:2 illustration (gpt-image-2, medium, same as other post images). */
export async function generateSplitImage(prompt: string): Promise<Buffer> {
  const OpenAI = (await import("openai")).default;
  const key = process.env.ACUITY_ADLAB_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("No OpenAI API key configured");
  const client = new OpenAI({ apiKey: key, timeout: 170_000, maxRetries: 0 });
  const r = await client.images.generate({ model: "gpt-image-2", prompt, n: 1, size: "1536x1024", quality: "medium" });
  const b64 = r.data?.[0]?.b64_json;
  if (!b64) throw new Error("image generation returned no image data");
  return Buffer.from(b64, "base64");
}

export const SPLIT_CAPTION_TAGS = "#perspective #womenover40 #mentalload #midlife";
export const SPLIT_DAYS_UTC = [1, 3, 5]; // Mon, Wed, Fri at 05 UTC (Sun/Tue/Thu night Central)

export const splitSlug = (theme: string) => `split-${theme.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}`;
