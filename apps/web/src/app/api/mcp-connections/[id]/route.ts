/**
 * DELETE /api/mcp-connections/[id] — disconnect one of the user's connected
 * AI apps. Stops token refresh and kills its access tokens immediately.
 * Scoped to the caller; not Pro-gated (safety action).
 */

import { NextResponse, type NextRequest } from "next/server";

import { revokeConnection } from "@/lib/mcp-oauth/server";
import { getAnySessionUserId } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getAnySessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!params.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const ok = await revokeConnection(userId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "NotFound", message: "No active connection." }, { status: 404 });
  }
  return NextResponse.json({ revoked: true });
}
