import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getAuthOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Lanes-as-data admin API (2026-09-15, co-pilot lane system).
 * The kill/birth lever behind the Sunday intelligence report: Keenan
 * decides, these endpoints execute — no deploy either way.
 *
 * GET   — list every lane with 45-day post/engagement counts.
 * POST  — birth a lane: { key, name, brand, hoursUtc, spec } (template
 *         "moody"; spec is validated by parseMoodyLaneSpec).
 * PATCH — update a lane: { key, status?, hoursUtc?, name?, spec? }.
 *         status RETIRED = kill (sets retiredAt); back to ACTIVE or
 *         TESTING = revival (clears it).
 */

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(getAuthOptions());
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!me?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

const VALID_STATUS = ["TESTING", "ACTIVE", "RETIRED"] as const;

function parseHours(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const hours = raw
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  return hours.length === raw.length ? [...new Set(hours)].sort() : null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const lanes = await prisma.contentLane.findMany({
    orderBy: [{ status: "asc" }, { key: "asc" }],
  });
  // 45-day post counts per lane (matches the performance.ts window).
  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 86_400_000);
  const counts = await prisma.carouselPost.groupBy({
    by: ["lane"],
    where: { generatedFor: { gte: fortyFiveDaysAgo }, lane: { not: null } },
    _count: { _all: true },
  });
  const countByLane = new Map(counts.map((c) => [c.lane, c._count._all]));
  return NextResponse.json({
    lanes: lanes.map((l) => ({
      ...l,
      recentPosts: countByLane.get(l.key) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await req.json()) as {
    key?: string;
    name?: string;
    brand?: string;
    hoursUtc?: unknown;
    spec?: unknown;
    origin?: string;
  };

  const key = (body.key ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(key)) {
    return NextResponse.json(
      { error: "key must be 3-41 chars of lowercase letters/digits/hyphens" },
      { status: 400 }
    );
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const brand = body.brand === "bwk" ? "bwk" : "ripple";
  const hoursUtc = parseHours(body.hoursUtc);
  if (!hoursUtc) {
    return NextResponse.json(
      { error: "hoursUtc must be a non-empty array of UTC hours (0-23)" },
      { status: 400 }
    );
  }
  const { parseMoodyLaneSpec } = await import(
    "@/lib/content-factory/moody-carousel"
  );
  const spec = parseMoodyLaneSpec(body.spec);
  if (!spec) {
    return NextResponse.json(
      {
        error:
          "spec must be { audience: 'men'|'women', theme: string (the locked lane theme, 40+ chars), named: boolean, minItems?, maxItems? }",
      },
      { status: 400 }
    );
  }
  if (spec.audience === "men" && brand !== "bwk") {
    return NextResponse.json(
      { error: "men-audience lanes must be brand 'bwk' (never Ripple's pages)" },
      { status: 400 }
    );
  }

  const existing = await prisma.contentLane.findUnique({ where: { key } });
  if (existing) {
    return NextResponse.json(
      { error: `lane "${key}" already exists (status ${existing.status})` },
      { status: 409 }
    );
  }
  const lane = await prisma.contentLane.create({
    data: {
      key,
      name: body.name.trim(),
      brand,
      status: "TESTING",
      template: "moody",
      hoursUtc,
      spec: spec as object,
      origin: body.origin?.trim() || null,
    },
  });
  return NextResponse.json({ lane });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await req.json()) as {
    key?: string;
    status?: string;
    hoursUtc?: unknown;
    name?: string;
    spec?: unknown;
  };
  const key = (body.key ?? "").trim();
  const lane = await prisma.contentLane.findUnique({ where: { key } });
  if (!lane) {
    return NextResponse.json({ error: `lane "${key}" not found` }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status as (typeof VALID_STATUS)[number])) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUS.join(", ")}` },
        { status: 400 }
      );
    }
    data.status = body.status;
    data.retiredAt = body.status === "RETIRED" ? new Date() : null;
  }
  if (body.hoursUtc !== undefined) {
    const hoursUtc = parseHours(body.hoursUtc);
    if (!hoursUtc) {
      return NextResponse.json(
        { error: "hoursUtc must be a non-empty array of UTC hours (0-23)" },
        { status: 400 }
      );
    }
    data.hoursUtc = hoursUtc;
  }
  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    }
    data.name = body.name.trim();
  }
  if (body.spec !== undefined) {
    if (lane.template !== "moody") {
      return NextResponse.json(
        { error: `lane "${key}" is template "${lane.template}" — spec only applies to "moody" lanes` },
        { status: 400 }
      );
    }
    const { parseMoodyLaneSpec } = await import(
      "@/lib/content-factory/moody-carousel"
    );
    const spec = parseMoodyLaneSpec(body.spec);
    if (!spec) {
      return NextResponse.json({ error: "unusable spec" }, { status: 400 });
    }
    data.spec = spec as object;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await prisma.contentLane.update({ where: { key }, data });
  return NextResponse.json({ lane: updated });
}
