/**
 * GET /api/admin/adlab/review — data for the Sunday batch review screen.
 *
 * Returns, per audience group (women / men), the latest awaiting_approval
 * experiment on that group's project with all angles + creatives, so
 * Keenan can approve ads, set budget/destination, and launch.
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/prisma";
import { BATCH_GROUPS, type BatchGroupKey } from "@/lib/adlab/weekly-batch";
import { GROUP_DAILY_BUDGET_CENTS } from "@/lib/adlab/evergreen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const groups = await Promise.all(
    (Object.keys(BATCH_GROUPS) as BatchGroupKey[]).map(async (groupKey) => {
      const g = BATCH_GROUPS[groupKey];
      const project = await prisma.adLabProject.findUnique({
        where: { slug: g.projectSlug },
        select: { id: true, name: true, slug: true, dailyBudgetCentsPerVariant: true },
      });
      if (!project) {
        return { groupKey, projectName: g.projectName, experiment: null };
      }

      const experiment = await prisma.adLabExperiment.findFirst({
        where: { projectId: project.id, status: "awaiting_approval" },
        orderBy: { createdAt: "desc" },
        include: {
          angles: {
            include: {
              creatives: {
                select: {
                  id: true,
                  headline: true,
                  primaryText: true,
                  description: true,
                  cta: true,
                  imageUrl: true,
                  complianceStatus: true,
                  complianceNotes: true,
                  approved: true,
                },
              },
            },
            // AdLabAngle has no createdAt; cuid ids preserve insert order
            orderBy: { id: "asc" },
          },
        },
      });

      return {
        groupKey,
        projectName: project.name,
        projectSlug: project.slug,
        // Website launches go into the group's evergreen ad set, whose
        // budget is fixed in code (lib/adlab/evergreen.ts).
        defaultBudgetCents: GROUP_DAILY_BUDGET_CENTS[groupKey],
        evergreenBudgetCents: GROUP_DAILY_BUDGET_CENTS[groupKey],
        experiment,
      };
    })
  );

  return NextResponse.json({ groups });
}
