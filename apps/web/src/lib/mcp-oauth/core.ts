/**
 * "Sign in with Ripple" for the Ripple MCP server — PURE helpers (no I/O).
 *
 * Claude (claude.ai, Desktop, mobile) connects to a remote MCP server only
 * through OAuth 2.1: the user pastes https://goripple.io/api/mcp, Claude
 * discovers our authorization server, registers itself (DCR) or identifies
 * itself with a Client ID Metadata Document (CIMD), sends the user to
 * /oauth/authorize, and exchanges the code (PKCE S256) for tokens.
 *
 * Kept free of Prisma / fetch so every security-relevant rule here is unit
 * tested: redirect-URI policy and matching, PKCE, consent-ticket signing.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** The only scope the MCP server grants (read-only journal access). */
export const MCP_SCOPE = "journal:read";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days, sliding
export const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const CONSENT_TICKET_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const REFRESH_TOKEN_PREFIX = "rpl_rt_";
export const AUTH_CODE_PREFIX = "rpl_code_";

/** Public base URL that issues tokens, e.g. https://goripple.io (no slash). */
export function oauthIssuer(env: Record<string, string | undefined> = process.env): string {
  const raw = env.OAUTH_ISSUER || env.NEXTAUTH_URL || "https://goripple.io";
  return raw.replace(/\/+$/, "");
}

/** The protected resource — exactly what users paste into Claude. */
export function mcpResourceUrl(env: Record<string, string | undefined> = process.env): string {
  return `${oauthIssuer(env)}/api/mcp`;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

// ─── Redirect URIs ───────────────────────────────────────────────────

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

/**
 * Which redirect URIs a client may register:
 *   - https, no fragment (claude.ai/api/mcp/auth_callback, ChatGPT, …)
 *   - http on a loopback host only (Claude Code, other native CLIs — RFC 8252)
 *   - a private-use app scheme (cursor://…, RFC 8252 §7.1), never a
 *     script/data/file scheme
 */
export function isAllowedRedirectUri(uri: string): boolean {
  if (typeof uri !== "string" || uri.length === 0 || uri.length > 2000) return false;
  const u = parse(uri);
  if (!u || u.hash) return false;
  if (u.protocol === "https:") return u.hostname.length > 0;
  if (u.protocol === "http:") return LOOPBACK_HOSTS.has(u.hostname);
  if (FORBIDDEN_SCHEMES.has(u.protocol)) return false;
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol);
}

/**
 * Does the redirect_uri on a request match one the client registered?
 * Exact string match, except loopback http URIs match on any port (RFC 8252
 * §7.3 — Claude Code picks a fresh port every session).
 */
export function redirectUriMatches(registered: string[], presented: string): boolean {
  if (registered.includes(presented)) return true;
  const p = parse(presented);
  if (!p || p.protocol !== "http:" || !LOOPBACK_HOSTS.has(p.hostname)) return false;
  return registered.some((r) => {
    const u = parse(r);
    return (
      !!u &&
      u.protocol === "http:" &&
      u.hostname === p.hostname &&
      u.pathname === p.pathname &&
      u.search === p.search
    );
  });
}

// ─── PKCE ────────────────────────────────────────────────────────────

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string | null | undefined): boolean {
  return typeof challenge === "string" && CHALLENGE_RE.test(challenge);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)) === challenge. */
export function verifyPkceS256(verifier: string | null | undefined, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER_RE.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Authorization request ───────────────────────────────────────────

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string | null;
}

export type AuthorizeParse =
  | { ok: true; params: AuthorizeParams }
  /** Bad client/redirect — must NOT redirect (RFC 6749 §4.1.2.1); show an error page. */
  | { ok: false; redirectable: false; message: string }
  /** Anything else — redirect back to the client with ?error=. */
  | { ok: false; redirectable: true; clientId: string; redirectUri: string; state: string | null; error: string; description: string };

/**
 * Validate the shape of an /oauth/authorize request. Client existence and
 * redirect-URI registration are checked separately (they need the DB).
 */
export function parseAuthorizeRequest(
  q: URLSearchParams,
  resourceUrl: string
): AuthorizeParse {
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const state = q.get("state");
  if (!clientId || clientId.length > 2000) {
    return { ok: false, redirectable: false, message: "Missing or invalid client_id." };
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return { ok: false, redirectable: false, message: "Missing or invalid redirect_uri." };
  }
  const back = (error: string, description: string): AuthorizeParse => ({
    ok: false,
    redirectable: true,
    clientId,
    redirectUri,
    state,
    error,
    description,
  });
  if (q.get("response_type") !== "code") {
    return back("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge = q.get("code_challenge") ?? "";
  if (!isValidCodeChallenge(codeChallenge) || q.get("code_challenge_method") !== "S256") {
    return back("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const resource = q.get("resource");
  if (resource && !sameResource(resource, resourceUrl)) {
    return back("invalid_target", "Unknown resource.");
  }
  if (state !== null && state.length > 1000) {
    return back("invalid_request", "state is too long.");
  }
  return {
    ok: true,
    params: { clientId, redirectUri, codeChallenge, state, scope: MCP_SCOPE, resource },
  };
}

/** Resource indicators compare without a trailing slash. */
export function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}

/** Build the redirect back to the client (code or error), with state + iss. */
export function buildClientRedirect(
  redirectUri: string,
  params: Record<string, string | null | undefined>
): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) u.searchParams.set(k, v);
  }
  return u.toString();
}

// ─── Consent ticket (anti-CSRF for the Approve button) ───────────────

/**
 * The consent page embeds a ticket binding the signed-in user to the exact
 * request they were shown. The approve endpoint only issues a code for a
 * valid, unexpired ticket whose user matches the session — so another site
 * can't make a signed-in user's browser approve a client for it.
 */
export function signConsentTicket(
  payload: AuthorizeParams & { userId: string },
  secret: string,
  now: number = Date.now()
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + CONSENT_TICKET_TTL_MS })
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyConsentTicket(
  ticket: string,
  secret: string,
  now: number = Date.now()
): (AuthorizeParams & { userId: string }) | null {
  if (typeof ticket !== "string") return null;
  const [body, mac] = ticket.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthorizeParams & {
      userId: string;
      exp: number;
    };
    if (typeof data.exp !== "number" || data.exp <= now) return null;
    const { exp: _exp, ...rest } = data;
    void _exp;
    return rest;
  } catch {
    return null;
  }
}

// ─── Client metadata ─────────────────────────────────────────────────

/** Is this client_id a Client ID Metadata Document URL? */
export function isCimdClientId(clientId: string): boolean {
  const u = parse(clientId);
  return !!u && u.protocol === "https:" && u.pathname.length > 1 && !u.hash;
}

/** Hosts we never fetch a metadata document from (SSRF guard). */
export function isFetchableMetadataHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) {
    return false;
  }
  // Refuse IP literals outright — legitimate clients use a domain.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return false;
  return h.includes(".");
}

/** Short, display-safe client name (it is attacker-controlled text). */
export function cleanClientName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const t = name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return t.length > 0 ? t : null;
}
