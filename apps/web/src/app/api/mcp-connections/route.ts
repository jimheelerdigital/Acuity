/**
 * GET /api/mcp-connections — the signed-in user's connected AI apps (Claude
 * and other clients that connected through "Sign in with Ripple").
 * Not Pro-gated: a lapsed user must always see and be able to disconnect.
 */

import { NextResponse, type NextRequest } from "next/server";

import { listConnections } from "@/lib/mcp-oauth/server";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connections = await listConnections(userId);
  return NextResponse.json({ connections });
}
