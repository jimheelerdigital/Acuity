/**
 * GET  /api/admin/adlab/experiments — list all experiments
 * POST /api/admin/adlab/experiments — create a new experiment
 */

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const experiments = await prisma.adLabExperiment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { name: true, slug: true } },
      _count: { select: { angles: true } },
    },
  });

  return NextResponse.json(experiments);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { projectId, topicBrief, campaignType } = await req.json();

  if (!projectId || !topicBrief?.trim()) {
    return NextResponse.json(
      { error: "projectId and topicBrief are required" },
      { status: 400 }
    );
  }

  const project = await prisma.adLabProject.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const experiment = await prisma.adLabExperiment.create({
    data: {
      projectId,
      topicBrief: topicBrief.trim(),
      campaignType: campaignType === "app_install" ? "app_install" : "website",
      status: "draft",
    },
  });

  return NextResponse.json(experiment, { status: 201 });
}
