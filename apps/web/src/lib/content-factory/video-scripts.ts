/**
 * Weekly talking-head video scripts from the audience pulse
 * (2026-09-21, per Keenan: "build a script generator for each audience
 * topic that generates 3 scripts/topics for videos based on the
 * audience pulse" — talking-head format, delivered by email after the
 * Monday pulse digest).
 *
 * For each brand, Claude reads the freshest RedditTrendDigest themes
 * and writes 3 scripts a person reads straight to camera: a
 * scroll-stopping first line, 3-5 spoken beats, and a soft close. The
 * email goes to the same address as the other content-factory reports.
 * Everything is soft: no digest or a Claude/Resend failure means no
 * email, never a thrown run.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const CLAUDE_MODEL = "claude-sonnet-4-6";
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

const FROM_ADDRESS =
  process.env.CONTENT_FACTORY_EMAIL_FROM ??
  '"Ripple Content" <content@getacuity.io>';
const TO_ADDRESS =
  process.env.CONTENT_FACTORY_EMAIL_TO ?? "keenan@heelerdigital.com";

const BRAND_LABEL: Record<Brand, string> = { ripple: "Ripple", bwk: "BWK" };

type Brand = "ripple" | "bwk";

export type VideoScript = {
  /** Pulse theme this script rides. */
  theme: string;
  /** Internal label for the email, not spoken. */
  title: string;
  /** First spoken line — must stop the scroll inside 2 seconds. */
  hook: string;
  /** Spoken beats, in order. Each is a few sentences read aloud. */
  beats: string[];
  /** Soft closing line. */
  cta: string;
};

const SPEAKER: Record<Brand, string> = {
  ripple: `THE SPEAKER: a woman in her 40s talking straight to camera, one take, like a voice memo to a friend. Her audience is women roughly 40-50 carrying a heavy mental load: the schedules, the appointments, the emotional labor nobody else tracks. She is warm, a little tired, completely honest. She reflects, she never lectures, and she never sells anything.`,
  bwk: `THE SPEAKER: a man in his 30s-40s talking straight to camera, one take, low and direct. His audience is men quietly rebuilding themselves: discipline, routines, keeping promises to yourself when nobody is watching. He is calm and specific, never a drill sergeant, never a guru, and he never sells anything.`,
};

function buildSystemPrompt(brand: Brand, themes: ThemeInput[]): string {
  const themeBlock = themes
    .map(
      (t, i) =>
        `${i + 1}. ${t.theme}: ${t.why}${t.phrases.length ? ` (their words: ${t.phrases.join(", ")})` : ""}`
    )
    .join("\n");
  return `You write short talking-head TikTok scripts.

${SPEAKER[brand]}

WHAT THIS AUDIENCE IS FEELING RIGHT NOW (live audience research, ranked):
${themeBlock}

Write EXACTLY 3 scripts. Each script rides a DIFFERENT theme from the list above — pick the 3 strongest. Never mention the research, Reddit, communities, or trends.

SCRIPT RULES:
- 30-45 seconds spoken: hook + 3-5 beats + close, about 90-130 words total.
- "hook" is the first spoken line. It must stop the scroll in under 2 seconds: a confession, a specific moment, or a sentence the viewer would swear was written about them. Never a question like "have you ever...".
- "beats" are what the speaker says next, in order. Spoken language only: short sentences, contractions, the way people actually talk. Concrete moments and specifics, no advice-column abstractions.
- "cta" is one soft closing line that lands the feeling or invites a comment. No "follow for more". No links. No product.
- "title" is a 3-6 word internal label. "theme" is the theme text you picked, copied exactly.

Return ONLY valid JSON: {"scripts":[{"theme":"...","title":"...","hook":"...","beats":["..."],"cta":"..."}]}`;
}

type ThemeInput = { theme: string; why: string; phrases: string[] };

/**
 * Generate 3 talking-head scripts for a brand from the freshest pulse
 * digest. Returns [] when there is no digest or generation fails.
 */
export async function generateVideoScripts(
  brand: Brand
): Promise<VideoScript[]> {
  const { getTopThemes } = await import("./reddit-trends");
  const themes = await getTopThemes(brand, 6);
  if (themes.length === 0) {
    console.warn(`[video-scripts] no fresh pulse digest for ${brand} — skipping`);
    return [];
  }

  const { HUMAN_VOICE_RULES } = await import("./humanizer");
  const { prisma } = await import("@/lib/prisma");
  const start = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2500,
      system: `${buildSystemPrompt(brand, themes)}\n\n${HUMAN_VOICE_RULES}`,
      messages: [
        {
          role: "user",
          content:
            "Write the 3 talking-head scripts now. Return ONLY the JSON.",
        },
      ],
    });

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    await prisma.claudeCallLog.create({
      data: {
        purpose: `video-scripts-${brand}`,
        model: CLAUDE_MODEL,
        tokensIn,
        tokensOut,
        costCents: Math.ceil(
          (tokensIn * INPUT_COST_PER_TOKEN +
            tokensOut * OUTPUT_COST_PER_TOKEN) *
            100
        ),
        durationMs: Date.now() - start,
        success: true,
      },
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStr = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(jsonStr) as { scripts?: VideoScript[] };
    const scripts = (parsed.scripts ?? []).filter(
      (s) =>
        s &&
        typeof s.hook === "string" &&
        Array.isArray(s.beats) &&
        s.beats.length > 0 &&
        typeof s.cta === "string"
    );
    return scripts.slice(0, 3);
  } catch (err) {
    console.error(
      `[video-scripts] generation failed for ${brand}: ${err instanceof Error ? err.message : err}`
    );
    return [];
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function scriptHtml(s: VideoScript, i: number): string {
  return `
  <div style="margin:0 0 28px;padding:16px;border:1px solid #e5e5e5;border-radius:8px">
    <div style="color:#666;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Script ${i + 1} · ${esc(s.title)}</div>
    <div style="color:#999;font-size:12px;margin:2px 0 10px">Riding: ${esc(s.theme)}</div>
    <p style="margin:0 0 10px;font-weight:bold">${esc(s.hook)}</p>
    ${s.beats.map((b) => `<p style="margin:0 0 10px">${esc(b)}</p>`).join("\n")}
    <p style="margin:0;font-style:italic">${esc(s.cta)}</p>
  </div>`;
}

/**
 * Generate scripts for both brands and email them as one report.
 * Returns the number of scripts sent (0 = nothing sent).
 */
export async function sendVideoScriptReport(): Promise<number> {
  const [ripple, bwk] = [
    await generateVideoScripts("ripple"),
    await generateVideoScripts("bwk"),
  ];
  const total = ripple.length + bwk.length;
  if (total === 0) {
    console.warn("[video-scripts] no scripts generated — skipping email");
    return 0;
  }

  let resend: ReturnType<typeof import("@/lib/resend").getResendClient>;
  try {
    const { getResendClient } = await import("@/lib/resend");
    resend = getResendClient(); // throws when RESEND_API_KEY is unset
  } catch {
    console.warn("[video-scripts] RESEND_API_KEY not set — skipping email");
    return 0;
  }

  const section = (brand: Brand, scripts: VideoScript[]) =>
    scripts.length === 0
      ? ""
      : `<h2 style="margin:24px 0 12px">${BRAND_LABEL[brand]}</h2>${scripts
          .map((s, i) => scriptHtml(s, i))
          .join("\n")}`;

  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: TO_ADDRESS,
    subject: `🎤 Talking-head scripts from this week's pulse — ${dateLabel}`,
    html: `<p>Three camera-ready scripts per brand, each riding one of this week's strongest audience-pulse themes. Bold line is the hook, italic line is the close. Read them like a voice memo, one take.</p>${section("ripple", ripple)}${section("bwk", bwk)}`,
  });
  if (error) {
    console.error(`[video-scripts] email send failed: ${error.message}`);
    return 0;
  }
  console.log(
    `[video-scripts] emailed ${ripple.length} Ripple + ${bwk.length} BWK scripts`
  );
  return total;
}
