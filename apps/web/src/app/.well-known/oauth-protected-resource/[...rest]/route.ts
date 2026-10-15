import { METADATA_HEADERS, protectedResourceMetadata } from "@/lib/mcp-oauth/metadata";

export const dynamic = "force-dynamic";

/**
 * Path-suffixed form (/.well-known/oauth-protected-resource/api/mcp) that
 * clients probe when a 401 carries no resource_metadata pointer. Same doc.
 */
export function GET() {
  return new Response(JSON.stringify(protectedResourceMetadata()), { headers: METADATA_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_HEADERS });
}
