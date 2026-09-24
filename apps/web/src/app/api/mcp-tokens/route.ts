/**
 * GET  /api/mcp-tokens   — list the signed-in user's MCP access tokens.
 * POST /api/mcp-tokens   — mint a new one (Pro-gated). Returns the plaintext
 *                          token EXACTLY ONCE; it is never retrievable again.
 *
 * These manage the credentials for the Ripple MCP server (/api/mcp). Auth is
 * the user's own session (web cookie or mobile bearer). Creation requires an
 * active entitlement — the AI/MCP surface is Pro. Listing and revoking are
 * NOT gated: a lapsed user must always be able to see and kill their tokens.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAnySessionUserId } from "@/lib/mobile-auth";
import { listMcpTokens, mintMcpToken } from "@/lib/mcp-token";
import { requireEntitlement } from "@/lib/paywall";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cap on simultaneously-active (non-revoked) tokens per user. */
const MAX_ACTIVE_TOKENS = 10;

const CreateSchema = z.object({
  name: z.string().trim().max(80).optional(),
});

export async function GET(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const tokens = await listMcpTokens(userId);
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const userId = await getAnySessionUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pro gate — same flag as the AI pipeline / MCP request path.
  const gate = await requireEntitlement("canExtractEntries", userId);
  if (!gate.ok) return gate.response;

  const parsed = CreateSchema.safeParse(
    (await req.json().catch(() => ({}))) as unknown
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", detail: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const activeCount = await prisma.mcpAccessToken.count({
    where: { userId, revokedAt: null },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS) {
    return NextResponse.json(
      {
        error: "TooManyTokens",
        message: `You can have at most ${MAX_ACTIVE_TOKENS} active tokens. Revoke one first.`,
      },
      { status: 409 }
    );
  }

  const minted = await mintMcpToken(userId, parsed.data.name);
  // The plaintext is returned here and NOWHERE else, ever.
  return NextResponse.json(
    {
      token: minted.plaintext,
      id: minted.id,
      prefix: minted.prefix,
    },
    { status: 201 }
  );
}
