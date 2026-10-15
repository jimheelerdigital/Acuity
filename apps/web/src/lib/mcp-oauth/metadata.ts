/**
 * Discovery documents for "Sign in with Ripple" (MCP connectors).
 *   - Protected resource metadata (RFC 9728) — served at
 *     /.well-known/oauth-protected-resource (+ the path-suffixed variant);
 *     the MCP route's 401 points here.
 *   - Authorization server metadata (RFC 8414) —
 *     /.well-known/oauth-authorization-server.
 */

import { MCP_SCOPE, mcpResourceUrl, oauthIssuer } from "./core";

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [oauthIssuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Ripple journal",
    resource_documentation: `${oauthIssuer()}/account`,
  };
}

export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

export const METADATA_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};
