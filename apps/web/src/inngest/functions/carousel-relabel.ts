import { inngest } from "@/inngest/client";

/**
 * RELABEL a built choice/pick post — event "content-factory/relabel.post"
 * (2026-10-06, per Keenan on the skull-helm post: "the wording blocks the
 * actual helm... reduce the text size on all slides that aren't cover
 * slides"). For every slide with a raw image (cover + options), the text is
 * re-placed where it covers the least of the subject (text-placement.ts) and
 * option labels use the smaller size; then the post video is rebuilt (the
 * finished Higgsfield clips are cached, so no new animation spend).
 * Triggered by the storage request `relabel-requests/<postId>.json`.
 */
export const carouselRelabelFn = inngest.createFunction(
  {
    id: "carousel-relabel",
    name: "Content Factory — Relabel Post",
    retries: 1,
    concurrency: { limit: 2 },
    triggers: [{ event: "content-factory/relabel.post" }],
  },
  async ({ event, step }) => {
    const { postId } = event.data as { postId: string };
    const slides = await step.run("load", async () => {
      const { prisma } = await import("@/lib/prisma");
      const post = await prisma.carouselPost.findUniqueOrThrow({
        where: { id: postId },
        select: {
          generatedFor: true,
          topicSlug: true,
          slides: { orderBy: { order: "asc" }, select: { id: true, order: true, kind: true, overlayText: true, rawImageUrl: true, imagePrompt: true } },
        },
      });
      return post.slides
        .filter((s) => s.rawImageUrl && s.overlayText.trim() && s.imagePrompt !== "choice-end-card")
        .map((s) => ({ ...s, date: post.generatedFor.toISOString().slice(0, 10), slug: post.topicSlug }));
    });

    const placed: Record<string, string> = {};
    for (const s of slides) {
      placed[s.id] = await step.run(`relabel-${s.order}`, async () => {
        const { prisma } = await import("@/lib/prisma");
        const { renderChoiceOverlay } = await import("@/lib/content-factory/compose");
        const { uploadOverlaySlide } = await import("@/lib/content-factory/carousel-generate");
        const { chooseTextPlacement } = await import("@/lib/content-factory/text-placement");
        const res = await fetch(s.rawImageUrl!);
        if (!res.ok) throw new Error(`raw fetch failed (${res.status})`);
        const raw = Buffer.from(await res.arrayBuffer());
        const cover = s.kind === "COVER";
        const subject = (s.imagePrompt.split("\n")[0] ?? "").slice(0, 300);
        const place = await chooseTextPlacement(raw, `${s.overlayText}: ${subject}`);
        const overlay = await renderChoiceOverlay({ top: s.overlayText, topSize: cover ? 66 : 44, place });
        const { imageUrl, rawImageUrl } = await uploadOverlaySlide(
          raw,
          overlay,
          `carousels/${s.date}/${s.slug}/slide-${s.order}-relabel-${Date.now()}.jpg`
        );
        await prisma.carouselSlide.update({ where: { id: s.id }, data: { imageUrl, rawImageUrl } });
        return place;
      });
    }

    await step.run("rebuild-video", async () => {
      const { writeVideoMarker } = await import("@/lib/content-factory/post-video");
      await writeVideoMarker(postId, { status: "pending" });
      await inngest.send({ name: "content-factory/post-video.build", data: { postId } });
    });
    return { postId, placed };
  }
);
