import { createHash } from "crypto";
import { describe, expect, it } from "vitest";

import {
  MCP_SCOPE,
  buildClientRedirect,
  isAllowedRedirectUri,
  isCimdClientId,
  isFetchableMetadataHost,
  mcpResourceUrl,
  oauthIssuer,
  parseAuthorizeRequest,
  redirectUriMatches,
  signConsentTicket,
  verifyConsentTicket,
  verifyPkceS256,
} from "./core";

const RESOURCE = "https://goripple.io/api/mcp";
const verifier = "a".repeat(43) + "-._~xyz";
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("issuer / resource", () => {
  it("derives from env without a trailing slash", () => {
    expect(oauthIssuer({ NEXTAUTH_URL: "https://goripple.io/" })).toBe("https://goripple.io");
    expect(oauthIssuer({ OAUTH_ISSUER: "https://p.vercel.app", NEXTAUTH_URL: "https://goripple.io" })).toBe("https://p.vercel.app");
    expect(mcpResourceUrl({})).toBe(RESOURCE);
  });
});

describe("redirect URIs", () => {
  it("allows https, loopback http and app schemes only", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:3118/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1/callback")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("data:text/html,hi")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });

  it("matches exactly, or loopback on any port", () => {
    const reg = ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback"];
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback/x")).toBe(false);
    expect(redirectUriMatches(reg, "http://localhost:51234/callback")).toBe(true);
    expect(redirectUriMatches(reg, "http://localhost:51234/other")).toBe(false);
    expect(redirectUriMatches(reg, "http://127.0.0.1:51234/callback")).toBe(false);
  });
});

describe("PKCE S256", () => {
  it("verifies the matching verifier only", () => {
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256("b".repeat(50), challenge)).toBe(false);
    expect(verifyPkceS256("short", challenge)).toBe(false);
    expect(verifyPkceS256(null, challenge)).toBe(false);
  });
});

function q(extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: "code",
    client_id: "rpl_client_x",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "s1",
    ...extra,
  });
}

describe("parseAuthorizeRequest", () => {
  it("accepts a well-formed request and pins the scope", () => {
    const r = parseAuthorizeRequest(q({ scope: "everything", resource: RESOURCE + "/" }), RESOURCE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.params.scope).toBe(MCP_SCOPE);
  });
  it("never redirects for a bad redirect_uri", () => {
    const r = parseAuthorizeRequest(q({ redirect_uri: "http://evil.com/cb" }), RESOURCE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.redirectable).toBe(false);
  });
  it("requires PKCE S256", () => {
    const r = parseAuthorizeRequest(q({ code_challenge_method: "plain" }), RESOURCE);
    expect(!r.ok && r.redirectable && r.error).toBe("invalid_request");
  });
  it("rejects a foreign resource", () => {
    const r = parseAuthorizeRequest(q({ resource: "https://other.example/mcp" }), RESOURCE);
    expect(!r.ok && r.redirectable && r.error).toBe("invalid_target");
  });
  it("rejects other response types", () => {
    const r = parseAuthorizeRequest(q({ response_type: "token" }), RESOURCE);
    expect(!r.ok && r.redirectable && r.error).toBe("unsupported_response_type");
  });
});

describe("consent ticket", () => {
  const params = {
    clientId: "c",
    redirectUri: "https://claude.ai/api/mcp/auth_callback",
    codeChallenge: challenge,
    state: "s",
    scope: MCP_SCOPE,
    resource: null,
    userId: "u1",
  };
  it("round-trips and binds the user", () => {
    const t = signConsentTicket(params, "secret", 1000);
    expect(verifyConsentTicket(t, "secret", 2000)).toEqual(params);
  });
  it("rejects tampering, wrong secret and expiry", () => {
    const t = signConsentTicket(params, "secret", 1000);
    const [body, mac] = t.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...params, userId: "attacker", exp: 9e15 })
    ).toString("base64url");
    expect(verifyConsentTicket(`${forged}.${mac}`, "secret", 2000)).toBeNull();
    expect(verifyConsentTicket(`${body}.${mac}`, "other", 2000)).toBeNull();
    expect(verifyConsentTicket(t, "secret", 1000 + 16 * 60 * 1000)).toBeNull();
  });
});

describe("client redirect + CIMD guards", () => {
  it("appends params and keeps existing query", () => {
    expect(buildClientRedirect("https://a.b/cb?x=1", { code: "c", state: null, iss: "https://goripple.io" })).toBe(
      "https://a.b/cb?x=1&code=c&iss=https%3A%2F%2Fgoripple.io"
    );
  });
  it("only treats https URLs with a path as metadata documents", () => {
    expect(isCimdClientId("https://claude.ai/oauth/claude-code-client-metadata")).toBe(true);
    expect(isCimdClientId("rpl_client_abc")).toBe(false);
    expect(isCimdClientId("https://claude.ai")).toBe(false);
  });
  it("refuses internal hosts and IP literals", () => {
    expect(isFetchableMetadataHost("claude.ai")).toBe(true);
    expect(isFetchableMetadataHost("localhost")).toBe(false);
    expect(isFetchableMetadataHost("169.254.169.254")).toBe(false);
    expect(isFetchableMetadataHost("[::1]")).toBe(false);
    expect(isFetchableMetadataHost("metadata.internal")).toBe(false);
  });
});
