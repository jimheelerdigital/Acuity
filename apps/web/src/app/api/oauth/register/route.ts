/**
 * POST /api/oauth/register — RFC 7591 Dynamic Client Registration.
 *
 * Claude ("Register automatically") and other MCP clients register here
 * before sending the user to /oauth/authorize. Public clients only (no
 * secret); PKCE S256 is enforced at the authorize + token steps.
 */

import { NextResponse, type NextRequest } from "next/server";

import { registerDcrClient } from "@/lib/mcp-oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 16 * 1024) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Registration body too large." },
      { status: 400, headers: CORS }
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      { status: 400, headers: CORS }
    );
  }
  const result = await registerDcrClient(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, error_description: result.description },
      { status: 400, headers: CORS }
    );
  }
  return NextResponse.json(
    {
      client_id: result.client.clientId,
      client_id_issued_at: result.issuedAt,
      client_name: result.client.clientName ?? undefined,
      redirect_uris: result.client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201, headers: { ...CORS, "Cache-Control": "no-store" } }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}
