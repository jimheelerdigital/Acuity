/**
 * GET /api/account/life-dimensions
 *   → { dimensions, preset }
 *
 * PUT /api/account/life-dimensions
 *   Body: { preset: "DEFAULT"|"STUDENT"|"PARENT"|"CUSTOM",
 *           dimensions?: Array<{ area, label, description?, color?, icon?, sortOrder?, isActive? }> }
 *
 * Applies a preset (overwrites the user's 6 rows) OR CUSTOM (the
 * client must include a full `dimensions` array). See
 * LIFE_DIMENSION_PRESETS below for the template labels.
 *
 * The extraction pipeline still speaks the 6 canonical LIFE_AREAS
 * (CAREER|HEALTH|...). This endpoint only drives the display layer
 * of the Life Matrix + insights UI.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { enforceUserRateLimit } from "@/lib/rate-limit";
import {
  LIFE_DIMENSION_PRESETS,
  LIFE_DIMENSION_PRESET_NAMES,
  type LifeDimensionRow,
} from "@/lib/life-dimension-presets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CANONICAL_AREAS = [
  "CAREER",
  "HEALTH",
  "RELATIONSHIPS",
  "FINANCES",
  "PERSONAL",
  "OTHER",
] as const;

const DimensionInput = z.object({
  area: z.enum(CANONICAL_AREAS),
  label: z.string().min(1).max(40),
  description: z.string().max(200).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  icon: z.string().max(32).nullable().optional(),
  sortOrder: z.number().int().min(0).max(20).optional(),
  isActive: z.boolean().optional(),
});

const PutBody = z.object({
  preset: z.enum(LIFE_DIMENSION_PRESET_NAMES),
  dimensions: z.array(DimensionInput).max(6).optional(),
});

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { prisma } = await import("@/lib/prisma");
  const [rows, user] = await Promise.all([
    prisma.userLifeDimension.findMany({
      where: { userId },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { lifeDimensionPreset: true },
    }),
  ]);

  return NextResponse.json({
    preset: user?.lifeDimensionPreset ?? null,
    dimensions: rows,
  });
}

export async function PUT(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await enforceUserRateLimit("userWrite", userId);
  if (limited) return limited;

  const parse = PutBody.safeParse(await req.json().catch(() => null));
  if (!parse.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parse.error.issues },
      { status: 400 }
    );
  }
  const { preset, dimensions } = parse.data;

  const rows: LifeDimensionRow[] | undefined =
    preset === "CUSTOM"
      ? dimensions
      : LIFE_DIMENSION_PRESETS[preset];

  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "CUSTOM preset requires a dimensions array." },
      { status: 400 }
    );
  }

  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.area)) {
      return NextResponse.json(
        { error: `Duplicate area: ${row.area}` },
        { status: 400 }
      );
    }
    seen.add(row.area);
  }

  const { prisma } = await import("@/lib/prisma");

  await prisma.$transaction([
    prisma.userLifeDimension.deleteMany({ where: { userId } }),
    prisma.userLifeDimension.createMany({
      data: rows.map((r, i) => ({
        userId,
        area: r.area,
        label: r.label,
        description: r.description ?? null,
        color: r.color ?? null,
        icon: r.icon ?? null,
        sortOrder: r.sortOrder ?? i,
        isActive: r.isActive ?? true,
      })),
    }),
    prisma.user.update({
      where: { id: userId },
      data: { lifeDimensionPreset: preset },
    }),
  ]);

  const fresh = await prisma.userLifeDimension.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ ok: true, preset, dimensions: fresh });
}
