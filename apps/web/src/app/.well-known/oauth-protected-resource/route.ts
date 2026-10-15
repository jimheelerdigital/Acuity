import { METADATA_HEADERS, protectedResourceMetadata } from "@/lib/mcp-oauth/metadata";

export const dynamic = "force-dynamic";

/** RFC 9728 protected resource metadata for /api/mcp. */
export function GET() {
  return new Response(JSON.stringify(protectedResourceMetadata()), { headers: METADATA_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: METADATA_HEADERS });
}
