/**
 * Shared landing page generation logic for AdLab experiments.
 * Used by both the landing-page API route and the launch route (auto-generation).
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Generate and save a landing page for an experiment.
 * Returns the existing landing page if one already exists (idempotent).
 */
export async function generateLandingPage(experimentId: string) {
  // Load experiment with angles and creatives for context
  const experiment = await prisma.adLabExperiment.findUnique({
    where: { id: experimentId },
    include: {
      angles: { include: { creatives: true } },
      landingPage: true,
    },
  });

  if (!experiment) {
    throw new Error("Experiment not found");
  }

  // Return existing if already generated (idempotent)
  if (experiment.landingPage) {
    return experiment.landingPage;
  }

  // Gather context for AI generation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const advancedAngles = experiment.angles.filter((a: any) => a.advanced);
  const primaryAngle = advancedAngles[0] ?? experiment.angles[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sampleCreatives = primaryAngle?.creatives?.slice(0, 3) ?? [];

  const creativeContext = sampleCreatives
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((c: any) => `Headline: ${c.headline}\nPrimary text: ${c.primaryText}`)
    .join("\n---\n");

  const prompt = `You are a conversion copywriter for Acuity, an AI voice journal app. Your job is to create a landing page that matches the emotional angle of a specific ad campaign.

Brand voice rules:
- Warm, observational, inclusive. Use "daily debrief" not "brain dump". Never use "journaling" in acquisition copy — say "shutdown ritual" or "daily debrief".
- Under-claim the AI. Show artifacts (weekly report, tasks extracted), not mechanisms ("AI-powered pattern detection").
- The hero conversion driver is the weekly report — a 400-word narrative delivered every Sunday.
- Use the customer's exact language — if the phrase can't be found in a Reddit thread, it doesn't belong.

Copy quality rules:
- Headlines: punchy, 8 words or fewer. Hit the emotional nerve from the topic brief. Not generic — a stranger should be able to guess which ad this page belongs to.
- Subheadlines: one concrete sentence that makes the product benefit tangible. Include a number, a time, or a specific artifact.
- Pain points: written in second person ("You..."). Uncomfortably specific — not generic marketing speak. Each one should make the reader think "how do they know that about me?"
- Value props: each starts with a concrete action verb and ends with a specific outcome. No vague "improve your life" language.
- Testimonial: sounds like a real person, not a copywriter. Include a specific detail (a number, a day of the week, a feature name like "the weekly report" or "the task list").
- Closing headline: the emotional closer above the final CTA. Should feel like a warm, direct challenge — not a sales pitch.

Context:
Topic brief: ${experiment.topicBrief}
${primaryAngle ? `Primary angle hypothesis: ${primaryAngle.hypothesis}\nTarget persona: ${primaryAngle.targetPersona}\nValue surface: ${primaryAngle.valueSurface}` : ""}
${creativeContext ? `Sample ad creatives:\n${creativeContext}` : ""}

Generate a landing page with these exact JSON fields:
{
  "heroHeadline": "punchy headline, max 8 words, hits the emotional nerve",
  "heroSubheadline": "one concrete sentence with a number or specific artifact",
  "painPoints": ["3-4 second-person bullets that feel uncomfortably specific"],
  "valuePropHeadline": "transition headline like 'Here's what changes' or 'What if you could...'",
  "valueProps": ["3-4 benefits starting with action verbs, ending with specific outcomes"],
  "testimonialQuote": "realistic testimonial with a specific detail (number, day, feature name)",
  "testimonialName": "First name + last initial",
  "ctaText": "Start Free Trial — 30 Days Free",
  "closingHeadline": "emotional closer — warm direct challenge, not a sales pitch",
  "metaTitle": "SEO title — angle keyword + Acuity (max 60 chars)",
  "metaDescription": "SEO description (max 155 chars) — problem + solution + CTA"
}

Return ONLY valid JSON, no markdown fences.`;

  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let generated: Record<string, any>;
  try {
    generated = JSON.parse(text);
  } catch {
    throw new Error(`AI generation failed — invalid JSON: ${text.slice(0, 200)}`);
  }

  // Generate a unique slug from the experiment campaign name or headline
  const baseSlug = slugify(
    experiment.campaignName || generated.heroHeadline || experimentId
  );
  const slug = `${baseSlug}-${experimentId.slice(-6)}`;

  const landingPage = await prisma.adLabLandingPage.create({
    data: {
      experimentId,
      slug,
      heroHeadline: generated.heroHeadline ?? "One minute a day. A life of clarity.",
      heroSubheadline: generated.heroSubheadline ?? "",
      painPoints: generated.painPoints ?? [],
      valuePropHeadline: generated.valuePropHeadline ?? "Here's what changes",
      valueProps: generated.valueProps ?? [],
      testimonialQuote: generated.testimonialQuote ?? null,
      testimonialName: generated.testimonialName ?? null,
      ctaText: generated.ctaText ?? "Start Free Trial — 30 Days Free",
      closingHeadline: generated.closingHeadline ?? null,
      metaTitle: generated.metaTitle ?? "Acuity — Start Your Free Trial",
      metaDescription: generated.metaDescription ?? "The AI voice journal that turns your daily debrief into action.",
    },
  });

  return landingPage;
}
