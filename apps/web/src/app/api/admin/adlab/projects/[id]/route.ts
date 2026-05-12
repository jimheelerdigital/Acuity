/**
 * GET    /api/admin/adlab/projects/[id] — get project detail
 * PUT    /api/admin/adlab/projects/[id] — update project
 * DELETE /api/admin/adlab/projects/[id] — delete project
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  brandVoiceGuide: z.string().optional(),
  targetAudience: z.object({
    ageMin: z.number().min(13).max(65),
    ageMax: z.number().min(18).max(65),
    geo: z.array(z.string()).transform((codes) =>
      codes.map((c) => {
        const u = c.toUpperCase();
        const fixes: Record<string, string> = { UK: "GB", EN: "GB" };
        return fixes[u] || u;
      })
    ),
    interests: z.array(z.string()),
    painPoints: z.array(z.string()),
    desires: z.array(z.string()),
    identityMarkers: z.array(z.string()),
  }).optional(),
  usps: z.array(z.string()).optional(),
  bannedPhrases: z.array(z.string()).optional(),
  imageStylePrompt: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  targetCplCents: z.number().int().min(0).optional(),
  dailyBudgetCentsPerVariant: z.number().int().min(0).optional(),
  testDurationDays: z.number().int().min(1).optional(),
  metaAdAccountId: z.string().optional(),
  metaPixelId: z.string().optional(),
  conversionEvent: z.string().optional(),
  conversionObjective: z.string().optional(),
  landingPageUrl: z.string().url().nullable().optional(),
  metaPageId: z.string().nullable().optional(),
  targetInterests: z.array(z.object({ id: z.string(), name: z.string() })).nullable().optional(),
  imageEnabled: z.boolean().optional(),
  videoEnabled: z.boolean().optional(),
});

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const project = await prisma.adLabProject.findUnique({
    where: { id: params.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json();
  const parsed = UpdateProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Check slug uniqueness if changing
  if (parsed.data.slug) {
    const existing = await prisma.adLabProject.findFirst({
      where: { slug: parsed.data.slug, NOT: { id: params.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      );
    }
  }

  const project = await prisma.adLabProject.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return NextResponse.json(project);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  await prisma.adLabProject.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
