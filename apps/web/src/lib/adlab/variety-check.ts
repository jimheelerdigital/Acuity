/**
 * Batch VARIETY CHECK (2026-10-05, per Keenan: "the more variance the
 * better"). After a weekly batch renders, Opus looks at all of its image
 * ads side by side and flags:
 *   - pairs that look too alike (same layout / visual style at a glance);
 *   - ads that obviously read as AI-made (warped objects, uncanny photo);
 *   - garbled, misspelled or cut-off text.
 * Up to MAX_REDOS flagged ads are re-pointed at a different, unused look
 * (fresh palette/type/scene) so the Inngest job can re-render them.
 * Fails open: any error → nothing is redone.
 */
import { prisma } from "@/lib/prisma";
import { LOOKS, copyFitsLook, randomVariant, type AdLook } from "./ad-looks";
import { buildAdImagePrompt, decodeAdCopy, type AdImageCopy, type BatchGroupKey } from "./weekly-batch";

export const MAX_REDOS = 3;

export interface VarietyVerdict {
  similar: [number, number][];
  fake: { n: number; reason: string }[];
  brokenText: { n: number; reason: string }[];
}

/** Which tile numbers (1-based) to redo: the later ad of each similar pair, plus fakes and broken text. */
export function pickRedos(v: VarietyVerdict, max = MAX_REDOS): number[] {
  const out: number[] = [];
  const add = (n: number) => {
    if (!out.includes(n) && out.length < max) out.push(n);
  };
  for (const b of v.brokenText) add(b.n);
  for (const f of v.fake) add(f.n);
  for (const [a, b] of v.similar) add(Math.max(a, b));
  return out;
}

/**
 * Run the check for one experiment and re-point flagged creatives at new
 * looks. Returns the creative ids that need a forced re-render.
 */
export async function runVarietyCheck(
  experimentId: string,
  groupKey: BatchGroupKey,
  opts: { dryRun?: boolean } = {}
): Promise<{ redo: string[]; verdict: VarietyVerdict | null; note: string }> {
  try {
    const creatives = await prisma.adLabCreative.findMany({
      where: { angle: { experimentId }, creativeType: "image", imageUrl: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, headline: true, description: true, primaryText: true, cta: true, formatKey: true, imageUrl: true, generationPrompt: true, angleId: true },
    });
    if (creatives.length < 2) return { redo: [], verdict: null, note: "fewer than 2 images" };

    const { default: sharp } = await import("sharp");
    const { textBlock } = await import("./ad-render");
    const { ensureFontFile } = await import("@/lib/content-factory/compose");
    const font = await ensureFontFile("Bold");
    const W = 300, H = 375, cols = 5;
    const tiles = await Promise.all(
      creatives.map(async (c, i) => {
        const r = await fetch(c.imageUrl!);
        const img = await sharp(Buffer.from(await r.arrayBuffer())).resize(W, H, { fit: "cover" }).toBuffer();
        const tag = await textBlock(`<span foreground="#FFFFFF" size="16000">${i + 1}</span>`, font, 60, 0);
        const badge = await sharp({ create: { width: 46, height: 40, channels: 4, background: "#E11D48" } })
          .composite([{ input: tag.buffer, left: 8, top: 4 }])
          .png()
          .toBuffer();
        return [
          { input: img, left: (i % cols) * W, top: Math.floor(i / cols) * H },
          { input: badge, left: (i % cols) * W, top: Math.floor(i / cols) * H },
        ];
      })
    );
    const sheet = await sharp({ create: { width: cols * W, height: Math.ceil(creatives.length / cols) * H, channels: 3, background: "#ffffff" } })
      .composite(tiles.flat())
      .jpeg({ quality: 80 })
      .toBuffer();

    const { contentAnthropic, VISION_MODEL, lastJsonText } = await import("@/lib/content-factory/claude-client");
    const response = await contentAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 900,
      effort: "low",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: sheet.toString("base64") } },
            {
              type: "text",
              text: `These are ${creatives.length} Facebook/Instagram ads from one weekly batch, numbered by the red badge. The goal is maximum VISUAL variety: every ad should look different at a glance (layout, style, colors, medium).
Report:
1. "similar": pairs of numbers that look too alike at a glance (same layout or visual style, could be mistaken for the same template). Only real look-alikes.
2. "fake": ads that obviously read as AI-generated in under a second (warped objects or hands, uncanny plastic photo, nonsense details). Not just "it's a render".
3. "brokenText": ads with garbled, misspelled, duplicated or cut-off text.
JSON only: {"similar": [[a,b], ...], "fake": [{"n": 3, "reason": "..."}], "brokenText": [{"n": 5, "reason": "..."}]}`,
            },
          ],
        },
      ],
    });
    const text = response.content.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : "")).join("");
    const raw = JSON.parse(lastJsonText(text)) as Partial<VarietyVerdict>;
    const n = creatives.length;
    const okN = (x: unknown): x is number => typeof x === "number" && x >= 1 && x <= n;
    const verdict: VarietyVerdict = {
      similar: (raw.similar ?? []).filter((p): p is [number, number] => Array.isArray(p) && okN(p[0]) && okN(p[1]) && p[0] !== p[1]),
      fake: (raw.fake ?? []).filter((f) => okN(f?.n)),
      brokenText: (raw.brokenText ?? []).filter((f) => okN(f?.n)),
    };
    const nums = pickRedos(verdict);
    if (!nums.length) return { redo: [], verdict, note: "batch passed" };
    if (opts.dryRun) return { redo: [], verdict, note: `dry run: would redo tiles ${nums.join(", ")}` };

    const usedLooks = new Set(creatives.map((c) => c.formatKey ?? ""));
    const redo: string[] = [];
    for (const num of nums) {
      const c = creatives[num - 1];
      const extra = decodeAdCopy(c.generationPrompt);
      const copy: AdImageCopy = { headline: c.headline, description: c.description, cta: c.cta, imageScene: extra.imageScene ?? "n/a", ...extra };
      const current = LOOKS.find((l) => l.key === c.formatKey);
      // A different family than the current look when possible, unused in the batch, that the copy can fill.
      const options = LOOKS.filter((l) => !usedLooks.has(l.key) && l.family !== "code" && copyFitsLook(l, copy));
      const pool = options.filter((l) => l.family !== current?.family);
      const next: AdLook | undefined = (pool.length ? pool : options)[Math.floor(Math.random() * (pool.length ? pool : options).length)];
      if (!next) continue;
      usedLooks.add(next.key);
      await prisma.adLabCreative.update({
        where: { id: c.id },
        data: {
          formatKey: next.key,
          generationPrompt: buildAdImagePrompt(next.key, { ...copy, lookVariant: randomVariant(groupKey) }, groupKey),
          imageUrl: null,
          storyImageUrl: null,
        },
      });
      // Keep the angle's "| format:" tag (read by the learning loop) in step.
      const angle = await prisma.adLabAngle.findUnique({ where: { id: c.angleId }, select: { researchNotes: true } });
      if (angle?.researchNotes) {
        await prisma.adLabAngle.update({
          where: { id: c.angleId },
          data: { researchNotes: angle.researchNotes.replace(/\| format: [^|]+/, `| format: ${next.key} `) },
        });
      }
      redo.push(c.id);
    }
    return { redo, verdict, note: `redo ${redo.length}: tiles ${nums.join(", ")}` };
  } catch (err) {
    console.warn("[adlab-variety] check failed — batch ships as is:", err instanceof Error ? err.message : err);
    return { redo: [], verdict: null, note: `check failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200) };
  }
}
