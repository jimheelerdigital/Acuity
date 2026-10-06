/**
 * Where a slide's title goes (2026-10-06, per Keenan: "i love the helm post
 * but the wording blocks the actual helm... look for these kinds of things to
 * move the text based on the image and what we're trying to show").
 *
 * The text sits in one of two bands inside the IG/FB 4:5 safe area: TOP
 * (rows ~330 down) or BOTTOM (ending at row ~1590). VISION_MODEL looks at the
 * image and picks the band that covers less of what matters: the face, head,
 * helm, eyes, or the weapon or item the slide is about. Fails open to top
 * (the previous fixed placement).
 */
export type TextPlace = "top" | "bottom";

export async function chooseTextPlacement(image: Buffer, subject: string): Promise<TextPlace> {
  try {
    const { default: sharp } = await import("sharp");
    const small = await sharp(image).resize({ width: 512 }).jpeg({ quality: 80 }).toBuffer();
    const { contentAnthropic, VISION_MODEL, lastJsonText } = await import("./claude-client");
    const response = await contentAnthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 120,
      effort: "low",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: small.toString("base64") } },
            {
              type: "text",
              text: `This vertical image gets a 1-3 line title in big white letters, placed either in the TOP band (about 17% to 32% down from the top) or the BOTTOM band (about 68% to 83% down). The slide is about: ${subject}.
Which band covers LESS of what matters most in the picture: the face, head, helm or eyes, and the item the slide is about (armor, weapon, creature)? Covering empty sky, ground, fog or background is fine.
JSON only: {"band": "top" | "bottom"}`,
            },
          ],
        },
      ],
    });
    const text = response.content.map((b: { type: string; text?: string }) => (b.type === "text" ? b.text ?? "" : "")).join("");
    const band = (JSON.parse(lastJsonText(text)) as { band?: string }).band;
    return band === "bottom" ? "bottom" : "top";
  } catch (err) {
    console.warn("[text-placement] failed — top:", err instanceof Error ? err.message : err);
    return "top";
  }
}
