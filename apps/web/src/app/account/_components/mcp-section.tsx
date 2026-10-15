"use client";

import { useEffect, useState } from "react";

import { Button, Card, SectionHeader } from "@/components/acuity";

/**
 * "Connect your AI" — /account section (Ripple 1.8, MCP).
 *
 * Two ways in:
 *   1. Claude (claude.ai, Desktop, mobile) — the main path. The user adds
 *      https://goripple.io/api/mcp as a custom connector and approves on
 *      /oauth/authorize ("Sign in with Ripple", lib/mcp-oauth). Those
 *      connections are listed here with Disconnect.
 *   2. Developer tools (Cursor, Claude Code, …) — mint a token by hand and
 *      paste it as a bearer header. Tucked under "Developer tools".
 * Bring-your-own-AI: the user points their OWN assistant at their OWN
 * journal, read-only.
 *
 * Self-contained — talks to /api/mcp-tokens (list/create) and
 * /api/mcp-tokens/[id] (revoke). The plaintext token is shown EXACTLY ONCE,
 * right after creation; we never have it again.
 *
 * Pro-gated: when `isProLocked`, the mint control is replaced with an
 * upgrade nudge. No "$"/price tokens here — upgrade lives at /upgrade.
 */

interface ConnectionSummary {
  id: string;
  clientName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

interface TokenSummary {
  id: string;
  prefix: string;
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
}

export interface McpSectionProps {
  isProLocked: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function McpSection({ isProLocked }: McpSectionProps) {
  const [tokens, setTokens] = useState<TokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "config" | "url" | "claude-code" | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);

  const mcpUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "https://goripple.io/api/mcp";

  async function loadConnections() {
    try {
      const res = await fetch("/api/mcp-connections");
      if (!res.ok) return;
      const data = (await res.json()) as { connections: ConnectionSummary[] };
      setConnections(data.connections);
    } catch {
      /* the token list's error message covers a broken connection */
    }
  }

  async function disconnect(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/mcp-connections/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`Could not disconnect (${res.status})`);
      setConfirmDisconnectId(null);
      await loadConnections();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disconnect");
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/mcp-tokens");
      if (!res.ok) throw new Error(`Failed to load tokens (${res.status})`);
      const data = (await res.json()) as { tokens: TokenSummary[] };
      setTokens(data.tokens);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Connections list even when locked: a lapsed user must be able to
    // see and disconnect what's connected.
    void loadConnections();
    if (!isProLocked) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProLocked]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message || `Could not create token (${res.status})`);
      }
      setFreshToken(data.token ?? null);
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/mcp-tokens/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        throw new Error(`Could not revoke (${res.status})`);
      }
      setConfirmRevokeId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke token");
    }
  }

  function copy(text: string, which: "token" | "config" | "url" | "claude-code") {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // Cursor's mcp.json format (remote server + header).
  const configSnippet = `{
  "mcpServers": {
    "ripple": {
      "url": "${mcpUrl}",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}`;
  const claudeCodeSnippet = `claude mcp add --transport http ripple ${mcpUrl} --header "Authorization: Bearer YOUR_TOKEN"`;

  return (
    <Card>
      <SectionHeader label="Connect your AI" />
      <p className="mt-2 text-sm text-acuity-text-sec">
        Point your own assistant (Claude, Cursor, ChatGPT, …) at your Ripple
        journal over MCP. It&apos;s read-only, scoped to your account, and you
        can revoke access any time. We never train on your entries.
      </p>

      {connections.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-acuity-text-sec">
            Connected apps
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-acuity-lg border border-acuity-line bg-acuity-bg-sub px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-acuity-text">{c.clientName ?? "Connected app"}</p>
                  <p className="text-xs text-acuity-text-sec">
                    Connected {relativeTime(c.createdAt)} · last used {relativeTime(c.lastUsedAt)}
                  </p>
                </div>
                {confirmDisconnectId === c.id ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="destructive" onClick={() => disconnect(c.id)}>
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnectId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDisconnectId(c.id)}>
                    Disconnect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isProLocked ? (
        <div className="mt-4 rounded-acuity-lg border border-acuity-line bg-acuity-bg-sub p-4">
          <p className="text-sm text-acuity-text">
            Connecting your own AI is a Pro feature.
          </p>
          <a
            href="/upgrade?src=mcp_section"
            className="mt-3 inline-block text-sm font-semibold text-acuity-primary hover:underline"
          >
            See Pro →
          </a>
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-acuity-lg border border-acuity-line bg-acuity-bg-sub p-4">
            <p className="text-sm font-semibold text-acuity-text">Connect Claude</p>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm text-acuity-text-sec">
              <li>
                Copy Ripple&apos;s address:
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <code className="break-all rounded-acuity-lg bg-acuity-bg-inset px-2 py-1 font-mono text-[12px] text-acuity-text">
                    {mcpUrl}
                  </code>
                  <Button size="sm" variant="secondary" onClick={() => copy(mcpUrl, "url")}>
                    {copied === "url" ? "Copied" : "Copy"}
                  </Button>
                </div>
              </li>
              <li>
                In Claude (web, desktop or phone app) open{" "}
                <a
                  href="https://claude.ai/customize/connectors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-acuity-primary hover:underline"
                >
                  Customize → Connectors
                </a>
                .
              </li>
              <li>
                Click <span className="font-semibold">Add custom connector</span>, name it
                &ldquo;Ripple&rdquo;, paste the address, and click{" "}
                <span className="font-semibold">Add</span>.
              </li>
              <li>
                Click <span className="font-semibold">Connect</span>. You&apos;ll come back to
                Ripple to approve — then ask Claude about your journal.
              </li>
            </ol>
            <p className="mt-3 text-xs text-acuity-text-sec">
              On a Claude Team or Enterprise plan, an Owner adds the connector under
              Organization settings → Connectors; then you click Connect.
            </p>
          </div>

          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-acuity-text">
              Developer tools (Cursor, Claude Code, …)
            </summary>
            <p className="mt-2 text-sm text-acuity-text-sec">
              Apps that take a header instead of a sign-in use a personal token.
            </p>
          {freshToken && (
            <div className="mt-4 rounded-acuity-lg border border-acuity-primary bg-acuity-bg-sub p-4">
              <p className="text-sm font-semibold text-acuity-text">
                Copy this token now — you won&apos;t see it again.
              </p>
              <code className="mt-2 block break-all rounded-acuity-lg bg-acuity-bg-inset p-3 font-mono text-[13px] text-acuity-text">
                {freshToken}
              </code>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => copy(freshToken, "token")}
                >
                  {copied === "token" ? "Copied" : "Copy token"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFreshToken(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. Claude Desktop)"
              maxLength={80}
              className="min-w-0 flex-1 rounded-acuity-pill border border-acuity-line bg-acuity-bg-sub px-4 py-2 text-sm text-acuity-text placeholder:text-acuity-text-sec focus:outline-none focus:ring-2 focus:ring-acuity-primary"
            />
            <Button
              size="sm"
              variant="primary"
              onClick={create}
              disabled={creating}
            >
              {creating ? "Generating…" : "Generate token"}
            </Button>
          </div>

          {error && (
            <p className="mt-3 text-sm text-acuity-bad">{error}</p>
          )}

          <div className="mt-5">
            {loading ? (
              <p className="text-sm text-acuity-text-sec">Loading…</p>
            ) : tokens.length === 0 ? (
              <p className="text-sm text-acuity-text-sec">
                No tokens yet. Generate one to connect an assistant.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {tokens.map((t) => {
                  const revoked = Boolean(t.revokedAt);
                  return (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-acuity-lg border border-acuity-line bg-acuity-bg-sub px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-acuity-text">
                          <span className="font-mono">{t.prefix}…</span>
                          {t.name ? (
                            <span className="text-acuity-text-sec">
                              {" "}
                              · {t.name}
                            </span>
                          ) : null}
                          {revoked ? (
                            <span className="text-acuity-bad"> · revoked</span>
                          ) : null}
                        </p>
                        <p className="text-xs text-acuity-text-sec">
                          {revoked
                            ? `Revoked ${relativeTime(t.revokedAt)}`
                            : `Last used ${relativeTime(t.lastUsedAt)}`}
                        </p>
                      </div>
                      {!revoked &&
                        (confirmRevokeId === t.id ? (
                          <div className="flex shrink-0 gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => revoke(t.id)}
                            >
                              Confirm
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRevokeId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmRevokeId(t.id)}
                          >
                            Revoke
                          </Button>
                        ))}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-acuity-text-sec">
              How to connect a developer tool
            </p>
            <p className="mt-1 text-sm text-acuity-text-sec">
              Cursor (<code className="font-mono">mcp.json</code>), replacing{" "}
              <code className="font-mono">YOUR_TOKEN</code>:
            </p>
            <pre className="mt-2 overflow-x-auto rounded-acuity-lg bg-acuity-bg-inset p-3 font-mono text-[12px] leading-relaxed text-acuity-text">
              {configSnippet}
            </pre>
            <div className="mt-2 flex items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => copy(configSnippet, "config")}
              >
                {copied === "config" ? "Copied" : "Copy config"}
              </Button>
            </div>
            <p className="mt-4 text-sm text-acuity-text-sec">Claude Code:</p>
            <pre className="mt-2 overflow-x-auto rounded-acuity-lg bg-acuity-bg-inset p-3 font-mono text-[12px] leading-relaxed text-acuity-text">
              {claudeCodeSnippet}
            </pre>
            <div className="mt-2 flex items-center gap-3">
              <Button size="sm" variant="secondary" onClick={() => copy(claudeCodeSnippet, "claude-code")}>
                {copied === "claude-code" ? "Copied" : "Copy command"}
              </Button>
              <span className="text-xs text-acuity-text-sec">
                Local-only (stdio) client? Bridge with{" "}
                <code className="font-mono">
                  npx mcp-remote {mcpUrl} --header &quot;Authorization: Bearer YOUR_TOKEN&quot;
                </code>
                .
              </span>
            </div>
          </div>
          </details>
        </>
      )}
    </Card>
  );
}
