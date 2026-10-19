import "server-only";

/**
 * "Sign in with Ripple" for the Ripple MCP server — database + network side.
 * Pure rules live in ./core.ts. See that file for the overall flow.
 *
 * Tokens:
 *   - access token  = a McpAccessToken row (same verifier the MCP route
 *     already uses) with a 1-hour expiry and connectionId set.
 *   - refresh token = random secret, hash on McpConnection, rotated on every
 *     use (90-day sliding life). A replayed old refresh token is rejected.
 *   - authorization code = random secret, hash on OAuthAuthCode, single use,
 *     10 minutes, bound to client + redirect_uri + PKCE challenge.
 */

import { prisma } from "@/lib/prisma";
import { mintMcpToken } from "@/lib/mcp-token";
import { safeLog } from "@/lib/safe-log";

import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_PREFIX,
  AUTH_CODE_TTL_MS,
  MCP_SCOPE,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_MS,
  cleanClientName,
  isAllowedRedirectUri,
  isCimdClientId,
  isFetchableMetadataHost,
  mcpResourceUrl,
  randomSecret,
  redirectUriMatches,
  sameResource,
  sha256Hex,
  verifyPkceS256,
  type AuthorizeParams,
} from "./core";

// ─── Clients ─────────────────────────────────────────────────────────

export interface ResolvedClient {
  clientId: string;
  clientName: string | null;
  redirectUris: string[];
  /** How we know this client (consent page shows it). */
  kind?: "dcr" | "cimd";
  /** When it was registered / first seen. */
  createdAt?: Date;
}

export type RegisterResult =
  | { ok: true; client: ResolvedClient; issuedAt: number }
  | { ok: false; error: string; description: string };

/** RFC 7591 Dynamic Client Registration (public clients only). */
export async function registerDcrClient(body: unknown): Promise<RegisterResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (uris.length === 0 || uris.length > 10) {
    return { ok: false, error: "invalid_redirect_uri", description: "Provide 1–10 redirect_uris." };
  }
  for (const u of uris) {
    if (typeof u !== "string" || !isAllowedRedirectUri(u)) {
      return { ok: false, error: "invalid_redirect_uri", description: `Redirect URI not allowed: ${String(u).slice(0, 200)}` };
    }
  }
  const method = b.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    return {
      ok: false,
      error: "invalid_client_metadata",
      description: "Only public clients (token_endpoint_auth_method=none) are supported.",
    };
  }
  const clientId = `rpl_client_${randomSecret("").slice(0, 32)}`;
  const clientName = cleanClientName(b.client_name);
  await prisma.oAuthClient.create({
    data: { clientId, clientName, redirectUris: uris as string[], kind: "dcr" },
  });
  return { ok: true, client: { clientId, clientName, redirectUris: uris as string[] }, issuedAt: Math.floor(Date.now() / 1000) };
}

const CIMD_CACHE_MS = 24 * 60 * 60 * 1000;
const CIMD_MAX_BYTES = 64 * 1024;

/**
 * Look up a client: a registered (DCR) client by id, or — when the client_id
 * is an https URL — its Client ID Metadata Document, fetched and cached.
 */
export async function resolveClient(clientId: string): Promise<ResolvedClient | null> {
  const row = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (row && (row.kind === "dcr" || Date.now() - row.updatedAt.getTime() < CIMD_CACHE_MS)) {
    return {
      clientId: row.clientId,
      clientName: row.clientName,
      redirectUris: row.redirectUris,
      kind: row.kind === "cimd" ? "cimd" : "dcr",
      createdAt: row.createdAt,
    };
  }
  if (!isCimdClientId(clientId)) return null;

  const fetched = await fetchClientMetadata(clientId);
  if (!fetched) {
    // Serve a stale cached copy rather than fail a sign-in on a blip.
    return row
      ? { clientId: row.clientId, clientName: row.clientName, redirectUris: row.redirectUris, kind: "cimd", createdAt: row.createdAt }
      : null;
  }
  const saved = await prisma.oAuthClient.upsert({
    where: { clientId },
    create: { clientId, clientName: fetched.clientName, redirectUris: fetched.redirectUris, kind: "cimd" },
    update: { clientName: fetched.clientName, redirectUris: fetched.redirectUris },
  });
  return { ...fetched, kind: "cimd", createdAt: saved.createdAt };
}

async function fetchClientMetadata(url: string): Promise<ResolvedClient | null> {
  try {
    const u = new URL(url);
    if (!isFetchableMetadataHost(u.hostname)) return null;
    const res = await fetch(url, {
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > CIMD_MAX_BYTES) return null;
    const doc = JSON.parse(text) as Record<string, unknown>;
    if (doc.client_id !== url) return null;
    const uris = Array.isArray(doc.redirect_uris)
      ? (doc.redirect_uris as unknown[]).filter(
          (r): r is string => typeof r === "string" && isAllowedRedirectUri(r)
        )
      : [];
    if (uris.length === 0) return null;
    return { clientId: url, clientName: cleanClientName(doc.client_name), redirectUris: uris.slice(0, 20) };
  } catch (err) {
    safeLog.warn("mcp-oauth.cimd-fetch-failed", {
      url: url.slice(0, 200),
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Client exists and the redirect URI is one it registered. */
export async function checkClientAndRedirect(
  clientId: string,
  redirectUri: string
): Promise<ResolvedClient | null> {
  const client = await resolveClient(clientId);
  if (!client) return null;
  return redirectUriMatches(client.redirectUris, redirectUri) ? client : null;
}

// ─── Authorization codes ─────────────────────────────────────────────

export async function createAuthCode(userId: string, p: AuthorizeParams): Promise<string> {
  const code = randomSecret(AUTH_CODE_PREFIX);
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: sha256Hex(code),
      clientId: p.clientId,
      userId,
      redirectUri: p.redirectUri,
      codeChallenge: p.codeChallenge,
      scope: p.scope,
      resource: p.resource,
      expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return code;
}

// ─── Token endpoint ──────────────────────────────────────────────────

export interface TokenSuccess {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenResult =
  | { ok: true; body: TokenSuccess }
  | { ok: false; status: number; error: string; description: string };

const fail = (error: string, description: string, status = 400): TokenResult => ({
  ok: false,
  status,
  error,
  description,
});

/** grant_type=authorization_code */
export async function exchangeAuthCode(input: {
  code: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeVerifier: string | null;
  resource: string | null;
}): Promise<TokenResult> {
  const { code, clientId, redirectUri, codeVerifier, resource } = input;
  if (!code || !clientId || !redirectUri || !codeVerifier) {
    return fail("invalid_request", "code, client_id, redirect_uri and code_verifier are required.");
  }
  if (resource && !sameResource(resource, mcpResourceUrl())) {
    return fail("invalid_target", "Unknown resource.");
  }
  const codeHash = sha256Hex(code);
  const row = await prisma.oAuthAuthCode.findUnique({ where: { codeHash } });
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return fail("invalid_grant", "Authorization code is invalid, expired or already used.");
  }
  if (row.clientId !== clientId || row.redirectUri !== redirectUri) {
    return fail("invalid_grant", "Authorization code was issued to a different client or redirect_uri.");
  }
  if (!verifyPkceS256(codeVerifier, row.codeChallenge)) {
    return fail("invalid_grant", "PKCE verification failed.");
  }
  // Claim the code atomically — a second exchange of the same code loses.
  const claimed = await prisma.oAuthAuthCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return fail("invalid_grant", "Authorization code already used.");
  }

  const client = await resolveClient(clientId);
  const refreshToken = randomSecret(REFRESH_TOKEN_PREFIX);
  const connection = await prisma.mcpConnection.create({
    data: {
      userId: row.userId,
      clientId,
      clientName: client?.clientName ?? null,
      scope: row.scope,
      refreshTokenHash: sha256Hex(refreshToken),
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  const access = await issueAccessToken(connection.id, row.userId, connection.clientName);
  return {
    ok: true,
    body: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: row.scope,
    },
  };
}

/** grant_type=refresh_token (rotating). */
export async function refreshAccessToken(input: {
  refreshToken: string | null;
  clientId: string | null;
}): Promise<TokenResult> {
  const { refreshToken, clientId } = input;
  if (!refreshToken || !refreshToken.startsWith(REFRESH_TOKEN_PREFIX)) {
    return fail("invalid_grant", "Refresh token is invalid.");
  }
  const oldHash = sha256Hex(refreshToken);
  const conn = await prisma.mcpConnection.findUnique({ where: { refreshTokenHash: oldHash } });
  if (!conn) {
    const replayed = await prisma.mcpConnection.findUnique({
      where: { previousRefreshTokenHash: oldHash },
      select: { id: true, userId: true, revokedAt: true },
    });
    if (replayed) {
      // Replay of a rotated refresh token (OAuth 2.1 §6.1): either the
      // legitimate client lost the rotation response, or the old token was
      // stolen and is now being used by a second party. We can't tell which,
      // so the whole connection is revoked (refresh + every access token).
      // The real client re-runs the consent flow; the thief is cut off.
      // Before 2026-10-18 this only logged.
      if (!replayed.revokedAt) await revokeConnectionById(replayed.id, "refresh-replay");
      safeLog.warn("mcp-oauth.refresh-token-replayed-revoked", {
        connectionId: replayed.id,
        userId: replayed.userId,
      });
    }
    return fail("invalid_grant", "Refresh token is invalid or has been rotated.");
  }
  if (conn.revokedAt || conn.refreshExpiresAt.getTime() <= Date.now()) {
    return fail("invalid_grant", "This connection was disconnected or has expired. Connect again.");
  }
  if (clientId && clientId !== conn.clientId) {
    return fail("invalid_grant", "Refresh token was issued to a different client.");
  }

  const next = randomSecret(REFRESH_TOKEN_PREFIX);
  const rotated = await prisma.mcpConnection.updateMany({
    where: { id: conn.id, refreshTokenHash: oldHash, revokedAt: null },
    data: {
      refreshTokenHash: sha256Hex(next),
      previousRefreshTokenHash: oldHash,
      refreshExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  if (rotated.count !== 1) {
    return fail("invalid_grant", "Refresh token was already used.");
  }
  const access = await issueAccessToken(conn.id, conn.userId, conn.clientName);
  return {
    ok: true,
    body: {
      access_token: access,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: next,
      scope: conn.scope,
    },
  };
}

async function issueAccessToken(
  connectionId: string,
  userId: string,
  clientName: string | null
): Promise<string> {
  // Expired access tokens of this connection are dead weight — clear them.
  await prisma.mcpAccessToken
    .deleteMany({ where: { connectionId, expiresAt: { lt: new Date() } } })
    .catch(() => {});
  const minted = await mintMcpToken(userId, clientName ?? "Connected app", {
    connectionId,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
  });
  return minted.plaintext;
}

// ─── Connected apps (account page) ───────────────────────────────────

export interface McpConnectionSummary {
  id: string;
  clientName: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** Active connections, newest first. lastUsedAt comes from its access tokens. */
export async function listConnections(userId: string): Promise<McpConnectionSummary[]> {
  const rows = await prisma.mcpConnection.findMany({
    where: { userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      clientName: true,
      createdAt: true,
      accessTokens: {
        select: { lastUsedAt: true },
        orderBy: { lastUsedAt: { sort: "desc", nulls: "last" } },
        take: 1,
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    clientName: r.clientName,
    createdAt: r.createdAt,
    lastUsedAt: r.accessTokens[0]?.lastUsedAt ?? null,
  }));
}

/** Disconnect: stops refresh and kills every access token it issued. */
export async function revokeConnection(userId: string, id: string): Promise<boolean> {
  const now = new Date();
  const res = await prisma.mcpConnection.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: now },
  });
  if (res.count === 0) return false;
  await prisma.mcpAccessToken.updateMany({
    where: { connectionId: id, revokedAt: null },
    data: { revokedAt: now },
  });
  return true;
}

/** Server-initiated revoke (no user in hand) — refresh-token replay. */
async function revokeConnectionById(id: string, reason: string): Promise<void> {
  const now = new Date();
  await prisma.mcpConnection.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
  await prisma.mcpAccessToken.updateMany({
    where: { connectionId: id, revokedAt: null },
    data: { revokedAt: now },
  });
  safeLog.info("mcp-oauth.connection-revoked", { connectionId: id, reason });
}

export { MCP_SCOPE };
