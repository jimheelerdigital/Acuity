import { inngest } from "@/inngest/client";

/**
 * Legendary Mythicals paid portrait (2026-10-01, per Keenan): $12 one-off
 * Stripe Checkout on legendarymythicals.com. One run per paid session:
 * Claude writes the buyer's creature lore, gpt-image-2 (high) paints the
 * portrait, sharp composes a 1080x1920 lore card, both are uploaded to
 * content-factory/mythicals-site/portraits/<sessionId>/, and the buyer +
 * Keenan are emailed.
 *
 * Trigger: event "mythicals/portrait.order" with data.sessionId. Senders
 * (the /thanks page and the optional mythicals stripe-webhook) use event
 * id `mythicals-order-<sessionId>`, so Inngest dedupes repeat sends; the
 * order JSON's status is a second guard against double delivery.
 *
 * State lives in storage JSON (mythicals-site/orders/<sid>.json), no schema.
 */
export const mythicalsPortraitFn = inngest.createFunction(
  {
    id: "mythicals-portrait",
    name: "Mythicals — Paid Portrait",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "mythicals/portrait.order" }],
  },
  async ({ event, step, logger }) => {
    const sessionId: string = event.data?.sessionId ?? "";
    if (!sessionId.startsWith("cs_")) return { error: "bad sessionId" };

    // 1. Verify payment with Stripe and claim the order.
    const order = await step.run("claim-order", async () => {
      const { readOrder, writeOrder, logEvent } = await import("@/lib/mythicals/store");
      const existing = await readOrder(sessionId);
      if (existing?.status === "delivered") return { skip: true as const, order: existing };

      const { stripe } = await import("@/lib/stripe");
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (s.metadata?.brand !== "mythicals") throw new Error("not a mythicals session");
      if (s.payment_status !== "paid") throw new Error(`session not paid (${s.payment_status})`);

      const { isArchetypeSlug } = await import("@/lib/mythicals/archetypes");
      const slug = isArchetypeSlug(s.metadata.slug ?? "") ? s.metadata.slug! : "storm-dragon";
      const now = new Date().toISOString();
      const o = {
        sessionId,
        status: "generating" as const,
        email: s.customer_details?.email ?? s.customer_email ?? null,
        heroName: (s.metadata.heroName ?? "").slice(0, 40) || "Unnamed",
        element: (s.metadata.element ?? "").slice(0, 40),
        slug,
        answers: (s.metadata.answers ?? "")
          .split(",")
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < 4),
        amountCents: s.amount_total ?? null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await writeOrder(o);
      if (!existing) await logEvent("order_paid", { sessionId, slug, amountCents: o.amountCents });
      return { skip: false as const, order: o };
    });
    if (order.skip) return { skipped: "already delivered", sessionId };
    const o = order.order;

    try {
      // 2. Lore (Claude). Prod-only key; a fallback keeps delivery going.
      const lore = await step.run("write-lore", async () => {
        const { ARCHETYPES } = await import("@/lib/mythicals/archetypes");
        const a = ARCHETYPES[o.slug as keyof typeof ARCHETYPES];
        const fallback = {
          creatureName: `${o.heroName}, the ${a.name}`,
          title: a.title,
          powers: [...a.strengths],
          backstory: a.lore,
          scene: a.scene,
        };
        try {
          const { contentAnthropic, messageText, lastJsonText } = await import(
            "@/lib/content-factory/claude-client"
          );
          const { copyObjectives } = await import("@/lib/content-factory/copy-objectives");
          const res = await contentAnthropic.messages.create({
            max_tokens: 1200,
            effort: "medium",
            system: copyObjectives("mythicals"),
            messages: [
              {
                role: "user",
                content: `A buyer paid for a personal legendary creature portrait. Their quiz result is the ${a.name} (${a.title}): ${a.essence}
Hero name they gave: "${o.heroName}". Element or color they asked for: "${o.element || "none, choose what fits the creature"}".

Write THEIR creature: a unique individual of this kind, bonded to the hero name. Epic, never corny, no emojis, no modern slang, no em dashes.
Return JSON only:
{"creatureName": "a 1-3 word name for the creature itself, can echo the hero name", "title": "an epithet, max 6 words, e.g. Warden of the Ninth Storm", "powers": ["three powers, max 7 words each"], "backstory": "70-100 words of lore in second person (you), about the bond between the hero and this creature", "scene": "one vivid sentence describing the creature for a painter: body, colors (use the requested element/color), pose, setting, light"}`,
              },
            ],
          });
          const parsed = JSON.parse(lastJsonText(messageText(res)));
          if (!parsed.creatureName || !Array.isArray(parsed.powers) || !parsed.backstory || !parsed.scene) {
            throw new Error("lore JSON missing fields");
          }
          return {
            creatureName: String(parsed.creatureName).slice(0, 40),
            title: String(parsed.title ?? a.title).slice(0, 60),
            powers: parsed.powers.slice(0, 3).map((p: unknown) => String(p).slice(0, 70)),
            backstory: String(parsed.backstory).slice(0, 900),
            scene: String(parsed.scene).slice(0, 600),
          };
        } catch (err) {
          logger.warn(`[mythicals-portrait] lore fell back: ${err instanceof Error ? err.message : err}`);
          if (o.element) fallback.scene = `${a.scene} Its colors and aura are ${o.element}.`;
          return fallback;
        }
      });

      // 3. Portrait (gpt-image-2 high, 1024x1792).
      const portraitUrl = await step.run("paint-portrait", async () => {
        const { generateImage } = await import("@/lib/content-factory/carousel-generate");
        const { buildMythicImagePrompt } = await import("@/lib/content-factory/choice-lane");
        const { uploadAsset } = await import("@/lib/mythicals/store");
        const sharp = (await import("sharp")).default;
        const png = await generateImage(buildMythicImagePrompt(lore.scene, "cover"), "cover");
        const jpg = await sharp(png).jpeg({ quality: 92 }).toBuffer();
        return uploadAsset(`portraits/${sessionId}/portrait.jpg`, jpg, "image/jpeg");
      });

      // 4. Lore card (1080x1920).
      const cardUrl = await step.run("compose-card", async () => {
        const { composeLoreCard } = await import("@/lib/mythicals/lore-card");
        const { uploadAsset } = await import("@/lib/mythicals/store");
        const res = await fetch(portraitUrl);
        if (!res.ok) throw new Error(`portrait fetch ${res.status}`);
        const card = await composeLoreCard(Buffer.from(await res.arrayBuffer()), {
          heroName: o.heroName,
          ...lore,
        });
        return uploadAsset(`portraits/${sessionId}/lore-card.jpg`, card, "image/jpeg");
      });

      // 5. Email buyer + Keenan, mark delivered.
      await step.run("deliver", async () => {
        const { readOrder, writeOrder, logEvent } = await import("@/lib/mythicals/store");
        const { sendEmailOrThrow } = await import("@/lib/resend");
        const { portraitDeliveryEmail, orderNoticeEmail } = await import("@/lib/mythicals/emails");
        const current = await readOrder(sessionId);
        if (current?.status === "delivered") return;
        if (o.email) {
          await sendEmailOrThrow(
            portraitDeliveryEmail({ to: o.email, heroName: o.heroName, lore, portraitUrl, cardUrl })
          );
        }
        try {
          await sendEmailOrThrow(orderNoticeEmail({ order: o, portraitUrl, cardUrl, ok: true }));
        } catch (err) {
          logger.warn(`[mythicals-portrait] notice email failed: ${err instanceof Error ? err.message : err}`);
        }
        const { scene: _scene, ...storedLore } = lore;
        await writeOrder({
          ...o,
          status: "delivered",
          updatedAt: new Date().toISOString(),
          portraitUrl,
          cardUrl,
          lore: storedLore,
        });
        await logEvent("order_delivered", { sessionId, slug: o.slug });
      });

      return { delivered: true, sessionId, portraitUrl, cardUrl };
    } catch (err) {
      // A step exhausted its retries: record it and tell Keenan so he can
      // refund per the policy (or re-send the event after fixing).
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("record-failure", async () => {
        const { writeOrder } = await import("@/lib/mythicals/store");
        await writeOrder({ ...o, status: "failed", updatedAt: new Date().toISOString(), error: msg.slice(0, 500) });
        try {
          const { sendEmailOrThrow } = await import("@/lib/resend");
          const { orderNoticeEmail } = await import("@/lib/mythicals/emails");
          await sendEmailOrThrow(orderNoticeEmail({ order: o, ok: false, error: msg }));
        } catch {
          // best effort
        }
      });
      return { delivered: false, sessionId, error: msg };
    }
  }
);
