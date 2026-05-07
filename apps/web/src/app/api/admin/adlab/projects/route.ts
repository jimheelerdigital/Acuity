/**
 * GET  /api/admin/adlab/projects — list all projects
 * POST /api/admin/adlab/projects — create a new project
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  brandVoiceGuide: z.string().default(""),
  targetAudience: z.object({
    ageMin: z.number().min(13).max(65).default(25),
    ageMax: z.number().min(18).max(65).default(55),
    geo: z.array(z.string()).default([]),
    interests: z.array(z.string()).default([]),
    painPoints: z.array(z.string()).default([]),
    desires: z.array(z.string()).default([]),
    identityMarkers: z.array(z.string()).default([]),
  }).default({}),
  usps: z.array(z.string()).default([]),
  bannedPhrases: z.array(z.string()).default([]),
  imageStylePrompt: z.string().default(""),
  logoUrl: z.string().optional().nullable(),
  targetCplCents: z.number().int().min(0),
  dailyBudgetCentsPerVariant: z.number().int().min(0),
  testDurationDays: z.number().int().min(1).default(14),
  metaAdAccountId: z.string().optional().default(""),
  metaPixelId: z.string().optional().default(""),
  conversionEvent: z.string().optional().default(""),
  conversionObjective: z.string().default("OUTCOME_LEADS"),
  videoEnabled: z.boolean().default(false),
});

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const projects = await prisma.adLabProject.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      targetCplCents: true,
      dailyBudgetCentsPerVariant: true,
      createdAt: true,
    },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const parsed = CreateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existing = await prisma.adLabProject.findUnique({
    where: { slug: parsed.data.slug },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A project with this slug already exists" },
      { status: 409 }
    );
  }

  const project = await prisma.adLabProject.create({
    data: parsed.data,
  });

  return NextResponse.json(project, { status: 201 });
}
