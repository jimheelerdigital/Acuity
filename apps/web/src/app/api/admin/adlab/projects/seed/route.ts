/**
 * POST /api/admin/adlab/projects/seed — create the initial Acuity project
 * Safe to call multiple times — skips if slug "acuity" already exists.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const existing = await prisma.adLabProject.findUnique({
    where: { slug: "acuity" },
  });

  if (existing) {
    return NextResponse.json({ message: "Acuity project already exists", id: existing.id });
  }

  const project = await prisma.adLabProject.create({
    data: {
      name: "Acuity",
      slug: "acuity",
      brandVoiceGuide: `Direct, specific, zero-fluff. Smart friend explaining, not marketing blog.
Short paragraphs (max 2 sentences). Tight. Every sentence earns its place.
Specifics over abstractions.
No fabricated stats — cite real sources or frame qualitatively.
Acuity is a shutdown ritual, not a journal. Never use "journaling" in acquisition copy.
The hero conversion driver is the weekly report, not the daily recording.
Under-claim the AI. Never say "AI-powered" above the fold.
Use the customer's exact language — if it can't be found in a Reddit thread, it doesn't belong.
Show artifacts (the weekly report, the memoir PDF), not mechanisms.`,
      targetAudience: {
        ageMin: 25,
        ageMax: 55,
        geo: ["US", "CA", "GB", "AU"],
        interests: [
          "productivity",
          "self-improvement",
          "mental health",
          "journaling",
          "meditation",
          "goal setting",
        ],
        painPoints: [
          "forgets tasks discussed on calls",
          "no self-awareness about recurring patterns",
          "tried journaling but couldn't stick with it",
          "overwhelmed by unprocessed thoughts at end of day",
          "doesn't know what they actually spend time worrying about",
        ],
        desires: [
          "weekly clarity on what happened and what matters",
          "automatic task capture without typing",
          "evidence-based self-awareness over time",
          "a ritual that takes 60 seconds, not 20 minutes",
          "proof they're making progress on goals",
        ],
        identityMarkers: [
          "founders",
          "entrepreneurs",
          "knowledge workers",
          "remote workers",
          "ADHD",
          "overthinkers",
          "therapists",
          "creatives",
        ],
      },
      usps: [
        "60-second voice entry pulls out tasks and tracks goals automatically",
        "Weekly report every Sunday: 400-word narrative of your week",
        "Life Matrix: 6 life domains tracked over time",
        "Monthly memoir PDF — your life, documented",
        "Brain dump any time of day — no typing required",
      ],
      bannedPhrases: [
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
      ],
      imageStylePrompt:
        "Abstract, editorial photography style. Moody lighting, muted purple and indigo tones on dark background. Minimal composition, high contrast. No text, no logos, no faces. Evokes calm introspection and clarity.",
      logoUrl: "https://getacuity.io/AcuityLogo.png",
      targetCplCents: 500, // $5.00
      dailyBudgetCentsPerVariant: 1000, // $10.00
      testDurationDays: 14,
      metaAdAccountId: "", // To be filled
      metaPixelId: "", // To be filled
      conversionEvent: "Lead",
      conversionObjective: "OUTCOME_LEADS",
      videoEnabled: false,
    },
  });

  return NextResponse.json({ message: "Acuity project seeded", id: project.id }, { status: 201 });
}
