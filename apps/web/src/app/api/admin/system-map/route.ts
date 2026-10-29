/**
 * GET /api/admin/system-map — the codebase map behind /admin/system-map.
 * The JSON is built from the repo by scripts/build-system-map.ts (runs on
 * every web build), so this just serves it. Admin-only: it lists every
 * file, table and outside service we use.
 */
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const map = (await import("@/data/system-map.json")).default;
  return NextResponse.json(map, {
    headers: { "Cache-Control": "private, max-age=300" },
  });
}
