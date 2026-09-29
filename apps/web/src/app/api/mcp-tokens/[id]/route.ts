/**
 * DELETE /api/mcp-tokens/[id] — revoke one of the signed-in user's MCP
 * tokens. Scoped to the caller, so a user can only revoke their own.
 *
 * Deliberately NOT Pro-gated: revoking a credential is a safety action that
 * must always be available, even to a lapsed user.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { revokeMcpToken } from "@/lib/mcp-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokenId = params.id;
  if (!tokenId) {
    return NextResponse.json({ error: "Missing token id" }, { status: 400 });
  }

  const revoked = await revokeMcpToken(userId, tokenId);
  if (!revoked) {
    // Wrong owner, unknown id, or already revoked — all indistinguishable to
    // the caller on purpose (no token-existence oracle across users).
    return NextResponse.json(
      { error: "NotFound", message: "No active token to revoke." },
      { status: 404 }
    );
  }

  return NextResponse.json({ revoked: true });
}
