import { METADATA_HEADERS, authorizationServerMetadata } from "@/lib/mcp-oauth/metadata";

export const dynamic = "force-dynamic";

/** RFC 8414 authorization server metadata ("Sign in with Ripple"). */
export function GET() {
  return new Response(JSON.stringify(authorizationServerMetadata()), { headers: METADATA_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_HEADERS });
}
