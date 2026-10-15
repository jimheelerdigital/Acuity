/**
 * POST /api/oauth/token — OAuth 2.1 token endpoint for "Sign in with Ripple".
 *
 * grant_type=authorization_code (PKCE S256, single-use code) and
 * grant_type=refresh_token (rotating). Accepts
 * application/x-www-form-urlencoded (what Claude sends, RFC 6749 §4.1.3) and
 * JSON. Public clients: no client secret.
 */

import { NextResponse, type NextRequest } from "next/server";

import { exchangeAuthCode, refreshAccessToken } from "@/lib/mcp-oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  const raw = await req.text();
  if (raw.length > 16 * 1024) return new URLSearchParams();
  if (type.includes("application/json")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(obj)) if (typeof v === "string") p.set(k, v);
      return p;
    } catch {
      return new URLSearchParams();
    }
  }
  return new URLSearchParams(raw);
}

export async function POST(req: NextRequest) {
  const p = await readParams(req);
  const grant = p.get("grant_type");

  const result =
    grant === "authorization_code"
      ? await exchangeAuthCode({
          code: p.get("code"),
          clientId: p.get("client_id"),
          redirectUri: p.get("redirect_uri"),
          codeVerifier: p.get("code_verifier"),
          resource: p.get("resource"),
        })
      : grant === "refresh_token"
        ? await refreshAccessToken({
            refreshToken: p.get("refresh_token"),
            clientId: p.get("client_id"),
          })
        : ({
            ok: false,
            status: 400,
            error: "unsupported_grant_type",
            description: "Use authorization_code or refresh_token.",
          } as const);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, error_description: result.description },
      { status: result.status, headers: HEADERS }
    );
  }
  return NextResponse.json(result.body, { headers: HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
